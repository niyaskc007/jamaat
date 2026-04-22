using Jamaat.Infrastructure.Common;
using Serilog.Context;

namespace Jamaat.Api.Middleware;

/// Assigns a correlation ID (from header X-Correlation-Id, or generates one) to
/// the request scope. Pushes it into Serilog context so every log line is
/// tagged, and echoes it back on the response.
public sealed class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, CorrelationContext correlation)
    {
        var id = context.Request.Headers.TryGetValue(HeaderName, out var existing) && !string.IsNullOrWhiteSpace(existing)
            ? existing.ToString()
            : Guid.NewGuid().ToString("N");

        correlation.CorrelationId = id;
        correlation.IpAddress = context.Connection.RemoteIpAddress?.ToString();
        correlation.UserAgent = context.Request.Headers.UserAgent.ToString();

        context.Response.Headers[HeaderName] = id;

        using (LogContext.PushProperty("CorrelationId", id))
        using (LogContext.PushProperty("RequestPath", context.Request.Path.Value))
        using (LogContext.PushProperty("RequestMethod", context.Request.Method))
        {
            await _next(context);
        }
    }
}
