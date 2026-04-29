using System.Net;
using System.Net.Mail;
using Jamaat.Application.Persistence;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Notifications;

/// <summary>
/// Single notification sender that adapts behaviour based on configuration. Always writes
/// the audit row to NotificationLog; conditionally attempts SMTP delivery when Notifications
/// are Enabled + SMTP is configured.
/// </summary>
/// <remarks>
/// Designed to be safe in the calling transaction: catches every exception, records it on
/// the NotificationLog row as Failed, and never bubbles up. A flaky SMTP can never block a
/// receipt confirmation. Notification work runs on its own SaveChanges to avoid coupling
/// with the caller's UoW commit/rollback - even if the caller rolls back, we keep the
/// audit trail of what was attempted.
/// </remarks>
public sealed class NotificationSender(
    JamaatDbContextFacade db,
    ITenantContext tenant,
    IClock clock,
    IOptions<NotificationSenderOptions> options,
    ILogger<NotificationSender> logger) : INotificationSender
{
    private readonly NotificationSenderOptions _options = options.Value;

    public async Task SendAsync(NotificationMessage message, CancellationToken ct = default)
    {
        var (channel, status, failure) = await TryDeliverAsync(message, ct);
        var log = new NotificationLog(
            tenantId: tenant.TenantId,
            kind: message.Kind,
            channel: channel,
            status: status,
            subject: Trim(message.Subject, 500),
            body: message.Body,
            recipient: message.RecipientEmail,
            recipientUserId: message.RecipientUserId,
            sourceId: message.SourceId,
            sourceReference: message.SourceReference,
            failureReason: failure is null ? null : Trim(failure, 2000),
            attemptedAtUtc: clock.UtcNow);
        db.NotificationLogs.Add(log);
        try { await db.SaveChangesAsync(ct); }
        catch (Exception ex) { logger.LogError(ex, "Failed to persist NotificationLog row for {Kind}", message.Kind); }
    }

    private async Task<(NotificationChannel, NotificationStatus, string?)> TryDeliverAsync(NotificationMessage message, CancellationToken ct)
    {
        // No recipient = nothing to deliver - record as Skipped so a missing-email-on-file
        // case doesn't show up as Failed in the dashboard.
        if (string.IsNullOrWhiteSpace(message.RecipientEmail))
        {
            return (NotificationChannel.LogOnly, NotificationStatus.Skipped,
                "No recipient email on file.");
        }

        // SMTP not configured -> we're in audit-only mode. Still considered "Sent" because
        // there was nothing to fail at.
        if (!_options.IsSmtpReady)
        {
            return (NotificationChannel.LogOnly, NotificationStatus.Sent, null);
        }

        try
        {
            using var smtp = new SmtpClient(_options.Smtp.Host, _options.Smtp.Port)
            {
                EnableSsl = _options.Smtp.UseSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false,
            };
            if (!string.IsNullOrWhiteSpace(_options.Smtp.Username))
            {
                smtp.Credentials = new NetworkCredential(_options.Smtp.Username, _options.Smtp.Password ?? "");
            }
            using var msg = new MailMessage(
                from: new MailAddress(_options.FromEmail, _options.FromName),
                to: new MailAddress(message.RecipientEmail))
            {
                Subject = message.Subject,
                Body = message.Body,
                IsBodyHtml = false,
            };
            await smtp.SendMailAsync(msg, ct);
            return (NotificationChannel.Email, NotificationStatus.Sent, null);
        }
        catch (Exception ex)
        {
            // Never bubble up - fire-and-forget semantics so the caller's transaction is not
            // affected by SMTP flakiness. The failure is recorded on the log row.
            logger.LogWarning(ex, "Notification SMTP delivery failed for {Kind} -> {Recipient}",
                message.Kind, message.RecipientEmail);
            return (NotificationChannel.Email, NotificationStatus.Failed, ex.Message);
        }
    }

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..max];
}
