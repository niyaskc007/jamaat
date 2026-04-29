namespace Jamaat.Infrastructure.Notifications;

/// <summary>
/// Master switch + SMTP config for outbound notifications. When <see cref="Enabled"/> is
/// false, the LogOnlyNotificationSender writes every notification to NotificationLog without
/// attempting delivery. When Enabled is true and SMTP host is set, SmtpEmailNotificationSender
/// takes over and attempts real email delivery (still falling back to log-only on failure).
/// Bound from appsettings section "Notifications".
/// </summary>
public sealed class NotificationSenderOptions
{
    public const string SectionName = "Notifications";

    /// <summary>Master kill-switch. Default false so existing deployments don't start spamming
    /// inboxes the moment this code lands; admin opts in via configuration.</summary>
    public bool Enabled { get; set; }

    public SmtpOptions Smtp { get; set; } = new();

    /// <summary>Friendly From-name on outbound email (e.g. "Jamaat Treasury").</summary>
    public string FromName { get; set; } = "Jamaat";
    /// <summary>Email address used as the From address. Required when SMTP is enabled.</summary>
    public string FromEmail { get; set; } = string.Empty;

    /// <summary>True when SMTP delivery is wired up - i.e. master switch is on AND host
    /// + port + from-email are present. Senders use this to decide between log-only and
    /// real delivery without re-checking individual fields.</summary>
    public bool IsSmtpReady => Enabled
        && !string.IsNullOrWhiteSpace(Smtp.Host)
        && Smtp.Port > 0
        && !string.IsNullOrWhiteSpace(FromEmail);
}

public sealed class SmtpOptions
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string? Username { get; set; }
    public string? Password { get; set; }
    /// <summary>STARTTLS / SSL toggle. Most modern SMTP servers want this true on port 587 / 465.</summary>
    public bool UseSsl { get; set; } = true;
}
