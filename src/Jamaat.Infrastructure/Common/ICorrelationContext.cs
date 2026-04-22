namespace Jamaat.Infrastructure.Common;

public interface ICorrelationContext
{
    string CorrelationId { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }
}

public sealed class CorrelationContext : ICorrelationContext
{
    public string CorrelationId { get; set; } = Guid.NewGuid().ToString("N");
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}
