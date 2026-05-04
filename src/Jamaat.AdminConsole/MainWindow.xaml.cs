using System.Collections.ObjectModel;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace Jamaat.AdminConsole;

/// <summary>
/// Single-window admin console. Login → tabs (Status / Alerts / Errors / Logins / Audit).
/// Reads everything from the existing /api/v1/system endpoints exposed by the API; no
/// direct DB access. The console is a thin client deliberately - all the data is already
/// surfaced by the web SuperAdmin pages, this is just a native shell over the same API.
/// </summary>
public partial class MainWindow : Window, IDisposable
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly DispatcherTimer _refreshTimer = new() { Interval = TimeSpan.FromSeconds(8) };

    public void Dispose()
    {
        _refreshTimer.Stop();
        _http.Dispose();
        GC.SuppressFinalize(this);
    }

    private string _baseUrl = "";
    private string _accessToken = "";

    public ObservableCollection<AlertRow> Alerts { get; } = new();
    public ObservableCollection<ErrorRow> Errors { get; } = new();
    public ObservableCollection<LoginRow> Logins { get; } = new();
    public ObservableCollection<AuditRow> Audit { get; } = new();
    public ObservableCollection<TenantRow> Tenants { get; } = new();

    public MainWindow()
    {
        InitializeComponent();
        dgAlerts.ItemsSource = Alerts;
        dgErrors.ItemsSource = Errors;
        dgLogins.ItemsSource = Logins;
        dgAudit.ItemsSource = Audit;
        dgTenants.ItemsSource = Tenants;
        _refreshTimer.Tick += async (_, _) => await RefreshAllAsync();

        // Pre-populate API URL from any locally installed Jamaat we can find. Cheap and a
        // nice touch for ops who installed Jamaat on this same box.
        TryPrefillApiUrl();
    }

    private void TryPrefillApiUrl()
    {
        try
        {
            var probe = @"C:\Program Files\Jamaat\Api\appsettings.json";
            if (File.Exists(probe))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(probe));
                if (doc.RootElement.TryGetProperty("Cors", out var cors)
                    && cors.TryGetProperty("Origins", out var origins)
                    && origins.GetArrayLength() > 0)
                {
                    var first = origins[0].GetString();
                    if (!string.IsNullOrEmpty(first)) tbApiUrl.Text = first;
                }
            }
        }
        catch { /* best-effort prefill */ }
    }

    // ---- Login -------------------------------------------------------------

    private async void OnLoginClick(object sender, RoutedEventArgs e)
    {
        lblLoginError.Visibility = Visibility.Collapsed;
        var url = tbApiUrl.Text.TrimEnd('/');
        var email = tbEmail.Text.Trim();
        var pw = pbPassword.Password;
        if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(email) || string.IsNullOrEmpty(pw))
        {
            ShowLoginError("URL, email, and password are all required.");
            return;
        }

        btnLogin.IsEnabled = false;
        btnLogin.Content = "Signing in...";
        try
        {
            var loginUrl = url + "/api/v1/auth/login";
            using var resp = await _http.PostAsJsonAsync(loginUrl, new { email, password = pw });
            if (!resp.IsSuccessStatusCode)
            {
                var detail = await resp.Content.ReadAsStringAsync();
                ShowLoginError($"Sign in failed ({(int)resp.StatusCode}): {Trim(detail, 240)}");
                return;
            }
            var payload = await resp.Content.ReadFromJsonAsync<LoginResponse>(JsonOpts);
            if (payload?.AccessToken is null)
            {
                ShowLoginError("Sign in returned no access token.");
                return;
            }
            _baseUrl = url;
            _accessToken = payload.AccessToken;
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

            await RefreshAllAsync();
            ShowDashboard();
        }
        catch (Exception ex)
        {
            ShowLoginError("Could not reach the API: " + ex.Message);
        }
        finally
        {
            btnLogin.IsEnabled = true;
            btnLogin.Content = "Sign in";
        }
    }

    private void ShowLoginError(string msg)
    {
        lblLoginError.Text = msg;
        lblLoginError.Visibility = Visibility.Visible;
    }

    private void ShowDashboard()
    {
        loginPanel.Visibility = Visibility.Collapsed;
        dashboardPanel.Visibility = Visibility.Visible;
        btnRefresh.Visibility = Visibility.Visible;
        btnDisconnect.Visibility = Visibility.Visible;
        lblConnection.Text = $"Connected to {_baseUrl}";
        _refreshTimer.Start();
    }

    private void OnDisconnectClick(object sender, RoutedEventArgs e)
    {
        _refreshTimer.Stop();
        _accessToken = "";
        _baseUrl = "";
        _http.DefaultRequestHeaders.Authorization = null;
        Alerts.Clear(); Errors.Clear(); Logins.Clear(); Audit.Clear();
        loginPanel.Visibility = Visibility.Visible;
        dashboardPanel.Visibility = Visibility.Collapsed;
        btnRefresh.Visibility = Visibility.Collapsed;
        btnDisconnect.Visibility = Visibility.Collapsed;
        lblConnection.Text = "Not connected";
    }

    private async void OnRefreshClick(object sender, RoutedEventArgs e) => await RefreshAllAsync();

    // ---- API calls + UI updates -------------------------------------------

    private async Task RefreshAllAsync()
    {
        try
        {
            var live = await _http.GetFromJsonAsync<LiveOpsDto>($"{_baseUrl}/api/v1/system/live", JsonOpts);
            var server = await _http.GetFromJsonAsync<ServerStatsDto>($"{_baseUrl}/api/v1/system/server", JsonOpts);
            DatabaseStatsDto? db = null;
            try { db = await _http.GetFromJsonAsync<DatabaseStatsDto>($"{_baseUrl}/api/v1/system/database", JsonOpts); } catch { }
            List<AuditRow>? audit = null;
            try { audit = await _http.GetFromJsonAsync<List<AuditRow>>($"{_baseUrl}/api/v1/system/audit?take=50", JsonOpts); } catch { }
            List<TenantRow>? tenants = null;
            try { tenants = await _http.GetFromJsonAsync<List<TenantRow>>($"{_baseUrl}/api/v1/system/tenants", JsonOpts); } catch { }

            ApplyLive(live, server, db, audit);

            if (tenants != null)
            {
                Tenants.Clear();
                foreach (var t in tenants) Tenants.Add(t);
            }

            // Logs tab refreshes only when its checkbox is on (auto-refresh) - heavy payload.
            if (cbLogAutoRefresh.IsChecked == true)
            {
                await RefreshLogsAsync();
            }
        }
        catch (Exception ex)
        {
            lblConnection.Text = $"Connected to {_baseUrl} - refresh failed: {ex.Message}";
        }
    }

    // ---- Operator actions -----------------------------------------------

    private async void OnForceGcClick(object sender, RoutedEventArgs e)
    {
        btnForceGc.IsEnabled = false; lblActionResult.Text = "Forcing GC...";
        try
        {
            var r = await _http.PostAsync($"{_baseUrl}/api/v1/system/runtime/gc", null);
            r.EnsureSuccessStatusCode();
            var result = await r.Content.ReadFromJsonAsync<GcResultDto>(JsonOpts);
            lblActionResult.Text = $"GC freed {(result?.FreedBytes ?? 0) / 1024 / 1024:N0} MB in {result?.DurationMs ?? 0} ms";
        }
        catch (Exception ex)
        {
            lblActionResult.Text = $"GC failed: {ex.Message}";
        }
        finally
        {
            btnForceGc.IsEnabled = true;
        }
    }

    /// <summary>Restart-the-service from a non-elevated WPF process: shell out to net.exe
    /// with Verb=runas so the user gets one UAC prompt. We don't host service control
    /// inside this process because that would mean running the whole console elevated.</summary>
    private void OnRestartServiceClick(object sender, RoutedEventArgs e)
    {
        var confirm = MessageBox.Show(
            "Restart the JamaatApi Windows Service now? The web UI will be unreachable for a few seconds.",
            "Restart service?", MessageBoxButton.OKCancel, MessageBoxImage.Warning);
        if (confirm != MessageBoxResult.OK) return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c net.exe stop JamaatApi & net.exe start JamaatApi",
                Verb = "runas",
                UseShellExecute = true,
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
            });
            lblActionResult.Text = "Service restart requested (check status in a few seconds).";
        }
        catch (System.ComponentModel.Win32Exception w) when (w.NativeErrorCode == 1223)
        {
            lblActionResult.Text = "Restart cancelled (UAC dismissed).";
        }
        catch (Exception ex)
        {
            lblActionResult.Text = $"Restart failed: {ex.Message}";
        }
    }

    // ---- Logs tab --------------------------------------------------------

    private async Task RefreshLogsAsync()
    {
        try
        {
            var take = int.TryParse((cbLogTake.SelectedItem as ComboBoxItem)?.Content?.ToString(), out var t) ? t : 500;
            var logs = await _http.GetFromJsonAsync<LogTailDto>($"{_baseUrl}/api/v1/system/logs?take={take}", JsonOpts);
            if (logs == null) return;
            tbLogTail.Text = string.Join("\n", logs.Lines ?? new List<string>());
            lblLogPath.Text = $"{logs.FilePath}  ·  {logs.LineCount} lines  ·  {logs.LastWriteAt:yyyy-MM-dd HH:mm}";
            // Auto-scroll to the newest line.
            tbLogTail.CaretIndex = tbLogTail.Text.Length;
            tbLogTail.ScrollToEnd();
        }
        catch (HttpRequestException ex) when ((int?)ex.StatusCode == 404)
        {
            tbLogTail.Text = "(no log files yet — the service may not have written to logs/ yet)";
            lblLogPath.Text = "";
        }
        catch (Exception ex)
        {
            tbLogTail.Text = "Log fetch failed: " + ex.Message;
            lblLogPath.Text = "";
        }
    }

    private async void OnRefreshLogsClick(object sender, RoutedEventArgs e) => await RefreshLogsAsync();

    private void ApplyLive(LiveOpsDto? live, ServerStatsDto? server, DatabaseStatsDto? db, List<AuditRow>? audit)
    {
        // KPIs
        if (server != null)
        {
            kpiStatus.Text = "Healthy";
            kpiUsers.Text = (live?.OnlineUserCount ?? 0).ToString();
            kpiReqs.Text = (live?.Requests?.Last1Min ?? 0).ToString();
            kpiAlerts.Text = (live?.OpenAlertCount ?? 0).ToString();
        }
        else
        {
            kpiStatus.Text = "Degraded";
        }

        // Server detail grid
        BuildKvRows(serverGrid, new List<(string, string)>
        {
            ("Machine", server?.MachineName ?? "-"),
            ("OS", server?.OsDescription ?? "-"),
            ("Runtime", server?.DotnetVersion ?? "-"),
            ("Environment", server?.Environment ?? "-"),
            ("Uptime", server?.ProcessUptime ?? "-"),
            ("Process CPU", $"{server?.CpuPercent ?? 0:F1} %"),
            ("Working set", $"{server?.ProcessWorkingSetMb ?? 0} MB"),
            ("RAM (system)", $"{server?.SystemRamPercent ?? 0:F1} %"),
        });

        // Database grid
        BuildKvRows(dbGrid, new List<(string, string)>
        {
            ("Database", db?.DatabaseName ?? "-"),
            ("Server version", db?.ServerVersion ?? "-"),
            ("Total size", $"{db?.TotalSizeMb ?? 0} MB"),
            ("Active sessions", (db?.ConnectionCount ?? 0).ToString()),
            ("Recovery model", db?.RecoveryModel ?? "-"),
            ("Last full backup", db?.LastBackupAt?.ToString("yyyy-MM-dd HH:mm") ?? "never"),
        });

        // Lists
        Alerts.Clear();
        if (live?.RecentAlerts != null) foreach (var a in live.RecentAlerts) Alerts.Add(a);
        Errors.Clear();
        if (live?.RecentErrors != null) foreach (var e in live.RecentErrors) Errors.Add(e);
        Logins.Clear();
        if (live?.RecentLogins != null) foreach (var l in live.RecentLogins) Logins.Add(l);
        Audit.Clear();
        if (audit != null) foreach (var a in audit) Audit.Add(a);
    }

    private static void BuildKvRows(Grid grid, List<(string K, string V)> rows)
    {
        grid.Children.Clear();
        grid.RowDefinitions.Clear();
        for (var i = 0; i < rows.Count; i++)
        {
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var k = new TextBlock
            {
                Text = rows[i].K,
                Foreground = (System.Windows.Media.Brush)Application.Current.Resources["BrandMuted"],
                Margin = new Thickness(0, 4, 8, 4),
                FontSize = 12,
            };
            Grid.SetRow(k, i); Grid.SetColumn(k, 0);
            var v = new TextBlock
            {
                Text = rows[i].V,
                Foreground = (System.Windows.Media.Brush)Application.Current.Resources["BrandText"],
                Margin = new Thickness(0, 4, 0, 4),
                FontSize = 12,
                TextWrapping = TextWrapping.Wrap,
            };
            Grid.SetRow(v, i); Grid.SetColumn(v, 1);
            grid.Children.Add(k);
            grid.Children.Add(v);
        }
    }

    private static string Trim(string s, int max) =>
        string.IsNullOrEmpty(s) || s.Length <= max ? s : s[..max] + "...";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

// ---- DTOs ----------------------------------------------------------------
// Trimmed to just the fields the console needs. JsonSerializer ignores extras, so no
// breakage when the API adds more fields over time.

internal sealed class LoginResponse
{
    public string? AccessToken { get; set; }
}

internal sealed class LiveOpsDto
{
    public List<AlertRow>? RecentAlerts { get; set; }
    public List<ErrorRow>? RecentErrors { get; set; }
    public List<LoginRow>? RecentLogins { get; set; }
    public int OnlineUserCount { get; set; }
    public int OpenAlertCount { get; set; }
    public RequestRateDto? Requests { get; set; }
}

internal sealed class RequestRateDto
{
    public int Last1Min { get; set; }
    public int Last5Min { get; set; }
}

internal sealed class ServerStatsDto
{
    public string? MachineName { get; set; }
    public string? OsDescription { get; set; }
    public string? DotnetVersion { get; set; }
    public string? Environment { get; set; }
    public string? ProcessUptime { get; set; }
    public double CpuPercent { get; set; }
    public long ProcessWorkingSetMb { get; set; }
    public double SystemRamPercent { get; set; }
}

internal sealed class DatabaseStatsDto
{
    public string? DatabaseName { get; set; }
    public string? ServerVersion { get; set; }
    public long TotalSizeMb { get; set; }
    public int ConnectionCount { get; set; }
    public string? RecoveryModel { get; set; }
    public DateTime? LastBackupAt { get; set; }
}

public sealed class AlertRow
{
    public string Severity { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Title { get; set; } = "";
    public DateTime FirstSeenAtUtc { get; set; }
    public DateTime LastSeenAtUtc { get; set; }
    public int RepeatCount { get; set; }
    public bool Acknowledged { get; set; }
}

public sealed class ErrorRow
{
    public DateTime OccurredAtUtc { get; set; }
    public string? Severity { get; set; }
    public string? Source { get; set; }
    public int? HttpStatus { get; set; }
    public string? Endpoint { get; set; }
    public string? Message { get; set; }
}

public sealed class LoginRow
{
    public DateTime AttemptedAtUtc { get; set; }
    public bool Success { get; set; }
    public string? Identifier { get; set; }
    public string? IpAddress { get; set; }
    public string? GeoCountry { get; set; }
    public string? FailureReason { get; set; }
}

public sealed class AuditRow
{
    public DateTime AtUtc { get; set; }
    public string ActionKey { get; set; } = "";
    public string UserName { get; set; } = "";
    public string Summary { get; set; } = "";
}

public sealed class TenantRow
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string BaseCurrency { get; set; } = "";
    public int MemberCount { get; set; }
    public int FamilyCount { get; set; }
    public int UserCount { get; set; }
    public int ReceiptCount { get; set; }
    public DateTime? LastActivityAt { get; set; }
}

internal sealed class LogTailDto
{
    public string? FilePath { get; set; }
    public DateTime LastWriteAt { get; set; }
    public int LineCount { get; set; }
    public List<string>? Lines { get; set; }
}

internal sealed class GcResultDto
{
    public long FreedBytes { get; set; }
    public int DurationMs { get; set; }
}
