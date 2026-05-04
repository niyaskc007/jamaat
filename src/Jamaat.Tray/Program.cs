using System.Diagnostics;
using System.Net.Http;
using System.Reflection;
using System.ServiceProcess;
using System.Text.Json;
using System.Windows.Forms;
using Drawing = System.Drawing;

namespace Jamaat.Tray;

/// <summary>
/// JamaatTray.exe - lives in the system tray, monitors the JamaatApi Windows Service,
/// and gives ops a one-click way to open the app, restart the service, view logs, etc.
///
/// Architecture:
///   - No main window. The whole app is a NotifyIcon + ContextMenuStrip + a 10-second
///     timer that re-evaluates state.
///   - Service control actions (Start / Stop / Restart) need admin. We don't run the tray
///     itself elevated (that would be obnoxious); instead we spawn an elevated cmd.exe via
///     UAC for each action. One UAC click per action - acceptable for a daily admin tool.
///   - Reads {InstallDir}\Api\appsettings.json to find the configured port so "Open Jamaat"
///     uses the right URL even if the operator chose a non-default port at install time.
/// </summary>
internal static class Program
{
    private const string ServiceName = "JamaatApi";

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new TrayContext());
    }
}

internal sealed class TrayContext : ApplicationContext
{
    private readonly NotifyIcon _icon;
    private readonly ContextMenuStrip _menu;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };

    private ToolStripMenuItem _miStatus = null!;
    private ToolStripMenuItem _miOpen = null!;
    private ToolStripMenuItem _miStart = null!;
    private ToolStripMenuItem _miStop = null!;
    private ToolStripMenuItem _miRestart = null!;
    private ToolStripMenuItem _miLogs = null!;
    private ToolStripMenuItem _miAbout = null!;
    private ToolStripMenuItem _miQuit = null!;

    private int _configuredPort = 5174;          // overridden from appsettings.json on first poll
    private string _publicHost = "localhost";    // overridden if the install set a public hostname

    public TrayContext()
    {
        _icon = new NotifyIcon
        {
            Icon = LoadEmbeddedIcon(),
            Visible = true,
            Text = "Jamaat",
        };
        _icon.DoubleClick += (_, _) => OpenInBrowser();

        _menu = BuildMenu();
        _icon.ContextMenuStrip = _menu;

        _timer = new System.Windows.Forms.Timer { Interval = 10_000 };
        _timer.Tick += async (_, _) => await RefreshStateAsync();
        _timer.Start();

        // First refresh immediately so the icon starts in the right colour.
        _ = Task.Run(RefreshStateAsync);
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();

        _miStatus = new ToolStripMenuItem("Checking status...") { Enabled = false };
        _miOpen = new ToolStripMenuItem("Open Jamaat", null, (_, _) => OpenInBrowser());
        _miOpen.Font = new Drawing.Font(_miOpen.Font, Drawing.FontStyle.Bold);

        _miStart = new ToolStripMenuItem("Start service", null, (_, _) => RunElevated("net.exe start " + Program_Service()));
        _miStop = new ToolStripMenuItem("Stop service", null, (_, _) => RunElevated("net.exe stop " + Program_Service()));
        _miRestart = new ToolStripMenuItem("Restart service", null, (_, _) =>
            RunElevated("net.exe stop " + Program_Service() + " & net.exe start " + Program_Service()));

        _miLogs = new ToolStripMenuItem("View logs folder", null, (_, _) => OpenLogsFolder());

        _miAbout = new ToolStripMenuItem("About Jamaat...", null, (_, _) => ShowAbout());
        _miQuit = new ToolStripMenuItem("Quit JamaatTray", null, (_, _) => ExitThread());

        menu.Items.AddRange(new ToolStripItem[]
        {
            _miStatus,
            new ToolStripSeparator(),
            _miOpen,
            new ToolStripSeparator(),
            _miStart,
            _miStop,
            _miRestart,
            new ToolStripSeparator(),
            _miLogs,
            new ToolStripSeparator(),
            _miAbout,
            _miQuit,
        });

        return menu;
    }

    private static string Program_Service() => "JamaatApi";

    /// <summary>Polls service state + reads appsettings to keep our cached port fresh.</summary>
    private async Task RefreshStateAsync()
    {
        try
        {
            var (state, identity, pid) = TryGetServiceState();

            // Re-read appsettings each tick so we honour changes without restarting the tray.
            var (port, host) = TryReadConfig();
            _configuredPort = port;
            _publicHost = host;

            // Hit the API health endpoint to distinguish "process running but not bound yet"
            // from "running and serving". Cheap; 2-second timeout via HttpClient default.
            var apiOk = await TryProbeApiAsync(_configuredPort);

            // Build the human-readable status line for the menu's first item.
            var label = state switch
            {
                ServiceControllerStatus.Running when apiOk =>
                    $"Running on :{_configuredPort} (PID {pid}) - API healthy",
                ServiceControllerStatus.Running =>
                    $"Running on :{_configuredPort} (PID {pid}) - API not responding yet",
                ServiceControllerStatus.Stopped => "Service stopped",
                ServiceControllerStatus.StartPending => "Starting...",
                ServiceControllerStatus.StopPending => "Stopping...",
                _ => state == 0 ? "Service not installed" : state.ToString(),
            };

            // Update UI on the message-pump thread.
            if (_menu.IsDisposed) return;
            _menu.Invoke(() =>
            {
                _miStatus.Text = label;

                // Tooltip + tray text track the same state.
                _icon.Text = "Jamaat - " + (label.Length > 60 ? label[..57] + "..." : label);

                // Enable / disable items by state.
                _miStart.Enabled = state == 0 || state == ServiceControllerStatus.Stopped;
                _miStop.Enabled = state == ServiceControllerStatus.Running;
                _miRestart.Enabled = state == ServiceControllerStatus.Running;
                _miOpen.Enabled = state == ServiceControllerStatus.Running && apiOk;
            });
        }
        catch (Exception ex)
        {
            // Refresh must never crash the tray. Reflect the error in the tooltip so ops can
            // see something is off without diving into Event Viewer.
            try { _icon.Text = "Jamaat - tray error: " + ex.Message; } catch { }
        }
    }

    /// <summary>Returns service state + identity + PID, or (0, "", 0) if not installed.</summary>
    private static (ServiceControllerStatus State, string Identity, int Pid) TryGetServiceState()
    {
        try
        {
            using var sc = new ServiceController(Program_Service());
            var state = sc.Status;
            // PID + StartName aren't on ServiceController; fall back to WMI for those.
            var pid = 0;
            var identity = "";
            try
            {
                using var search = new System.Management.ManagementObjectSearcher(
                    $"SELECT ProcessId, StartName FROM Win32_Service WHERE Name='{Program_Service()}'");
                foreach (var o in search.Get())
                {
                    pid = Convert.ToInt32(o["ProcessId"] ?? 0);
                    identity = o["StartName"]?.ToString() ?? "";
                    break;
                }
            }
            catch { }
            return (state, identity, pid);
        }
        catch
        {
            return (0, "", 0);
        }
    }

    /// <summary>Read port + public host from the installed appsettings.json. Falls back to
    /// reasonable defaults if the file isn't where we expect it.</summary>
    private (int Port, string Host) TryReadConfig()
    {
        try
        {
            // We don't know the install dir at compile time. Find it by service binPath.
            var binPath = TryReadServiceBinPath();
            if (string.IsNullOrEmpty(binPath)) return (_configuredPort, _publicHost);

            // binPath looks like:  "C:\Program Files\Jamaat\Api\Jamaat.Api.exe" --urls http://*:5176
            var portMatch = System.Text.RegularExpressions.Regex.Match(binPath, @":(\d{2,5})\s*$");
            var port = portMatch.Success ? int.Parse(portMatch.Groups[1].Value) : 5174;

            // Find appsettings.json next to Jamaat.Api.exe to grab the host.
            var exePath = System.Text.RegularExpressions.Regex.Match(binPath, "^\"(.+?)\"");
            var host = "localhost";
            if (exePath.Success)
            {
                var apiDir = Path.GetDirectoryName(exePath.Groups[1].Value);
                var cfgPath = apiDir == null ? null : Path.Combine(apiDir, "appsettings.json");
                if (cfgPath != null && File.Exists(cfgPath))
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(cfgPath));
                    if (doc.RootElement.TryGetProperty("Cors", out var cors)
                        && cors.TryGetProperty("Origins", out var origins)
                        && origins.GetArrayLength() > 0)
                    {
                        // First origin is "http://<host>:<port>" by our installer's convention.
                        var first = origins[0].GetString() ?? "";
                        var hostMatch = System.Text.RegularExpressions.Regex.Match(first, @"^https?://([^:/]+)");
                        if (hostMatch.Success) host = hostMatch.Groups[1].Value;
                    }
                }
            }
            return (port, host);
        }
        catch
        {
            return (_configuredPort, _publicHost);
        }
    }

    private static string TryReadServiceBinPath()
    {
        try
        {
            using var search = new System.Management.ManagementObjectSearcher(
                $"SELECT PathName FROM Win32_Service WHERE Name='{Program_Service()}'");
            foreach (var o in search.Get())
            {
                return o["PathName"]?.ToString() ?? "";
            }
        }
        catch { }
        return "";
    }

    private async Task<bool> TryProbeApiAsync(int port)
    {
        try
        {
            using var resp = await _http.GetAsync($"http://localhost:{port}/api/v1/setup/status");
            return resp.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private void OpenInBrowser()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = $"http://{_publicHost}:{_configuredPort}/login",
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Could not open browser: {ex.Message}", "Jamaat", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    /// <summary>Spawns cmd.exe elevated to run a service-control verb. UAC pops once.</summary>
    private static void RunElevated(string commandLine)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c " + commandLine,
                Verb = "runas",
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
        }
        catch (Exception ex)
        {
            // Common case: user dismissed the UAC prompt -> swallow silently. Anything else
            // we surface so they know to look at the Event Log.
            if (ex is System.ComponentModel.Win32Exception w && w.NativeErrorCode == 1223) return;
            MessageBox.Show($"Service action failed: {ex.Message}", "Jamaat", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void OpenLogsFolder()
    {
        var binPath = TryReadServiceBinPath();
        var match = System.Text.RegularExpressions.Regex.Match(binPath, "^\"(.+?)\"");
        if (!match.Success)
        {
            MessageBox.Show("Could not locate the install directory.", "Jamaat", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        var apiDir = Path.GetDirectoryName(match.Groups[1].Value);
        if (apiDir == null) return;
        var logsDir = Path.Combine(Path.GetDirectoryName(apiDir) ?? apiDir, "Logs");
        if (!Directory.Exists(logsDir)) logsDir = Path.Combine(apiDir, "logs");
        if (Directory.Exists(logsDir))
        {
            Process.Start(new ProcessStartInfo { FileName = logsDir, UseShellExecute = true });
        }
    }

    private void ShowAbout()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0";
        MessageBox.Show(
            "Jamaat Tray Helper\n\n" +
            $"Version: {version}\n" +
            "A product of Ubrixy Technologies\n" +
            "https://www.ubrixy.com/\n\n" +
            "Right-click for service controls.",
            "About Jamaat",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private static Drawing.Icon LoadEmbeddedIcon()
    {
        // Icon ships as content next to JamaatTray.exe.
        var iconPath = Path.Combine(AppContext.BaseDirectory, "jamaat.ico");
        if (File.Exists(iconPath))
        {
            try { return new Drawing.Icon(iconPath); } catch { }
        }
        return SystemIcons.Application;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _timer.Stop();
            _timer.Dispose();
            _icon.Visible = false;
            _icon.Dispose();
            _menu.Dispose();
            _http.Dispose();
        }
        base.Dispose(disposing);
    }
}
