using System.Text.Json;
using Jamaat.Application.Notifications;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WebPush;

namespace Jamaat.Infrastructure.Notifications;

/// VAPID-signed Web Push delivery. Backed by the `WebPush` nuget. VAPID keys live in
/// `WebPush:VapidPublicKey` and `WebPush:VapidPrivateKey` in appsettings - generated
/// once with `WebPush.VapidHelper.GenerateVapidKeys()` and pinned per environment so
/// existing subscriptions stay valid across deploys.
///
/// Failures are converted to a typed result rather than thrown so MemberNotifier can
/// reason about cleanup (404/410 from the push service = stale subscription; delete
/// the row).
public sealed class WebPushSender(
    IOptions<WebPushOptions> opts,
    ILogger<WebPushSender> logger) : IWebPushSender
{
    private readonly VapidDetails? _vapid =
        !string.IsNullOrEmpty(opts.Value.VapidPublicKey) && !string.IsNullOrEmpty(opts.Value.VapidPrivateKey)
            ? new VapidDetails(opts.Value.VapidSubject, opts.Value.VapidPublicKey, opts.Value.VapidPrivateKey)
            : null;

    public async Task<WebPushSendResult> SendAsync(
        WebPushTarget target, string title, string body, string? clickUrl, CancellationToken ct = default)
    {
        if (_vapid is null)
        {
            logger.LogDebug("Web push skipped - VAPID not configured");
            return new WebPushSendResult(false, null, "VAPID not configured");
        }

        var payload = JsonSerializer.Serialize(new { title, body, clickUrl });
        var sub = new PushSubscription(target.Endpoint, target.P256dh, target.Auth);
        var client = new WebPushClient();
        try
        {
            // The WebPush nuget's API doesn't accept a CancellationToken; the underlying
            // HTTP call respects the default HttpClient timeout instead.
#pragma warning disable CA2016 // Forward the 'CancellationToken' - not supported by upstream API
            await client.SendNotificationAsync(sub, payload, _vapid);
#pragma warning restore CA2016
            ct.ThrowIfCancellationRequested(); // surface caller cancellation post-send
            return new WebPushSendResult(true, 200, null);
        }
        catch (WebPushException ex)
        {
            // 404 / 410 indicate the subscription is gone (user revoked permission, cleared
            // browser data). Caller should delete the row. Other status codes (403, 5xx) are
            // transient or config issues; bubble them through.
            var status = (int)ex.StatusCode;
            logger.LogDebug(ex, "Web push send failed with HTTP {Status} for endpoint {Endpoint}", status, target.Endpoint);
            return new WebPushSendResult(false, status, ex.Message);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Web push send failed (non-HTTP)");
            return new WebPushSendResult(false, null, ex.Message);
        }
    }
}

public sealed class WebPushOptions
{
    public const string SectionName = "WebPush";
    public string VapidPublicKey { get; set; } = "";
    public string VapidPrivateKey { get; set; } = "";
    /// Required by Web Push spec - the contact for the push service to reach you (sysadmin
    /// email or the public app URL). Use a stable value; changing it invalidates VAPID.
    public string VapidSubject { get; set; } = "mailto:noreply@jamaat.local";
}
