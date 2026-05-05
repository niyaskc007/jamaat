using System.Text.Json;
using System.Text.Json.Serialization;
using Jamaat.Application.Cms;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Cms;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Application.Notifications;

/// Member-facing notifications. Wraps INotificationSender with template lookup (from CMS
/// blocks) and per-member preference filtering. Not intended for one-off operator emails -
/// those keep using INotificationSender directly with hardcoded subject/body.
public interface IMemberNotifier
{
    /// Send a notification of the given kind to a member, substituting template variables
    /// from the supplied dictionary. Honours member opt-out + channel preference. No-op if
    /// the member has muted this kind.
    Task NotifyAsync(Guid memberId, MemberNotificationKind kind, IDictionary<string, string> vars, CancellationToken ct = default);
}

/// Coarse member-facing notification categories. Each maps to a pair of CmsBlock keys
/// (notif.{kind}.subject, notif.{kind}.body) and a per-member preference flag. Distinct
/// from the existing infrastructure NotificationKind enum which covers operator alerts -
/// keep the two namespaces separate so admin email templates don't bleed into the member
/// portal preferences UI.
public enum MemberNotificationKind
{
    CommitmentInstallmentDue = 1,  // Daily T-3d scan
    QhStateChanged           = 2,  // Inline on QH service state transitions
    EventReminderT24h        = 3,  // Daily T-24h scan
}

/// Per-member preferences. Persisted as JSON in Member.NotificationPreferencesJson.
/// `null` = use defaults (all enabled, auto-channel). Producers of this should write back
/// via Member.SetNotificationPreferencesJson(json).
public sealed class MemberNotificationPreferences
{
    [JsonPropertyName("enabledKinds")]
    public Dictionary<string, bool> EnabledKinds { get; set; } = new();

    [JsonPropertyName("preferredChannel")]
    public string? PreferredChannel { get; set; }   // "Email" / "Sms" / "WhatsApp" / null = auto

    public static MemberNotificationPreferences FromJson(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? new MemberNotificationPreferences()
            : (JsonSerializer.Deserialize<MemberNotificationPreferences>(json) ?? new MemberNotificationPreferences());

    public string ToJson() => JsonSerializer.Serialize(this);

    public bool IsEnabled(MemberNotificationKind kind)
    {
        if (EnabledKinds is null || EnabledKinds.Count == 0) return true; // default = enabled
        return !EnabledKinds.TryGetValue(kind.ToString(), out var v) || v;
    }
}

public sealed class MemberNotifier(
    JamaatDbContextFacade db,
    ICmsService cms,
    INotificationSender sender,
    ILogger<MemberNotifier> logger) : IMemberNotifier
{
    public async Task NotifyAsync(Guid memberId, MemberNotificationKind kind, IDictionary<string, string> vars, CancellationToken ct = default)
    {
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) { logger.LogWarning("MemberNotifier: member {Id} not found", memberId); return; }

        var prefs = MemberNotificationPreferences.FromJson(member.NotificationPreferencesJson);
        if (!prefs.IsEnabled(kind))
        {
            logger.LogInformation("MemberNotifier: member {Id} muted {Kind}", memberId, kind);
            return;
        }

        var subjectKey = $"notif.{KeyFor(kind)}.subject";
        var bodyKey    = $"notif.{KeyFor(kind)}.body";
        var subjectBlock = await cms.GetBlockAsync(subjectKey, ct);
        var bodyBlock    = await cms.GetBlockAsync(bodyKey, ct);

        // Fall back to a minimal generic subject/body if templates aren't seeded. The seeder
        // installs defaults; this branch protects against a missing-template deployment.
        var subjectTemplate = subjectBlock?.Value ?? $"Update: {kind}";
        var bodyTemplate    = bodyBlock?.Value    ?? $"Salaam, you have an update of type {kind}.";

        var subject = Substitute(subjectTemplate, vars);
        var body    = Substitute(bodyTemplate, vars);

        var preferred = ParseChannel(prefs.PreferredChannel);

        // Resolve a recipient identity. Prefer the linked ApplicationUser's UserId on the
        // notification (matches existing UserWelcome shape); fall back to email/phone from
        // the Member record. Audit reference uses the MemberNotificationKind as the
        // SourceReference for filterability in NotificationLog.
        var msg = new NotificationMessage(
            Kind: ToInfraKind(kind),
            Subject: subject,
            Body: body,
            RecipientEmail: member.Email,
            RecipientUserId: null,
            SourceId: memberId,
            SourceReference: kind.ToString(),
            RecipientPhoneE164: member.WhatsAppNo ?? member.Phone,
            PreferredChannel: preferred);

        try { await sender.SendAsync(msg, ct); }
        catch (Exception ex) { logger.LogWarning(ex, "MemberNotifier: send failed for member {Id} kind {Kind}", memberId, kind); }
    }

    private static string KeyFor(MemberNotificationKind kind) => kind switch
    {
        MemberNotificationKind.CommitmentInstallmentDue => "commitment.due",
        MemberNotificationKind.QhStateChanged           => "qh.state",
        MemberNotificationKind.EventReminderT24h        => "event.reminder",
        _ => kind.ToString().ToLowerInvariant(),
    };

    private static NotificationKind ToInfraKind(MemberNotificationKind kind) => kind switch
    {
        // The infrastructure enum is operator-flavoured; we reuse the closest-fit values
        // for routing/audit purposes. Per-member subdivision lives in SourceReference.
        MemberNotificationKind.QhStateChanged => NotificationKind.QhLoanDisbursed,
        _ => NotificationKind.SystemAlert,
    };

    private static NotificationChannel? ParseChannel(string? raw) => raw switch
    {
        "Email"    => NotificationChannel.Email,
        "Sms"      => NotificationChannel.Sms,
        "WhatsApp" => NotificationChannel.WhatsApp,
        _ => null,
    };

    /// Tiny moustache-style substitution. Replaces `{{ key }}` (any whitespace tolerated)
    /// with the value from vars. Missing keys collapse to empty - a missing fallback is
    /// safer than printing "{{ key }}" in a customer-facing email.
    internal static string Substitute(string template, IDictionary<string, string> vars)
    {
        if (string.IsNullOrEmpty(template) || vars is null || vars.Count == 0) return template ?? "";
        var sb = new System.Text.StringBuilder(template.Length);
        var i = 0;
        while (i < template.Length)
        {
            if (i + 1 < template.Length && template[i] == '{' && template[i + 1] == '{')
            {
                var end = template.IndexOf("}}", i + 2, StringComparison.Ordinal);
                if (end > 0)
                {
                    var key = template.Substring(i + 2, end - i - 2).Trim();
                    sb.Append(vars.TryGetValue(key, out var v) ? v : "");
                    i = end + 2;
                    continue;
                }
            }
            sb.Append(template[i]);
            i++;
        }
        return sb.ToString();
    }
}
