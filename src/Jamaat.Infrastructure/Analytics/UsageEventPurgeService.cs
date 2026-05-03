using Jamaat.Application.Analytics;
using Jamaat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Analytics;

/// <summary>Daily housekeeping for the UsageEvents table. Without this the table grows
/// forever, the (TenantId, OccurredAtUtc) index gets bigger and the analytics aggregation
/// queries slow down over time.
///
/// Strategy: DELETE TOP (N) FROM UsageEvents WHERE OccurredAtUtc &lt; @cutoff in a loop until
/// 0 rows are returned. Batched so the transaction log stays small and the table isn't
/// locked for long. Runs once on startup (after a configurable warmup delay) and then on
/// a 24-hour cadence.</summary>
public sealed class UsageEventPurgeService(
    IServiceScopeFactory scopeFactory,
    IOptions<AnalyticsRetentionOptions> options,
    ILogger<UsageEventPurgeService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var opts = options.Value;
        if (opts.RetentionDays <= 0)
        {
            logger.LogInformation("UsageEvent purge disabled (RetentionDays={Days}).", opts.RetentionDays);
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(Math.Max(0, opts.InitialDelaySeconds)), stoppingToken);
        }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PurgeOnceAsync(opts, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "UsageEvent purge round failed; will retry next cycle.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(Math.Max(60, opts.IntervalSeconds)), stoppingToken);
            }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task PurgeOnceAsync(AnalyticsRetentionOptions opts, CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow.AddDays(-opts.RetentionDays);
        var batchSize = Math.Clamp(opts.PurgeBatchSize, 100, 100_000);
        long totalDeleted = 0;
        var rounds = 0;

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<JamaatDbContext>();

        while (!ct.IsCancellationRequested)
        {
            // Raw SQL because EF's batch-delete (.ExecuteDeleteAsync) doesn't support TOP. We
            // want bounded batches so a deep backlog doesn't lock the table for minutes.
            //
            // The parameter is a real SqlParameter under the hood (FormattableString
            // interpolation), so this is safe from injection. {batchSize} is an int so it
            // also goes through the parameter path.
            var rows = await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE TOP ({batchSize}) FROM UsageEvents WHERE OccurredAtUtc < {cutoff}",
                ct);
            if (rows <= 0) break;
            totalDeleted += rows;
            rounds++;
            // Yield briefly between rounds to avoid hogging the connection in pathological cases.
            await Task.Delay(50, ct);
        }

        if (totalDeleted > 0)
        {
            logger.LogInformation("Purged {Count} UsageEvent rows older than {Cutoff:O} in {Rounds} rounds.",
                totalDeleted, cutoff, rounds);
        }
        else
        {
            logger.LogDebug("UsageEvent purge: nothing to delete (cutoff {Cutoff:O}).", cutoff);
        }
    }
}
