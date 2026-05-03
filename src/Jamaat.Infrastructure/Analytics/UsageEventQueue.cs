using System.Threading.Channels;
using Jamaat.Application.Analytics;
using Jamaat.Domain.Entities;

namespace Jamaat.Infrastructure.Analytics;

/// <summary>Bounded channel-backed queue. Channel's `BoundedChannelFullMode.DropWrite` drops
/// the new event silently when full; we count the drop ourselves so the System Monitor can
/// surface "we're losing events" if it ever happens at scale. Capacity 4096 is enough for
/// ~10x burst at this app's traffic level; the flush worker drains every second.</summary>
public sealed class UsageEventQueue : IUsageEventQueue
{
    private const int Capacity = 4096;

    private readonly Channel<UsageEvent> _channel = Channel.CreateBounded<UsageEvent>(new BoundedChannelOptions(Capacity)
    {
        FullMode = BoundedChannelFullMode.DropWrite,
        SingleReader = true,
        SingleWriter = false,
    });

    private long _enqueued;
    private long _dropped;
    private long _flushed;
    private int _depth;

    /// <summary>Channel reader exposed to the hosted service.</summary>
    internal ChannelReader<UsageEvent> Reader => _channel.Reader;

    public bool TryEnqueue(UsageEvent evt)
    {
        if (_channel.Writer.TryWrite(evt))
        {
            Interlocked.Increment(ref _enqueued);
            Interlocked.Increment(ref _depth);
            return true;
        }
        Interlocked.Increment(ref _dropped);
        return false;
    }

    /// <summary>Called by the flush worker when it pulls and persists a batch.</summary>
    internal void NotifyFlushed(int count)
    {
        Interlocked.Add(ref _flushed, count);
        Interlocked.Add(ref _depth, -count);
    }

    public UsageQueueStats GetStats() => new(
        CurrentDepth: Volatile.Read(ref _depth),
        TotalEnqueued: Interlocked.Read(ref _enqueued),
        TotalDropped: Interlocked.Read(ref _dropped),
        TotalFlushed: Interlocked.Read(ref _flushed));
}
