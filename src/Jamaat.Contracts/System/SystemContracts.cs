namespace Jamaat.Contracts.SystemMonitor;

/// <summary>Server / process / runtime stats. Snapshot-style: the controller is meant to be
/// polled (5-10s cadence); each call samples fresh values rather than tracking history.</summary>
public sealed record ServerStatsDto(
    string MachineName,
    string OsDescription,
    string OsArchitecture,
    string DotnetVersion,
    string ProcessUptime,
    DateTimeOffset ProcessStartedAt,
    string AppVersion,
    string Environment,
    int ProcessorCount,
    double CpuPercent,
    double ProcessCpuPercent,
    long ProcessWorkingSetMb,
    long ProcessPrivateMemoryMb,
    long ManagedHeapMb,
    int ThreadCount,
    int HandleCount,
    long SystemTotalRamMb,
    long SystemFreeRamMb,
    double SystemRamPercent,
    IReadOnlyList<DriveStatDto> Drives);

public sealed record DriveStatDto(
    string Name,
    string Label,
    string Format,
    long TotalMb,
    long FreeMb,
    long UsedMb,
    double UsedPercent);

/// <summary>Database size + table row counts. Useful for capacity planning and spotting runaway
/// audit/log tables. SQL Server-specific (sys.master_files); other providers will return zeros.</summary>
public sealed record DatabaseStatsDto(
    string DatabaseName,
    string ServerVersion,
    long TotalSizeMb,
    long DataSizeMb,
    long LogSizeMb,
    int ConnectionCount,
    DateTimeOffset? LastBackupAt,
    string? RecoveryModel,
    bool CanConnect,
    IReadOnlyList<TableStatDto> TopTablesBySize,
    IReadOnlyList<TableStatDto> TopTablesByRowCount);

public sealed record TableStatDto(
    string Schema,
    string Name,
    long RowCount,
    long SizeKb);

public sealed record LogTailDto(
    string FilePath,
    long FileSizeBytes,
    DateTimeOffset LastWriteAt,
    int LineCount,
    IReadOnlyList<string> Lines);

public sealed record TenantSummaryDto(
    Guid Id,
    string Code,
    string Name,
    string BaseCurrency,
    int MemberCount,
    int UserCount,
    int FamilyCount,
    int ReceiptCount,
    DateTimeOffset? LastActivityAt);

/// <summary>Aggregated payload for the system dashboard - a single request surfaces all the
/// tiles. Each section is nullable so a subsystem failure (e.g. database down) doesn't take
/// down the whole monitor.</summary>
public sealed record SystemOverviewDto(
    ServerStatsDto Server,
    DatabaseStatsDto? Database,
    IReadOnlyList<TenantSummaryDto> Tenants,
    LogTailDto? RecentLogs);
