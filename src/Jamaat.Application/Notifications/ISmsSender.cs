namespace Jamaat.Application.Notifications;

/// Abstraction over an SMS gateway. Implementations register under a provider key
/// (`Twilio`, `Unifonic`, `Infobip`, etc.); the active one is picked at runtime by
/// `SmsOptions.Provider`. Failures must NOT throw — return a Result-like SmsSendOutcome.
public interface ISmsSender
{
    /// Provider name this implementation handles. Must match SmsOptions.Provider for it to
    /// be selected. Case-insensitive comparison.
    string ProviderName { get; }
    Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default);
}

public sealed record SmsSendOutcome(bool Success, string? ProviderMessageId, string? ErrorDetail);

/// Optional WhatsApp companion - same shape as SMS, but providers (Twilio Business API,
/// Infobip WhatsApp) require pre-approved templates for outbound messages outside a 24-hour
/// session window. Implementations should accept either a plain message OR a template id.
public interface IWhatsAppSender
{
    string ProviderName { get; }
    Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default);
}

public sealed class SmsOptions
{
    public const string SectionName = "Sms";
    /// One of: Twilio, Unifonic, Infobip, Plivo. Empty = SMS disabled (notifications fall back
    /// to email + log-only). Configurable from the integration panel; users can supply their
    /// own credentials at runtime without a redeploy.
    public string? Provider { get; set; }
    public string? FromNumber { get; set; }
    /// Provider-specific credentials; only the relevant fields for the active Provider are used.
    public string? TwilioAccountSid { get; set; }
    public string? TwilioAuthToken { get; set; }
    public string? UnifonicAppSid { get; set; }
    public string? UnifonicSenderId { get; set; }
    public string? InfobipApiKey { get; set; }
    public string? InfobipBaseUrl { get; set; } // e.g. https://xxxxxx.api.infobip.com
    public string? PlivoAuthId { get; set; }
    public string? PlivoAuthToken { get; set; }
}

public sealed class WhatsAppOptions
{
    public const string SectionName = "WhatsApp";
    /// "Twilio" (sandbox or production WhatsApp Business). Empty = disabled.
    public string? Provider { get; set; }
    public string? FromNumber { get; set; } // E.164, no `whatsapp:` prefix - we add it.
    public string? TwilioAccountSid { get; set; }
    public string? TwilioAuthToken { get; set; }
}
