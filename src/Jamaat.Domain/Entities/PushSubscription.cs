using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// Per-(user, browser) Web Push subscription. Created when the member opts in via the
/// notifications preferences tab; deleted when they opt out OR when a send fails with a
/// 404/410 from the push service (= the user removed the site / cleared storage).
///
/// One user can have multiple active subscriptions (phone Chrome + desktop Firefox);
/// MemberNotifier fans out to all of them when sending a Push notification.
public sealed class PushSubscription : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private PushSubscription() { }

    public PushSubscription(Guid id, Guid tenantId, Guid userId, Guid? memberId, string endpoint, string p256dh, string auth, string? userAgent)
    {
        Id = id;
        TenantId = tenantId;
        UserId = userId;
        MemberId = memberId;
        Endpoint = endpoint;
        P256dh = p256dh;
        Auth = auth;
        UserAgent = userAgent;
    }

    public Guid TenantId { get; private set; }
    public Guid UserId { get; private set; }
    /// Resolved at subscribe time from the user's ITS number. Lets MemberNotifier fan
    /// out by member id without doing the ApplicationUser lookup on every send.
    public Guid? MemberId { get; private set; }
    /// Push service URL (FCM, Mozilla, Apple, etc.). The browser hands this to us at
    /// subscribe time; the WebPush library uses it as the destination.
    public string Endpoint { get; private set; } = default!;
    /// P-256 ECDH public key for VAPID encryption. Base64URL encoded.
    public string P256dh { get; private set; } = default!;
    /// Per-subscription auth secret for VAPID encryption. Base64URL encoded.
    public string Auth { get; private set; } = default!;
    /// Captured at subscribe time so admins can identify which device an entry belongs to.
    public string? UserAgent { get; private set; }
    public DateTimeOffset? LastUsedAtUtc { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void TouchLastUsed(DateTimeOffset at) => LastUsedAtUtc = at;
}
