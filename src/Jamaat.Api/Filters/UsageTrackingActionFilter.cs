using System.Diagnostics;
using System.Security.Claims;
using Jamaat.Application.Analytics;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Jamaat.Api.Filters;

/// <summary>Emits a UsageEvent for every authenticated controller action invocation. Runs
/// once per request via OnActionExecutionAsync, captures duration with a Stopwatch, and
/// fire-and-forget enqueues into the bounded usage-event queue. The hosted flush service
/// drains the queue in batches.
///
/// Skipped paths: setup probes (anonymous, no useful signal), health checks (already
/// noisy), the analytics endpoints themselves (would feedback-loop the dashboard's own
/// polling into the data we're trying to surface), and the system endpoints (operator
/// monitoring shouldn't pollute usage data).</summary>
public sealed class UsageTrackingActionFilter(IUsageEventQueue queue, ITenantContext tenant) : IAsyncActionFilter
{
    private static readonly string[] SkipPathPrefixes =
    [
        "/api/v1/setup",
        "/api/v1/system",
        "/api/v1/usage",
        "/health",
    ];

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var sw = Stopwatch.StartNew();
        var executed = await next();
        sw.Stop();

        try
        {
            var http = context.HttpContext;
            var path = http.Request.Path.Value ?? "";
            foreach (var p in SkipPathPrefixes)
            {
                if (path.StartsWith(p, StringComparison.OrdinalIgnoreCase)) return;
            }

            // Anonymous traffic has nothing tenant-scoped to attach to. We could route under
            // the configured default tenant but it muddles the analytics. Skip.
            if (http.User.Identity?.IsAuthenticated != true) return;

            // TenantContext might be unset if the request was anonymous-allow even though the
            // user is authenticated; bail rather than write a Guid.Empty row.
            var tid = tenant.TenantId;
            if (tid == Guid.Empty) return;

            var idClaim = http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                          ?? http.User.FindFirst("sub")?.Value;
            Guid? userId = Guid.TryParse(idClaim, out var u) ? u : null;

            var module = ExtractModule(path);
            var actionDesc = context.ActionDescriptor as Microsoft.AspNetCore.Mvc.Controllers.ControllerActionDescriptor;
            var actionName = actionDesc is null
                ? "Unknown"
                : $"{actionDesc.ControllerName}.{actionDesc.ActionName}";

            var ip = http.Connection.RemoteIpAddress?.ToString();
            var ua = http.Request.Headers.UserAgent.ToString();
            if (string.IsNullOrWhiteSpace(ua)) ua = null;

            // StatusCode: take from the action result if it set one, else fall back to 200.
            // OnActionExecutedContext.HttpContext.Response.StatusCode is the response code at
            // this point, but later filters / formatters can change it; for analytics 'good enough'.
            var status = http.Response.StatusCode;

            var evt = UsageEvent.ForAction(
                tenantId: tid,
                userId: userId,
                path: path,
                module: module,
                action: actionName,
                httpMethod: http.Request.Method,
                statusCode: status,
                durationMs: (int)sw.ElapsedMilliseconds,
                ipAddress: ip,
                userAgent: ua,
                occurredAtUtc: DateTimeOffset.UtcNow);

            queue.TryEnqueue(evt);
        }
        catch
        {
            // Telemetry must never break the request. Swallow and move on.
        }

        // suppress unused-variable warnings
        _ = executed;
    }

    /// <summary>"/api/v1/members/{id}" -> "members". Coarse module bucket pre-computed at
    /// write time so the analytics aggregations don't have to string-split across millions
    /// of rows.</summary>
    private static string ExtractModule(string path)
    {
        if (string.IsNullOrEmpty(path)) return "";
        // Skip "/api/vN/" prefix
        var s = path.AsSpan();
        if (s.StartsWith("/")) s = s[1..];
        if (s.StartsWith("api/", StringComparison.OrdinalIgnoreCase)) s = s["api/".Length..];
        // skip version segment
        var firstSlash = s.IndexOf('/');
        if (firstSlash > 0 && s[0] == 'v')
        {
            var rest = s[(firstSlash + 1)..];
            var nextSlash = rest.IndexOf('/');
            return nextSlash > 0 ? rest[..nextSlash].ToString() : rest.ToString();
        }
        var slash = s.IndexOf('/');
        return slash > 0 ? s[..slash].ToString() : s.ToString();
    }
}
