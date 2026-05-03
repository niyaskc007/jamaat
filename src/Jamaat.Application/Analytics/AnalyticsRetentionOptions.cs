namespace Jamaat.Application.Analytics;

/// <summary>Bound to the "Analytics" config section. Controls how long usage events live and
/// how aggressively the purge worker batches its deletes. Defaults to 90 days, batch 10000.
/// Override in appsettings.json:
///   "Analytics": { "RetentionDays": 60, "PurgeBatchSize": 5000 }
/// </summary>
public sealed class AnalyticsRetentionOptions
{
    public const string SectionName = "Analytics";

    /// <summary>Events older than today minus this many days are deleted by the purge worker.
    /// Set to 0 to disable purging entirely (for ops who want to keep everything).</summary>
    public int RetentionDays { get; set; } = 90;

    /// <summary>Maximum rows deleted per round-trip. Bounded so the transaction log stays
    /// small and we don't lock the table for long.</summary>
    public int PurgeBatchSize { get; set; } = 10000;

    /// <summary>How long after startup to wait before the first purge. Default 5 minutes so
    /// the API can finish startup work first.</summary>
    public int InitialDelaySeconds { get; set; } = 300;

    /// <summary>Interval between purges. Default 24 hours.</summary>
    public int IntervalSeconds { get; set; } = 86_400;
}
