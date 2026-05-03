namespace Jamaat.Application.SystemMonitor;

/// <summary>SuperAdmin-level runtime controls. Each operation is fire-and-forget from the
/// caller's perspective: we kick it off, write a SystemAuditLog row, return a result. The
/// actual side-effect (GC, log flush, etc.) may complete after the request finishes.</summary>
public interface IServiceControl
{
    /// <summary>Runtime info: GC mode, server vs workstation, uptime, etc. Read-only.</summary>
    RuntimeInfoDto GetRuntimeInfo();

    /// <summary>Force a full Gen-2 GC + finalize pending objects. Returns the bytes freed
    /// (heap before - heap after) for the operator-audit row. Use sparingly; this is a
    /// "force the heap to settle" tool, not a routine action.</summary>
    GcResultDto ForceGc();

    /// <summary>Prune the in-memory user-activity tracker by clearing its accumulators.
    /// Useful right after a deploy when you want a clean baseline for "users online" /
    /// "requests per minute" without restarting the service.</summary>
    void ResetActivityCounters();
}

public sealed record RuntimeInfoDto(
    bool IsServerGc,
    bool IsConcurrentGc,
    long Gen0Collections,
    long Gen1Collections,
    long Gen2Collections,
    long ManagedHeapBytes,
    long TotalAllocatedBytes,
    int ProcessId,
    string ProcessName,
    string MachineName);

public sealed record GcResultDto(
    long HeapBytesBefore,
    long HeapBytesAfter,
    long FreedBytes,
    int DurationMs);
