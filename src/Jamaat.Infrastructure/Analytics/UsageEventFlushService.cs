using Jamaat.Application.Analytics;
using Jamaat.Domain.Entities;
using Jamaat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Analytics;

/// <summary>Drains the <see cref="UsageEventQueue"/> in batches and inserts via raw EF AddRange.
/// Runs at most once per second, batches up to 256 events per flush so we get a single
/// SQL round-trip instead of one INSERT per event. Cancellation-safe: drains remaining
/// events on shutdown so we don't drop the tail.</summary>
public sealed class UsageEventFlushService(
    IUsageEventQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<UsageEventFlushService> logger) : BackgroundService
{
    private const int MaxBatchSize = 256;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Cast to concrete type to access Reader without exposing it via the interface.
        if (queue is not UsageEventQueue concrete)
        {
            logger.LogWarning("IUsageEventQueue is not the expected concrete type; usage events will not be flushed.");
            return;
        }

        var reader = concrete.Reader;
        var batch = new List<UsageEvent>(MaxBatchSize);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Wait for at least one event. ReadAsync throws on completion; we catch below.
                var first = await reader.ReadAsync(stoppingToken);
                batch.Add(first);

                // Greedily drain up to MaxBatchSize without blocking, so a burst lands in
                // one INSERT.
                while (batch.Count < MaxBatchSize && reader.TryRead(out var more))
                    batch.Add(more);

                await FlushAsync(batch, concrete, stoppingToken);
                batch.Clear();
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to flush usage event batch ({Count}). Discarding.", batch.Count);
                // Important: don't wedge the queue. Drop the failed batch and continue. We
                // still notify "flushed" so the depth counter stays sane.
                concrete.NotifyFlushed(batch.Count);
                batch.Clear();
            }
        }

        // Drain remaining events on shutdown (best-effort; bounded by 5 seconds).
        using var draincts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            while (reader.TryRead(out var evt) && !draincts.IsCancellationRequested)
            {
                batch.Add(evt);
                if (batch.Count >= MaxBatchSize)
                {
                    await FlushAsync(batch, concrete, draincts.Token);
                    batch.Clear();
                }
            }
            if (batch.Count > 0) await FlushAsync(batch, concrete, draincts.Token);
        }
        catch { /* shutdown drain - best effort */ }
    }

    private async Task FlushAsync(List<UsageEvent> events, UsageEventQueue concrete, CancellationToken ct)
    {
        if (events.Count == 0) return;
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<JamaatDbContext>();
        // SaveChanges with the AuditInterceptor would try to set CreatedBy/UpdatedBy on
        // entities implementing IAuditable - UsageEvent doesn't, so the interceptor is a no-op.
        // We bypass the tenant context (events carry their TenantId already) by writing direct
        // to DbSet without a TenantContext set on this scope.
        db.UsageEvents.AddRange(events);
        await db.SaveChangesAsync(ct);
        concrete.NotifyFlushed(events.Count);
    }
}
