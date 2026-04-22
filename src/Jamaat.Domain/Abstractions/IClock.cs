namespace Jamaat.Domain.Abstractions;

/// Abstraction over DateTimeOffset.UtcNow so tests can control time deterministically.
public interface IClock
{
    DateTimeOffset UtcNow { get; }
    DateOnly Today { get; }
}
