using System.Diagnostics;
using Jamaat.Application.SystemMonitor;

namespace Jamaat.Infrastructure.SystemMonitor;

public sealed class ServiceControl(IUserActivityTracker activityTracker) : IServiceControl
{
    public RuntimeInfoDto GetRuntimeInfo()
    {
        var proc = Process.GetCurrentProcess();
        return new RuntimeInfoDto(
            IsServerGc: System.Runtime.GCSettings.IsServerGC,
            IsConcurrentGc: System.Runtime.GCSettings.LatencyMode != System.Runtime.GCLatencyMode.Batch,
            Gen0Collections: GC.CollectionCount(0),
            Gen1Collections: GC.CollectionCount(1),
            Gen2Collections: GC.CollectionCount(2),
            ManagedHeapBytes: GC.GetTotalMemory(forceFullCollection: false),
            TotalAllocatedBytes: GC.GetTotalAllocatedBytes(precise: false),
            ProcessId: proc.Id,
            ProcessName: proc.ProcessName,
            MachineName: Environment.MachineName);
    }

    public GcResultDto ForceGc()
    {
        var sw = Stopwatch.StartNew();
        var before = GC.GetTotalMemory(forceFullCollection: false);

        // Three-pass canonical "really do it" sequence: collect, wait for finalisers,
        // collect again (in case finalisers re-rooted anything), wait, collect once more.
        GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);
        GC.WaitForPendingFinalizers();
        GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);
        GC.WaitForPendingFinalizers();
        GC.Collect();

        var after = GC.GetTotalMemory(forceFullCollection: false);
        sw.Stop();

        return new GcResultDto(
            HeapBytesBefore: before,
            HeapBytesAfter: after,
            FreedBytes: Math.Max(0, before - after),
            DurationMs: (int)sw.ElapsedMilliseconds);
    }

    public void ResetActivityCounters()
    {
        // The activity tracker is internally bounded so we can't poke at the dictionaries
        // directly from here without exposing them. The cheap reset is to call the
        // self-prune logic via a no-op getOnline that prunes anything older than 30 minutes.
        // For now this is a soft "let things age out" reset; a hard reset would require
        // exposing a Clear() on the tracker interface, which we can add when there's a
        // real need (e.g. someone wants the rate-counter zeroed mid-session for testing).
        _ = activityTracker.GetOnline(TimeSpan.Zero);
    }
}
