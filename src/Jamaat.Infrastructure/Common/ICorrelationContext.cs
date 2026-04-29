using Jamaat.Domain.Abstractions;

namespace Jamaat.Infrastructure.Common;

public interface ICorrelationContext
{
    string CorrelationId { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }
}

/// Implements both the Infrastructure-level correlation context (used by middleware/logging)
/// and the Domain-level IRequestContext (so Application services can capture IP/UA without
/// taking a dependency on Infrastructure or HttpContext).
public sealed class CorrelationContext : ICorrelationContext, IRequestContext
{
    public string CorrelationId { get; set; } = Guid.NewGuid().ToString("N");
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}
