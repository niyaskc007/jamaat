using Jamaat.Domain.Abstractions;

namespace Jamaat.Infrastructure.MultiTenancy;

/// HTTP-scoped tenant context. Resolved by TenantMiddleware in the API layer.
public sealed class TenantContext : ITenantContext
{
    public Guid TenantId { get; private set; } = Guid.Empty;
    public bool IsResolved => TenantId != Guid.Empty;

    public void SetTenant(Guid tenantId) => TenantId = tenantId;
}
