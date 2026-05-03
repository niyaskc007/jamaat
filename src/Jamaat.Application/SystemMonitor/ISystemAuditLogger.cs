namespace Jamaat.Application.SystemMonitor;

/// <summary>Writes a SystemAuditLog row capturing one SuperAdmin-level operator action.
/// Resolves the actor + correlation id + IP / user-agent from the current request scope.
/// Fire-and-forget: never throws, never blocks the calling action on a logging failure.</summary>
public interface ISystemAuditLogger
{
    Task RecordAsync(string actionKey, string summary, string? targetRef = null, object? detail = null, CancellationToken ct = default);
}
