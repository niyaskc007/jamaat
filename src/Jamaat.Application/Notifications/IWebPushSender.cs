namespace Jamaat.Application.Notifications;

/// Phase N - browser Web Push delivery. Wraps a VAPID-authenticated WebPush.Client so
/// callers don't need to know about VAPID details, public/private keys, or URI schemes.
/// MemberNotifier resolves the user's stored PushSubscription rows and fans out via this.
///
/// Implementation lives in Infrastructure (Notifications/WebPushSender.cs) so the WebPush
/// nuget reference doesn't bleed into Application.
public interface IWebPushSender
{
    /// Send the given title + body payload to a single subscription. Returns the
    /// HTTP status the push service responded with (404/410 means stale - caller
    /// should delete the subscription row).
    Task<WebPushSendResult> SendAsync(
        WebPushTarget target,
        string title,
        string body,
        string? clickUrl,
        CancellationToken ct = default);
}

public sealed record WebPushTarget(string Endpoint, string P256dh, string Auth);

public sealed record WebPushSendResult(bool Success, int? HttpStatus, string? Error);
