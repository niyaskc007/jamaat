using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Per-guarantor consent record for a Qarzan Hasana loan. One row exists for each of the loan's
/// two guarantors. A secure single-use token gives the guarantor a public link they can open
/// without logging in (the token IS the credential). Status moves from Pending -> Accepted /
/// Declined when the guarantor responds; a swap on the loan voids the existing record and a
/// fresh one is generated for the new guarantor.
/// </summary>
/// <remarks>
/// Audit trail: the AuditInterceptor captures every state transition. We additionally store the
/// IP / user-agent at response time so a defensive review can show "this acceptance came from a
/// browser at IP 198.51.100.12 on this date".
/// </remarks>
public sealed class QarzanHasanaGuarantorConsent : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private QarzanHasanaGuarantorConsent() { }

    public QarzanHasanaGuarantorConsent(Guid id, Guid tenantId, Guid loanId, Guid guarantorMemberId, string token, DateTimeOffset createdAt)
    {
        if (loanId == Guid.Empty) throw new ArgumentException("LoanId required.", nameof(loanId));
        if (guarantorMemberId == Guid.Empty) throw new ArgumentException("GuarantorMemberId required.", nameof(guarantorMemberId));
        if (string.IsNullOrWhiteSpace(token)) throw new ArgumentException("Token required.", nameof(token));

        Id = id;
        TenantId = tenantId;
        LoanId = loanId;
        GuarantorMemberId = guarantorMemberId;
        Token = token;
        Status = QhGuarantorConsentStatus.Pending;
        CreatedAtUtc = createdAt;
    }

    public Guid TenantId { get; private set; }
    public Guid LoanId { get; private set; }
    public Guid GuarantorMemberId { get; private set; }
    /// <summary>Opaque single-use credential. Anyone holding the token can record a response on
    /// behalf of the guarantor; the operator copies this to the guarantor via SMS / WhatsApp /
    /// email when the SMTP/SMS rails aren't wired up to send it automatically.</summary>
    public string Token { get; private set; } = default!;
    public QhGuarantorConsentStatus Status { get; private set; }
    public DateTimeOffset? RespondedAtUtc { get; private set; }
    public string? ResponderIpAddress { get; private set; }
    public string? ResponderUserAgent { get; private set; }
    public DateTimeOffset? NotificationSentAtUtc { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Accept(string? ipAddress, string? userAgent, DateTimeOffset at)
    {
        if (Status != QhGuarantorConsentStatus.Pending)
            throw new InvalidOperationException($"Consent already {Status} - cannot change.");
        Status = QhGuarantorConsentStatus.Accepted;
        RespondedAtUtc = at;
        ResponderIpAddress = Truncate(ipAddress, 64);
        ResponderUserAgent = Truncate(userAgent, 500);
    }

    public void Decline(string? ipAddress, string? userAgent, DateTimeOffset at)
    {
        if (Status != QhGuarantorConsentStatus.Pending)
            throw new InvalidOperationException($"Consent already {Status} - cannot change.");
        Status = QhGuarantorConsentStatus.Declined;
        RespondedAtUtc = at;
        ResponderIpAddress = Truncate(ipAddress, 64);
        ResponderUserAgent = Truncate(userAgent, 500);
    }

    public void MarkNotificationSent(DateTimeOffset at)
    {
        NotificationSentAtUtc = at;
    }

    private static string? Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) ? null : (value.Length > max ? value[..max] : value);
}
