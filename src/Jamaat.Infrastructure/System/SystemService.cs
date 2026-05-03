using System.Data.Common;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using Jamaat.Application.SystemMonitor;
using Jamaat.Contracts.SystemMonitor;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.SystemMonitor;

public sealed class SystemService(
    JamaatDbContext db,
    UserManager<ApplicationUser> userMgr,
    IHostEnvironment env,
    IUserActivityTracker activityTracker,
    ILogger<SystemService> logger) : ISystemService
{
    public async Task<ServerStatsDto> GetServerStatsAsync(CancellationToken ct = default)
    {
        var proc = Process.GetCurrentProcess();
        var asm = Assembly.GetEntryAssembly();
        var version = asm?.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                      ?? asm?.GetName().Version?.ToString()
                      ?? "dev";

        // Process CPU% over a 200ms window. Cheap to run, snapshot-style.
        var cpuStart = proc.TotalProcessorTime;
        var wallStart = DateTimeOffset.UtcNow;
        await Task.Delay(200, ct);
        proc.Refresh();
        var cpuEnd = proc.TotalProcessorTime;
        var wallEnd = DateTimeOffset.UtcNow;
        var cpuMs = (cpuEnd - cpuStart).TotalMilliseconds;
        var wallMs = (wallEnd - wallStart).TotalMilliseconds;
        var processCpuPct = wallMs <= 0 || Environment.ProcessorCount <= 0
            ? 0d
            : Math.Round(cpuMs / (Environment.ProcessorCount * wallMs) * 100, 1);

        // System RAM via the .NET GC's view of the host. Cross-platform; doesn't need admin.
        var gcInfo = GC.GetGCMemoryInfo();
        var totalRam = gcInfo.TotalAvailableMemoryBytes;
        var memLoad = gcInfo.MemoryLoadBytes;
        var systemRamPct = totalRam <= 0 ? 0d : Math.Round((double)memLoad / totalRam * 100, 1);

        var drives = SafeEnumerateDrives();

        return new ServerStatsDto(
            MachineName: Environment.MachineName,
            OsDescription: RuntimeInformation.OSDescription,
            OsArchitecture: RuntimeInformation.OSArchitecture.ToString(),
            DotnetVersion: RuntimeInformation.FrameworkDescription,
            ProcessUptime: FormatDuration(DateTimeOffset.UtcNow - proc.StartTime.ToUniversalTime()),
            ProcessStartedAt: proc.StartTime.ToUniversalTime(),
            AppVersion: version,
            Environment: env.EnvironmentName,
            ProcessorCount: Environment.ProcessorCount,
            CpuPercent: processCpuPct,                        // we report process-only; system-wide CPU% requires PerformanceCounter (Windows-only, admin)
            ProcessCpuPercent: processCpuPct,
            ProcessWorkingSetMb: proc.WorkingSet64 / 1024 / 1024,
            ProcessPrivateMemoryMb: proc.PrivateMemorySize64 / 1024 / 1024,
            ManagedHeapMb: GC.GetTotalMemory(forceFullCollection: false) / 1024 / 1024,
            ThreadCount: proc.Threads.Count,
            HandleCount: proc.HandleCount,
            SystemTotalRamMb: totalRam / 1024 / 1024,
            SystemFreeRamMb: Math.Max(0, (totalRam - memLoad) / 1024 / 1024),
            SystemRamPercent: systemRamPct,
            Drives: drives);
    }

    public async Task<DatabaseStatsDto> GetDatabaseStatsAsync(CancellationToken ct = default)
    {
        var dbName = db.Database.GetDbConnection().Database;
        var canConnect = false;
        var serverVersion = "";
        long total = 0, data = 0, log = 0;
        var conn = 0;
        DateTimeOffset? lastBackup = null;
        string? recovery = null;
        var topBySize = new List<TableStatDto>();
        var topByRows = new List<TableStatDto>();

        try
        {
            canConnect = await db.Database.CanConnectAsync(ct);
            if (!canConnect)
                return Empty(dbName);

            // IMPORTANT: do NOT `await using` this — GetDbConnection() returns the connection
            // EF owns. Disposing it leaves EF holding a dead reference and the next query on
            // the same DbContext throws "ConnectionString has not been initialized". Use it
            // directly and let EF manage its lifecycle.
            var c = db.Database.GetDbConnection();
            var openedHere = c.State != global::System.Data.ConnectionState.Open;
            if (openedHere) await c.OpenAsync(ct);
            try
            {
            serverVersion = c.ServerVersion ?? "";

            // -- Size: data + log split via type column on sys.master_files --
            await using (var cmd = c.CreateCommand())
            {
                cmd.CommandText = @"
SELECT
    ISNULL(SUM(CASE WHEN type = 0 THEN CAST(size AS bigint) * 8 / 1024 ELSE 0 END), 0) AS DataMb,
    ISNULL(SUM(CASE WHEN type = 1 THEN CAST(size AS bigint) * 8 / 1024 ELSE 0 END), 0) AS LogMb
FROM sys.master_files WHERE database_id = DB_ID();";
                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                if (await rdr.ReadAsync(ct))
                {
                    data = rdr.GetInt64(0);
                    log = rdr.GetInt64(1);
                    total = data + log;
                }
            }

            // -- Connections owned by this database --
            await using (var cmd = c.CreateCommand())
            {
                cmd.CommandText = @"SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE database_id = DB_ID() AND is_user_process = 1;";
                conn = (int)(await cmd.ExecuteScalarAsync(ct) ?? 0);
            }

            // -- Recovery model --
            await using (var cmd = c.CreateCommand())
            {
                cmd.CommandText = @"SELECT recovery_model_desc FROM sys.databases WHERE database_id = DB_ID();";
                recovery = await cmd.ExecuteScalarAsync(ct) as string;
            }

            // -- Last backup (msdb access required; swallow if denied) --
            try
            {
                await using var cmd = c.CreateCommand();
                cmd.CommandText = @"SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset WHERE database_name = DB_NAME() AND type = 'D';";
                var raw = await cmd.ExecuteScalarAsync(ct);
                if (raw is DateTime dt) lastBackup = new DateTimeOffset(dt, TimeSpan.Zero);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Could not read last-backup time (likely missing msdb permission).");
            }

            // -- Top 10 tables by size + by rowcount --
            await using (var cmd = c.CreateCommand())
            {
                cmd.CommandText = @"
SELECT TOP 20
    s.name AS [Schema],
    t.name AS [Name],
    SUM(p.rows) AS [Rows],
    SUM(a.total_pages) * 8 AS [SizeKb]
FROM sys.tables t
INNER JOIN sys.indexes i ON t.object_id = i.object_id
INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE i.index_id <= 1
GROUP BY s.name, t.name
ORDER BY [SizeKb] DESC;";
                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                {
                    topBySize.Add(new TableStatDto(
                        Schema: rdr.GetString(0),
                        Name: rdr.GetString(1),
                        RowCount: rdr.IsDBNull(2) ? 0 : rdr.GetInt64(2),
                        SizeKb: rdr.IsDBNull(3) ? 0 : rdr.GetInt64(3)));
                }
            }
            topByRows = topBySize.OrderByDescending(t => t.RowCount).Take(10).ToList();
            topBySize = topBySize.Take(10).ToList();
            }
            finally
            {
                // Only close if WE opened it; otherwise leave it as we found it so EF can
                // continue using the connection for subsequent queries on this scope.
                if (openedHere) await c.CloseAsync();
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Database stats query failed.");
            return Empty(dbName) with { CanConnect = false };
        }

        return new DatabaseStatsDto(
            DatabaseName: dbName,
            ServerVersion: serverVersion,
            TotalSizeMb: total,
            DataSizeMb: data,
            LogSizeMb: log,
            ConnectionCount: conn,
            LastBackupAt: lastBackup,
            RecoveryModel: recovery,
            CanConnect: canConnect,
            TopTablesBySize: topBySize,
            TopTablesByRowCount: topByRows);

        static DatabaseStatsDto Empty(string n) => new(n, "", 0, 0, 0, 0, null, null, false, [], []);
    }

    public Task<LogTailDto?> GetRecentLogsAsync(int take = 200, CancellationToken ct = default)
    {
        // Serilog config writes to "logs/jamaat-.log" relative to ContentRoot. Files roll daily
        // so the latest file name has a date suffix; pick the most-recently-modified match.
        var logsDir = Path.Combine(env.ContentRootPath, "logs");
        if (!Directory.Exists(logsDir)) return Task.FromResult<LogTailDto?>(null);

        var latest = new DirectoryInfo(logsDir)
            .EnumerateFiles("jamaat-*.log")
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .FirstOrDefault();
        if (latest is null) return Task.FromResult<LogTailDto?>(null);

        // Read tail without locking - Serilog opens with shared read so we can co-read while
        // it's writing. We over-read by a factor and trim because lines vary in length.
        IReadOnlyList<string> lines;
        try
        {
            using var fs = new FileStream(latest.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var sr = new StreamReader(fs);
            var all = sr.ReadToEnd().Split('\n', StringSplitOptions.RemoveEmptyEntries);
            lines = all.TakeLast(take).Select(l => l.TrimEnd('\r')).ToArray();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to read log tail at {Path}", latest.FullName);
            return Task.FromResult<LogTailDto?>(new LogTailDto(latest.FullName, latest.Length, latest.LastWriteTimeUtc, 0, []));
        }

        return Task.FromResult<LogTailDto?>(new LogTailDto(
            FilePath: latest.FullName,
            FileSizeBytes: latest.Length,
            LastWriteAt: latest.LastWriteTimeUtc,
            LineCount: lines.Count,
            Lines: lines));
    }

    public async Task<IReadOnlyList<TenantSummaryDto>> GetTenantsAsync(CancellationToken ct = default)
    {
        // IgnoreQueryFilters because we want every tenant, not just the one the request resolved to.
        var tenants = await db.Tenants.IgnoreQueryFilters().AsNoTracking().ToListAsync(ct);
        if (tenants.Count == 0) return [];

        var result = new List<TenantSummaryDto>(tenants.Count);
        foreach (var t in tenants)
        {
            // Counts are bypass-tenant-filter and grouped by TenantId. Doing one query per tenant
            // keeps things readable; total cost is N small queries which is fine for the typical
            // <10 tenants in this app and lazy-rendered on demand.
            var memberCount = await db.Members.IgnoreQueryFilters().CountAsync(m => m.TenantId == t.Id, ct);
            var familyCount = await db.Families.IgnoreQueryFilters().CountAsync(f => f.TenantId == t.Id, ct);
            var receiptCount = await db.Receipts.IgnoreQueryFilters().CountAsync(r => r.TenantId == t.Id, ct);
            var userCount = await userMgr.Users.CountAsync(u => u.TenantId == t.Id, ct);

            // "Last activity" is the most recent receipt creation date for the tenant. Cheap proxy.
            var lastActivity = await db.Receipts.IgnoreQueryFilters()
                .Where(r => r.TenantId == t.Id)
                .OrderByDescending(r => r.CreatedAtUtc)
                .Select(r => (DateTimeOffset?)r.CreatedAtUtc)
                .FirstOrDefaultAsync(ct);

            result.Add(new TenantSummaryDto(
                Id: t.Id,
                Code: t.Code,
                Name: t.Name,
                BaseCurrency: t.BaseCurrency ?? "",
                MemberCount: memberCount,
                UserCount: userCount,
                FamilyCount: familyCount,
                ReceiptCount: receiptCount,
                LastActivityAt: lastActivity));
        }
        return result;
    }

    public async Task<SystemOverviewDto> GetOverviewAsync(int logTake = 200, CancellationToken ct = default)
    {
        var server = await GetServerStatsAsync(ct);
        DatabaseStatsDto? database = null;
        try { database = await GetDatabaseStatsAsync(ct); } catch (Exception ex) { logger.LogWarning(ex, "Database stats failed in overview"); }
        var tenants = await GetTenantsAsync(ct);
        var logs = await GetRecentLogsAsync(logTake, ct);
        var liveOps = await GetLiveOpsAsync(ct);
        return new SystemOverviewDto(server, database, tenants, logs, liveOps);
    }

    public async Task<LiveOpsDto> GetLiveOpsAsync(CancellationToken ct = default)
    {
        var online = activityTracker.GetOnline(TimeSpan.FromMinutes(5));
        var rate = activityTracker.GetRequestRate();

        // Recent logins (success + failure mixed). IgnoreQueryFilters because we want them
        // across tenants for the SuperAdmin's view.
        var recentLogins = await db.LoginAttempts.IgnoreQueryFilters()
            .OrderByDescending(la => la.AttemptedAtUtc)
            .Take(25)
            .Select(la => new RecentLoginDto(
                la.Id, la.UserId, la.Identifier, la.Success, la.FailureReason,
                la.IpAddress, la.UserAgent, la.GeoCountry, la.GeoCity, la.AttemptedAtUtc))
            .ToListAsync(ct);

        // Failed login count in the last hour - useful for spotting brute-force.
        var oneHourAgo = DateTimeOffset.UtcNow.AddHours(-1);
        var failedLastHour = await db.LoginAttempts.IgnoreQueryFilters()
            .CountAsync(la => !la.Success && la.AttemptedAtUtc >= oneHourAgo, ct);

        // Recent errors. Project to RecentErrorDto with stringified enums.
        var recentErrors = await db.ErrorLogs.IgnoreQueryFilters()
            .OrderByDescending(e => e.OccurredAtUtc)
            .Take(25)
            .Select(e => new RecentErrorDto(
                e.Id,
                e.Source.ToString(),
                e.Severity.ToString(),
                e.Status.ToString(),
                e.Message,
                e.ExceptionType,
                e.Endpoint,
                e.HttpStatus,
                e.UserName,
                e.OccurredAtUtc))
            .ToListAsync(ct);

        return new LiveOpsDto(
            OnlineUsers: online,
            OnlineUserCount: online.Count,
            Requests: rate,
            RecentLogins: recentLogins,
            RecentErrors: recentErrors,
            FailedLoginsLastHour: failedLastHour);
    }

    private static IReadOnlyList<DriveStatDto> SafeEnumerateDrives()
    {
        var list = new List<DriveStatDto>();
        foreach (var d in DriveInfo.GetDrives())
        {
            try
            {
                if (!d.IsReady || d.DriveType != DriveType.Fixed) continue;
                var totalMb = d.TotalSize / 1024 / 1024;
                var freeMb = d.AvailableFreeSpace / 1024 / 1024;
                var usedMb = totalMb - freeMb;
                var pct = totalMb <= 0 ? 0d : Math.Round((double)usedMb / totalMb * 100, 1);
                list.Add(new DriveStatDto(
                    Name: d.Name.TrimEnd('\\'),
                    Label: string.IsNullOrWhiteSpace(d.VolumeLabel) ? d.Name.TrimEnd('\\') : d.VolumeLabel,
                    Format: d.DriveFormat ?? "",
                    TotalMb: totalMb,
                    FreeMb: freeMb,
                    UsedMb: usedMb,
                    UsedPercent: pct));
            }
            catch
            {
                // unreadable drive (e.g. network share gone) - skip silently
            }
        }
        return list;
    }

    private static string FormatDuration(TimeSpan ts) => ts.TotalDays >= 1
        ? $"{(int)ts.TotalDays}d {ts.Hours}h {ts.Minutes}m"
        : ts.TotalHours >= 1
            ? $"{(int)ts.TotalHours}h {ts.Minutes}m"
            : $"{ts.Minutes}m {ts.Seconds}s";
}
