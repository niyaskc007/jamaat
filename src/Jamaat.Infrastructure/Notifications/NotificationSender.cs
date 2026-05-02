using System.Net;
using System.Net.Mail;
using Jamaat.Application.Notifications;
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
    IOptionsMonitor<SmsOptions> smsOpts,
    IOptionsMonitor<WhatsAppOptions> waOpts,
    CompositeSmsSender smsSender,
    CompositeWhatsAppSender waSender,
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
        // Channel selection - explicit override wins, otherwise pick the most-direct channel
        // we have credentials + recipient address for. Fallback chain: WhatsApp -> SMS -> Email
        // -> log-only. Most member-facing notifications (welcome, temp pw) prefer SMS so the
        // member can read it on their phone the moment the admin enables their login.
        var resolved = ResolveChannel(message);

        switch (resolved)
        {
            case NotificationChannel.WhatsApp:
                return await DeliverWhatsAppAsync(message, ct);
            case NotificationChannel.Sms:
                return await DeliverSmsAsync(message, ct);
            case NotificationChannel.Email:
                if (string.IsNullOrWhiteSpace(message.RecipientEmail))
                    return (NotificationChannel.LogOnly, NotificationStatus.Skipped, "No recipient email on file.");
                if (!_options.IsSmtpReady)
                    return (NotificationChannel.LogOnly, NotificationStatus.Sent, null);
                return await DeliverEmailAsync(message, ct);
            default:
                // log-only - nothing to attempt, audit row still written.
                return (NotificationChannel.LogOnly, NotificationStatus.Sent, null);
        }
    }

    private NotificationChannel ResolveChannel(NotificationMessage message)
    {
        // Explicit override wins - caller knows what they want.
        if (message.PreferredChannel is { } forced) return forced;

        var hasPhone = !string.IsNullOrWhiteSpace(message.RecipientPhoneE164);
        var hasEmail = !string.IsNullOrWhiteSpace(message.RecipientEmail);
        var waReady = !string.IsNullOrWhiteSpace(waOpts.CurrentValue.Provider);
        var smsReady = !string.IsNullOrWhiteSpace(smsOpts.CurrentValue.Provider);

        if (hasPhone && waReady) return NotificationChannel.WhatsApp;
        if (hasPhone && smsReady) return NotificationChannel.Sms;
        if (hasEmail && _options.IsSmtpReady) return NotificationChannel.Email;
        return NotificationChannel.LogOnly;
    }

    private async Task<(NotificationChannel, NotificationStatus, string?)> DeliverSmsAsync(NotificationMessage message, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(message.RecipientPhoneE164))
            return (NotificationChannel.Sms, NotificationStatus.Skipped, "No recipient phone on file.");
        var body = string.IsNullOrWhiteSpace(message.Subject) ? message.Body : $"{message.Subject}\n\n{message.Body}";
        var outcome = await smsSender.SendAsync(message.RecipientPhoneE164, body, ct);
        return outcome.Success
            ? (NotificationChannel.Sms, NotificationStatus.Sent, null)
            : (NotificationChannel.Sms, NotificationStatus.Failed, outcome.ErrorDetail);
    }

    private async Task<(NotificationChannel, NotificationStatus, string?)> DeliverWhatsAppAsync(NotificationMessage message, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(message.RecipientPhoneE164))
            return (NotificationChannel.WhatsApp, NotificationStatus.Skipped, "No recipient phone on file.");
        var body = string.IsNullOrWhiteSpace(message.Subject) ? message.Body : $"*{message.Subject}*\n\n{message.Body}";
        var outcome = await waSender.SendAsync(message.RecipientPhoneE164, body, ct);
        return outcome.Success
            ? (NotificationChannel.WhatsApp, NotificationStatus.Sent, null)
            : (NotificationChannel.WhatsApp, NotificationStatus.Failed, outcome.ErrorDetail);
    }

    private async Task<(NotificationChannel, NotificationStatus, string?)> DeliverEmailAsync(NotificationMessage message, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(message.RecipientEmail))
            return (NotificationChannel.Email, NotificationStatus.Skipped, "No recipient email on file.");
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
