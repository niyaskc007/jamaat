using Jamaat.Domain.Entities;

namespace Jamaat.Application.Analytics;

/// <summary>Bounded, lock-free queue for usage events. The MVC filter and the page-track
/// endpoint enqueue from the request thread; a hosted-service writer dequeues in batches
/// and flushes via the DbContext, so we never block the request on a DB write.
///
/// Bounded so a runaway loop (or a flood of analytics traffic) can't unbounded-grow memory;
/// drops are silent at the queue level and counted on the hosted service side.</summary>
public interface IUsageEventQueue
{
    /// <summary>Returns true if accepted, false if dropped (queue full).</summary>
    bool TryEnqueue(UsageEvent evt);

    /// <summary>Diagnostics: live queue depth + drop counter.</summary>
    UsageQueueStats GetStats();
}

public sealed record UsageQueueStats(int CurrentDepth, long TotalEnqueued, long TotalDropped, long TotalFlushed);
