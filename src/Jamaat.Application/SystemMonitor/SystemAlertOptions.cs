namespace Jamaat.Application.SystemMonitor;

/// <summary>Tunable thresholds + delivery options for the SystemAlertEvaluator. Bound to the
/// "Alerts" config section. Defaults are sane for a small jamaat install; tighten in
/// appsettings.json for higher-traffic deploys:
///   "Alerts": {
///     "Enabled": true,
///     "EvaluationIntervalSeconds": 60,
///     "CooldownMinutes": 15,
///     "FailedLoginsLastHourThreshold": 20,
///     "ErrorsLastHourThreshold": 10,
///     "DiskUsedPercentThreshold": 90,
///     "RamUsedPercentThreshold": 90,
///     "QueueDropsPerEvaluationThreshold": 1,
///     "Recipients": ["ops@example.com", "admin@example.com"]
///   }
/// </summary>
public sealed class SystemAlertOptions
{
    public const string SectionName = "Alerts";

    /// <summary>Master switch. False disables the evaluator entirely - useful for dev where
    /// SMTP isn't configured and the operator doesn't want LogOnly noise.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>How often to re-evaluate all rules. Default 60s.</summary>
    public int EvaluationIntervalSeconds { get; set; } = 60;

    /// <summary>How long an open alert is suppressed from re-paging. Inside the cooldown the
    /// rule keeps firing - we update LastSeenAtUtc and bump RepeatCount on the existing row,
    /// but we don't send another email. Outside the cooldown the operator gets re-paged.
    /// Default 15 minutes.</summary>
    public int CooldownMinutes { get; set; } = 15;

    /// <summary>Failed logins in the last hour. Default 20 - tuned to spot a brute force without
    /// alerting on someone who fat-fingered their password three times.</summary>
    public int FailedLoginsLastHourThreshold { get; set; } = 20;

    /// <summary>ErrorLog rows in the last hour. Default 10.</summary>
    public int ErrorsLastHourThreshold { get; set; } = 10;

    /// <summary>Any fixed drive's used percentage that triggers a disk-full alert. Default 90.</summary>
    public int DiskUsedPercentThreshold { get; set; } = 90;

    /// <summary>System RAM used percentage. Default 90.</summary>
    public int RamUsedPercentThreshold { get; set; } = 90;

    /// <summary>Telemetry-queue drops since last evaluation. Default 1 - even a single drop
    /// indicates the flush worker is falling behind, which deserves an investigation.</summary>
    public int QueueDropsPerEvaluationThreshold { get; set; } = 1;

    /// <summary>Explicit recipient email list. If empty, the evaluator falls back to looking
    /// up emails on the SuperAdmin role members. Either way, every recipient gets one email
    /// per fired alert (within the cooldown).</summary>
    public string[] Recipients { get; set; } = Array.Empty<string>();
}
