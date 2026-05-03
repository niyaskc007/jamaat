using System.Security.Claims;
using Jamaat.Application.SystemMonitor;

namespace Jamaat.Api.Middleware;

/// <summary>Updates the in-memory <see cref="IUserActivityTracker"/> on every request. Bumps
/// the global request counter (used for req/min trend) and, when the request carries an
/// authenticated principal, records the user's last-seen.
///
/// Cheap by design: two ConcurrentDictionary touches and an Interlocked.Increment per request.
/// Runs after authentication so context.User has the JWT claims we look up here.</summary>
public sealed class ActivityTrackerMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IUserActivityTracker tracker)
    {
        // Always bump the global rate counter regardless of auth. Anonymous traffic is still
        // useful signal (e.g. login page hits, /setup probes).
        tracker.RecordRequest();

        // Skip noisy paths from the per-user tracking. Health probes shouldn't make every
        // service-account look perpetually online.
        var path = context.Request.Path.Value;
        var skipUser = path is not null
            && (path.StartsWith("/health/", StringComparison.OrdinalIgnoreCase)
                || path.Equals("/health", StringComparison.OrdinalIgnoreCase));

        if (!skipUser && context.User.Identity?.IsAuthenticated == true)
        {
            var idClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                          ?? context.User.FindFirst("sub")?.Value;
            if (Guid.TryParse(idClaim, out var userId))
            {
                var name = context.User.FindFirst(ClaimTypes.Name)?.Value
                           ?? context.User.FindFirst(ClaimTypes.Email)?.Value
                           ?? context.User.FindFirst("email")?.Value;
                var ip = context.Connection.RemoteIpAddress?.ToString();
                var ua = context.Request.Headers.UserAgent.ToString();
                if (string.IsNullOrWhiteSpace(ua)) ua = null;
                tracker.Record(userId, name, ip, ua);
            }
        }

        await next(context);
    }
}
