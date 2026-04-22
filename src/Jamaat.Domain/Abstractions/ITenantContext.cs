namespace Jamaat.Domain.Abstractions;

/// Resolved per request from JWT claim / header / default. Used by EF global query filter
/// and by application services that must scope data to the current tenant.
public interface ITenantContext
{
    Guid TenantId { get; }
    bool IsResolved { get; }
}
