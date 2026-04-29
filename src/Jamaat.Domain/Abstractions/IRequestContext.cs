namespace Jamaat.Domain.Abstractions;

/// Surfaces request-scoped network metadata (IP + User-Agent) into Application-layer
/// services so audit-sensitive operations (agreement acceptance, etc.) can persist proof
/// of who really took the action and from where. The Infrastructure layer captures these
/// from the incoming HttpContext; tests can stub a fixed value.
public interface IRequestContext
{
    string? IpAddress { get; }
    string? UserAgent { get; }
}
