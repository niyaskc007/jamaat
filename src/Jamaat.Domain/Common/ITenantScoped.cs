namespace Jamaat.Domain.Common;

/// Marker interface for entities scoped to a tenant. EF global query filter keys off this.
public interface ITenantScoped
{
    Guid TenantId { get; }
}
