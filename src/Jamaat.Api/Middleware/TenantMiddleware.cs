using System.Security.Claims;
using Jamaat.Infrastructure.MultiTenancy;
using Serilog.Context;

namespace Jamaat.Api.Middleware;

/// Resolves the current tenant for the request. Order of precedence:
/// (1) 'tenant_id' JWT claim, (2) X-Tenant-Id header, (3) default tenant from config.
public sealed class TenantMiddleware
{
    private const string HeaderName = "X-Tenant-Id";
    private readonly RequestDelegate _next;
    private readonly Guid _defaultTenantId;

    public TenantMiddleware(RequestDelegate next, IConfiguration config)
    {
        _next = next;
        _defaultTenantId = Guid.TryParse(config["MultiTenancy:DefaultTenantId"], out var g) ? g : Guid.Empty;
    }

    public async Task InvokeAsync(HttpContext context, TenantContext tenantContext)
    {
        Guid tenantId = _defaultTenantId;

        var claim = context.User.FindFirstValue("tenant_id");
        if (Guid.TryParse(claim, out var claimTenant)) tenantId = claimTenant;
        else if (context.Request.Headers.TryGetValue(HeaderName, out var headerValue) &&
                 Guid.TryParse(headerValue, out var headerTenant))
            tenantId = headerTenant;

        tenantContext.SetTenant(tenantId);

        using (LogContext.PushProperty("TenantId", tenantId))
        {
            await _next(context);
        }
    }
}
