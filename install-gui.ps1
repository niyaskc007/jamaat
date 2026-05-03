<#
.SYNOPSIS
    Jamaat one-click installer with a WPF wizard UI.

.DESCRIPTION
    A multi-page installer that walks an operator end-to-end through deploying the Jamaat web
    app on a Windows machine. Pages:

      1. Welcome            — banner + version
      2. Prerequisites      — auto-checks .NET 10, Node 20+, SQL Server, disk space
      3. Database           — server / db name / auth + a "Test connection" button
      4. Paths & ports      — install root, API port, web port, public host, CORS origins
      5. Admin account      — full name / email / password / confirm
      6. Review             — summary of every choice
      7. Install            — progress bar + live log of build / publish / launch steps

    Single-process deployment: the installer publishes the API to `$InstallRoot\Api`, builds
    the React bundle, copies dist/* to `$InstallRoot\Api\wwwroot\`, patches appsettings.json
    (connection string, ports, admin email/password, Setup:UseWizard=false so DatabaseSeeder
    creates the admin from the operator's input), and launches the API with `--urls`. Browser
    opens to http://localhost:$ApiPort/ which serves both the SPA and the API.

    Invoked from File Explorer by double-clicking install.bat (which calls this with
    -ExecutionPolicy Bypass), or directly from a PowerShell prompt.

.NOTES
    PowerShell 5.1+ on Windows. WPF requires PresentationFramework / PresentationCore which
    ship with the box.

    Why PS+WPF and not a packaged .exe: zero-dependency deploy. The repo ships everything
    needed to install — no separate installer download, no MSI signing, no third-party tool.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# Load WPF + WinForms (the latter for FolderBrowserDialog).
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

$RepoRoot   = Split-Path -Parent $PSCommandPath
$ApiCsproj  = Join-Path $RepoRoot 'src\Jamaat.Api\Jamaat.Api.csproj'
$WebRoot    = Join-Path $RepoRoot 'web\jamaat-web'
$WebDist    = Join-Path $WebRoot 'dist'

# ---------------------------------------------------------------------------
# Wizard state — every page reads/writes this hashtable. Reviewing or going
# back doesn't lose anything because controls re-bind from these values on
# page enter.
# ---------------------------------------------------------------------------
$script:State = @{
    DbServer         = 'localhost'
    DbName           = 'JAMAAT'
    DbAuth           = 'Windows'      # 'Windows' | 'Sql'
    DbUser           = ''
    DbPassword       = ''
    DbConnString     = ''             # computed from the above

    InstallRoot      = 'C:\Program Files\Jamaat'
    ApiPort          = 5174
    PublicHost       = 'localhost'
    CorsOrigins      = ''             # newline-separated extra origins

    AdminFullName    = 'System Administrator'
    AdminEmail       = ''
    AdminPassword    = ''
    AdminConfirm     = ''

    TenantName       = 'Default Jamaat'
    TenantCode       = 'JAMAAT'
    BaseCurrency     = 'AED'
}

# Build the connection string from the structured fields. Keeps the test
# button + the appsettings patch in sync with whatever the operator picked.
function Get-ConnectionString {
    $base = "Server=$($script:State.DbServer);Database=$($script:State.DbName);"
    if ($script:State.DbAuth -eq 'Windows') {
        return $base + 'Integrated Security=true;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true'
    }
    return $base + "User Id=$($script:State.DbUser);Password=$($script:State.DbPassword);TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true"
}

# ---------------------------------------------------------------------------
# Window shell. The ContentControl `MainContent` is what we swap when the
# user navigates between pages. Header + footer (Back/Next) stay constant.
# ---------------------------------------------------------------------------
$shellXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Jamaat Installer"
        Width="720" Height="560" MinWidth="640" MinHeight="480"
        WindowStartupLocation="CenterScreen"
        FontFamily="Segoe UI" FontSize="13" Background="#F8FAFC">
  <Grid>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto" />
      <RowDefinition Height="*" />
      <RowDefinition Height="Auto" />
    </Grid.RowDefinitions>

    <!-- Header -->
    <Border Grid.Row="0" Background="#0B6E63" Padding="20,16">
      <StackPanel>
        <TextBlock Text="Jamaat" Foreground="White" FontSize="22" FontWeight="Bold" />
        <TextBlock x:Name="HeaderSubtitle" Text="One-click installer" Foreground="#CFE6DF" FontSize="12" Margin="0,2,0,0" />
      </StackPanel>
    </Border>

    <!-- Page content -->
    <ContentControl x:Name="MainContent" Grid.Row="1" Margin="20" />

    <!-- Footer with Back / Next buttons -->
    <Border Grid.Row="2" Background="White" BorderBrush="#E5E9EF" BorderThickness="0,1,0,0" Padding="20,12">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*" />
          <ColumnDefinition Width="Auto" />
          <ColumnDefinition Width="Auto" />
          <ColumnDefinition Width="Auto" />
        </Grid.ColumnDefinitions>
        <TextBlock x:Name="StepIndicator" Grid.Column="0" VerticalAlignment="Center"
                   Foreground="#64748B" FontSize="12" Text="Step 1 of 7" />
        <Button x:Name="BackBtn" Grid.Column="1" Content="Back" Width="90" Height="32"
                Margin="0,0,8,0" />
        <Button x:Name="NextBtn" Grid.Column="2" Content="Next" Width="110" Height="32"
                Background="#0B6E63" Foreground="White" BorderThickness="0" />
        <Button x:Name="CancelBtn" Grid.Column="3" Content="Cancel" Width="80" Height="32"
                Margin="8,0,0,0" />
      </Grid>
    </Border>
  </Grid>
</Window>
"@

[xml]$shellDoc = $shellXaml
$reader = (New-Object System.Xml.XmlNodeReader $shellDoc)
$script:Window = [Windows.Markup.XamlReader]::Load($reader)

$script:MainContent    = $script:Window.FindName('MainContent')
$script:HeaderSubtitle = $script:Window.FindName('HeaderSubtitle')
$script:StepIndicator  = $script:Window.FindName('StepIndicator')
$script:BackBtn        = $script:Window.FindName('BackBtn')
$script:NextBtn        = $script:Window.FindName('NextBtn')
$script:CancelBtn      = $script:Window.FindName('CancelBtn')

$script:CancelBtn.Add_Click({ $script:Window.Close() })

# ---------------------------------------------------------------------------
# Page registry. Each page is { Subtitle, Build, OnEnter, OnNext, NextLabel }
#   - Build:    () -> XAML root element. Called once per visit so values can
#               re-render from $script:State.
#   - OnEnter:  invoked after Build, gets the FrameworkElement to wire events.
#   - OnNext:   returns $true to advance, $false to block (validation failed).
# ---------------------------------------------------------------------------
$script:Pages    = @()
$script:CurIndex = 0

function Show-Page($index) {
    if ($index -lt 0 -or $index -ge $script:Pages.Count) { return }
    $script:CurIndex = $index
    $page = $script:Pages[$index]

    $element = & $page.Build
    $script:MainContent.Content = $element
    $script:HeaderSubtitle.Text = $page.Subtitle
    $script:StepIndicator.Text  = "Step $($index + 1) of $($script:Pages.Count)"
    $script:BackBtn.IsEnabled   = $index -gt 0
    if ($null -ne $page.NextLabel) { $script:NextBtn.Content = $page.NextLabel } else { $script:NextBtn.Content = 'Next' }
    if ($null -ne $page.OnEnter) { & $page.OnEnter $element }
}

# Strongly typed click-handler scaffolding: PS adds events with .Add_Click;
# we reset by removing first-then-attaching to avoid double-fires when a
# page is revisited.
$script:NextHandler = $null
function Set-NextHandler([scriptblock]$handler) {
    if ($script:NextHandler) { $script:NextBtn.Remove_Click($script:NextHandler) }
    $script:NextHandler = $handler
    $script:NextBtn.Add_Click($script:NextHandler)
}
$script:BackHandler = $null
function Set-BackHandler([scriptblock]$handler) {
    if ($script:BackHandler) { $script:BackBtn.Remove_Click($script:BackHandler) }
    $script:BackHandler = $handler
    $script:BackBtn.Add_Click($script:BackHandler)
}

# Default Back handler: just go back one page.
Set-BackHandler { Show-Page ($script:CurIndex - 1) }

function Parse-Xaml($xaml) {
    [xml]$doc = $xaml
    return [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $doc))
}

# ---------------------------------------------------------------------------
# Page 1: Welcome
# ---------------------------------------------------------------------------
$script:Pages += @{
    Subtitle  = 'Welcome'
    Build     = {
        $xaml = @"
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Margin="8">
  <TextBlock Text="Welcome to the Jamaat installer" FontSize="20" FontWeight="SemiBold" Foreground="#0F172A" Margin="0,0,0,12" />
  <TextBlock TextWrapping="Wrap" Foreground="#475569" FontSize="13" LineHeight="20">
    <Run>This wizard installs the Jamaat web application on this machine. It walks through:</Run>
    <LineBreak /><LineBreak />
    <Run FontWeight="SemiBold" Foreground="#0F172A">Prerequisites — </Run>
    <Run>checks for .NET 10 SDK, Node 20+, and a reachable SQL Server.</Run>
    <LineBreak /><LineBreak />
    <Run FontWeight="SemiBold" Foreground="#0F172A">Database — </Run>
    <Run>connection details with a built-in test button.</Run>
    <LineBreak /><LineBreak />
    <Run FontWeight="SemiBold" Foreground="#0F172A">Install paths and ports — </Run>
    <Run>where files go and which ports the app listens on.</Run>
    <LineBreak /><LineBreak />
    <Run FontWeight="SemiBold" Foreground="#0F172A">Admin account — </Run>
    <Run>email and password for the first administrator.</Run>
    <LineBreak /><LineBreak />
    <Run>The whole process takes about 3–5 minutes. You can go back at any step before clicking</Run>
    <Run FontWeight="SemiBold">Install</Run><Run> on the review screen.</Run>
  </TextBlock>
</StackPanel>
"@
        return Parse-Xaml $xaml
    }
    OnEnter   = {
        Set-NextHandler { Show-Page ($script:CurIndex + 1) }
    }
}

# ---------------------------------------------------------------------------
# Page 2: Prerequisites — auto-checked. Next is disabled until all green.
# ---------------------------------------------------------------------------
$script:Pages += @{
    Subtitle  = 'Prerequisites'
    Build     = {
        $xaml = @"
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Margin="8">
  <TextBlock Text="System checks" FontSize="18" FontWeight="SemiBold" Foreground="#0F172A" Margin="0,0,0,4" />
  <TextBlock Text="The installer needs these tools available on PATH." Foreground="#64748B" Margin="0,0,0,16" />
  <Grid>
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="32" />
      <ColumnDefinition Width="160" />
      <ColumnDefinition Width="*" />
    </Grid.ColumnDefinitions>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
    </Grid.RowDefinitions>

    <TextBlock x:Name="DotnetIcon" Grid.Row="0" Grid.Column="0" FontSize="18" />
    <TextBlock Grid.Row="0" Grid.Column="1" Text=".NET 10 SDK" FontWeight="SemiBold" />
    <TextBlock x:Name="DotnetText" Grid.Row="0" Grid.Column="2" Foreground="#475569" />

    <TextBlock x:Name="NodeIcon" Grid.Row="1" Grid.Column="0" FontSize="18" Margin="0,8,0,0" />
    <TextBlock Grid.Row="1" Grid.Column="1" Text="Node.js 20+" FontWeight="SemiBold" Margin="0,8,0,0" />
    <TextBlock x:Name="NodeText" Grid.Row="1" Grid.Column="2" Foreground="#475569" Margin="0,8,0,0" />

    <TextBlock x:Name="NpmIcon" Grid.Row="2" Grid.Column="0" FontSize="18" Margin="0,8,0,0" />
    <TextBlock Grid.Row="2" Grid.Column="1" Text="npm" FontWeight="SemiBold" Margin="0,8,0,0" />
    <TextBlock x:Name="NpmText" Grid.Row="2" Grid.Column="2" Foreground="#475569" Margin="0,8,0,0" />

    <TextBlock x:Name="DiskIcon" Grid.Row="3" Grid.Column="0" FontSize="18" Margin="0,8,0,0" />
    <TextBlock Grid.Row="3" Grid.Column="1" Text="Disk space (≥ 500 MB)" FontWeight="SemiBold" Margin="0,8,0,0" />
    <TextBlock x:Name="DiskText" Grid.Row="3" Grid.Column="2" Foreground="#475569" Margin="0,8,0,0" />

    <Button x:Name="RecheckBtn" Grid.Row="4" Grid.Column="2" Content="Re-check" HorizontalAlignment="Left"
            Width="100" Height="28" Margin="0,16,0,0" />
  </Grid>
  <TextBlock x:Name="HelpText" Foreground="#B45309" TextWrapping="Wrap" Margin="0,16,0,0" FontSize="12" />
</StackPanel>
"@
        return Parse-Xaml $xaml
    }
    OnEnter   = {
        param($el)
        $allOk = $false

        $check = {
            $okDotnet = $false; $okNode = $false; $okNpm = $false; $okDisk = $false
            $help = @()

            try {
                $v = (& dotnet --version 2>$null).Trim()
                if ($v) {
                    $el.FindName('DotnetText').Text = $v
                    if ($v.StartsWith('10.')) {
                        $el.FindName('DotnetIcon').Text = '✓'
                        $el.FindName('DotnetIcon').Foreground = '#0E5C40'
                        $okDotnet = $true
                    } else {
                        $el.FindName('DotnetIcon').Text = '!'
                        $el.FindName('DotnetIcon').Foreground = '#B45309'
                        $help += "Detected .NET $v but the app targets .NET 10. Download from https://dot.net"
                    }
                }
            } catch {
                $el.FindName('DotnetIcon').Text = '✗'
                $el.FindName('DotnetIcon').Foreground = '#DC2626'
                $el.FindName('DotnetText').Text = 'Not found on PATH'
                $help += '.NET 10 SDK is missing. Install from https://dot.net'
            }

            try {
                $v = (& node --version 2>$null).Trim()
                $el.FindName('NodeText').Text = $v
                $major = [int]($v.TrimStart('v').Split('.')[0])
                if ($major -ge 20) {
                    $el.FindName('NodeIcon').Text = '✓'; $el.FindName('NodeIcon').Foreground = '#0E5C40'; $okNode = $true
                } else {
                    $el.FindName('NodeIcon').Text = '!'; $el.FindName('NodeIcon').Foreground = '#B45309'
                    $help += "Node $v is too old. Need 20+. Install from https://nodejs.org"
                }
            } catch {
                $el.FindName('NodeIcon').Text = '✗'; $el.FindName('NodeIcon').Foreground = '#DC2626'
                $el.FindName('NodeText').Text = 'Not found on PATH'
                $help += 'Node.js is missing. Install from https://nodejs.org'
            }

            try {
                $v = (& npm --version 2>$null).Trim()
                $el.FindName('NpmText').Text = $v
                $el.FindName('NpmIcon').Text = '✓'; $el.FindName('NpmIcon').Foreground = '#0E5C40'; $okNpm = $true
            } catch {
                $el.FindName('NpmIcon').Text = '✗'; $el.FindName('NpmIcon').Foreground = '#DC2626'
                $el.FindName('NpmText').Text = 'Not found'
                $help += 'npm is missing (bundled with Node.js).'
            }

            try {
                $rootDrive = (Split-Path $script:State.InstallRoot -Qualifier).TrimEnd(':')
                $free = (Get-PSDrive -Name $rootDrive -ErrorAction SilentlyContinue).Free
                $freeMb = [int]($free / 1MB)
                $el.FindName('DiskText').Text = "$freeMb MB free on $((Split-Path $script:State.InstallRoot -Qualifier))"
                if ($freeMb -ge 500) {
                    $el.FindName('DiskIcon').Text = '✓'; $el.FindName('DiskIcon').Foreground = '#0E5C40'; $okDisk = $true
                } else {
                    $el.FindName('DiskIcon').Text = '!'; $el.FindName('DiskIcon').Foreground = '#B45309'
                    $help += "Only $freeMb MB free. Free up at least 500 MB before installing."
                }
            } catch {
                $el.FindName('DiskIcon').Text = '!'; $el.FindName('DiskIcon').Foreground = '#B45309'
                $el.FindName('DiskText').Text = 'Could not determine free space'
                $okDisk = $true  # don't block
            }

            $el.FindName('HelpText').Text = ($help -join "  ·  ")
            $script:NextBtn.IsEnabled = $okDotnet -and $okNode -and $okNpm -and $okDisk
            $script:AllOk = $okDotnet -and $okNode -and $okNpm -and $okDisk
        }
        # Wrap the click handler so any unhandled exception can't tear down the
        # WPF dispatcher and close the wizard. WPF treats unhandled exceptions
        # in event handlers as fatal by default.
        $el.FindName('RecheckBtn').Add_Click({
            try { & $check } catch {
                $el.FindName('HelpText').Text = "Re-check failed: $($_.Exception.Message)"
            }
        })
        try { & $check } catch {
            $el.FindName('HelpText').Text = "Initial check failed: $($_.Exception.Message)"
        }
        Set-NextHandler { Show-Page ($script:CurIndex + 1) }
    }
}

# ---------------------------------------------------------------------------
# Page 3: Database. Server / DB / auth / test connection.
# ---------------------------------------------------------------------------
$script:Pages += @{
    Subtitle  = 'Database connection'
    Build     = {
        $xaml = @"
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Margin="8">
  <TextBlock Text="SQL Server connection" FontSize="18" FontWeight="SemiBold" Foreground="#0F172A" Margin="0,0,0,4" />
  <TextBlock Text="The app uses SQL Server. Pick the server + database name + auth, then test." Foreground="#64748B" Margin="0,0,0,16" TextWrapping="Wrap" />
  <Grid>
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="160" />
      <ColumnDefinition Width="*" />
    </Grid.ColumnDefinitions>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
    </Grid.RowDefinitions>

    <TextBlock Grid.Row="0" Grid.Column="0" Text="Server" VerticalAlignment="Center" />
    <TextBox  x:Name="ServerBox" Grid.Row="0" Grid.Column="1" Height="28" Padding="6,2" />

    <TextBlock Grid.Row="1" Grid.Column="0" Text="Database name" VerticalAlignment="Center" Margin="0,8,0,0" />
    <TextBox  x:Name="DbBox" Grid.Row="1" Grid.Column="1" Height="28" Padding="6,2" Margin="0,8,0,0" />

    <TextBlock Grid.Row="2" Grid.Column="0" Text="Authentication" VerticalAlignment="Center" Margin="0,8,0,0" />
    <StackPanel Grid.Row="2" Grid.Column="1" Orientation="Horizontal" Margin="0,8,0,0">
      <RadioButton x:Name="AuthWin" Content="Windows" GroupName="Auth" IsChecked="True" Margin="0,0,16,0" />
      <RadioButton x:Name="AuthSql" Content="SQL Server login" GroupName="Auth" />
    </StackPanel>

    <TextBlock Grid.Row="3" Grid.Column="0" Text="User" VerticalAlignment="Center" Margin="0,8,0,0" />
    <TextBox  x:Name="UserBox" Grid.Row="3" Grid.Column="1" Height="28" Padding="6,2" Margin="0,8,0,0" IsEnabled="False" />

    <TextBlock Grid.Row="4" Grid.Column="0" Text="Password" VerticalAlignment="Center" Margin="0,8,0,0" />
    <PasswordBox x:Name="PwdBox" Grid.Row="4" Grid.Column="1" Height="28" Padding="6,2" Margin="0,8,0,0" IsEnabled="False" />

    <StackPanel Grid.Row="5" Grid.Column="1" Orientation="Horizontal" Margin="0,16,0,0">
      <Button x:Name="TestBtn" Content="Test connection" Width="140" Height="30" />
      <TextBlock x:Name="TestResult" VerticalAlignment="Center" Margin="12,0,0,0" />
    </StackPanel>
  </Grid>
</StackPanel>
"@
        return Parse-Xaml $xaml
    }
    OnEnter   = {
        param($el)
        $el.FindName('ServerBox').Text = $script:State.DbServer
        $el.FindName('DbBox').Text     = $script:State.DbName
        $el.FindName('UserBox').Text   = $script:State.DbUser
        $el.FindName('PwdBox').Password= $script:State.DbPassword
        if ($script:State.DbAuth -eq 'Sql') {
            $el.FindName('AuthSql').IsChecked = $true
            $el.FindName('UserBox').IsEnabled = $true
            $el.FindName('PwdBox').IsEnabled  = $true
        }

        $el.FindName('AuthWin').Add_Checked({
            $el.FindName('UserBox').IsEnabled = $false
            $el.FindName('PwdBox').IsEnabled  = $false
        })
        $el.FindName('AuthSql').Add_Checked({
            $el.FindName('UserBox').IsEnabled = $true
            $el.FindName('PwdBox').IsEnabled  = $true
        })

        $captureState = {
            $script:State.DbServer = $el.FindName('ServerBox').Text.Trim()
            $script:State.DbName   = $el.FindName('DbBox').Text.Trim()
            $script:State.DbUser   = $el.FindName('UserBox').Text.Trim()
            $script:State.DbPassword = $el.FindName('PwdBox').Password
            $script:State.DbAuth   = if ($el.FindName('AuthSql').IsChecked) { 'Sql' } else { 'Windows' }
            $script:State.DbConnString = Get-ConnectionString
        }

        $el.FindName('TestBtn').Add_Click({
            & $captureState
            $resultLbl = $el.FindName('TestResult')
            $resultLbl.Text = 'Testing...'
            $resultLbl.Foreground = '#475569'
            try {
                $cs = $script:State.DbConnString
                $conn = New-Object System.Data.SqlClient.SqlConnection($cs)
                $conn.Open()
                $conn.Close()
                $resultLbl.Text = '✓ Connection OK'
                $resultLbl.Foreground = '#0E5C40'
            } catch {
                $resultLbl.Text = '✗ ' + $_.Exception.Message.Split([char]13)[0]
                $resultLbl.Foreground = '#DC2626'
            }
        })

        Set-NextHandler {
            & $captureState
            if (-not $script:State.DbServer -or -not $script:State.DbName) {
                [System.Windows.MessageBox]::Show($script:Window, 'Server and database name are required.', 'Validation', 'OK', 'Warning') | Out-Null
                return
            }
            Show-Page ($script:CurIndex + 1)
        }
    }
}

# ---------------------------------------------------------------------------
# Page 4: Paths & ports
# ---------------------------------------------------------------------------
$script:Pages += @{
    Subtitle  = 'Paths and ports'
    Build     = {
        $xaml = @"
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Margin="8">
  <TextBlock Text="Where to install + which port to listen on" FontSize="18" FontWeight="SemiBold" Foreground="#0F172A" Margin="0,0,0,4" />
  <TextBlock Text="The API serves both the web UI and the REST endpoints from a single port." Foreground="#64748B" Margin="0,0,0,16" TextWrapping="Wrap" />
  <Grid>
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="160" />
      <ColumnDefinition Width="*" />
      <ColumnDefinition Width="Auto" />
    </Grid.ColumnDefinitions>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
    </Grid.RowDefinitions>
    <TextBlock Grid.Row="0" Grid.Column="0" Text="Install root" VerticalAlignment="Center" />
    <TextBox  x:Name="RootBox" Grid.Row="0" Grid.Column="1" Height="28" Padding="6,2" />
    <Button   x:Name="BrowseBtn" Grid.Row="0" Grid.Column="2" Content="Browse..." Width="80" Height="28" Margin="6,0,0,0" />
    <TextBlock Grid.Row="1" Grid.Column="0" Text="API + web port" VerticalAlignment="Center" Margin="0,12,0,0" />
    <TextBox  x:Name="PortBox" Grid.Row="1" Grid.Column="1" Height="28" Padding="6,2" Margin="0,12,0,0" Width="100" HorizontalAlignment="Left" />
    <TextBlock Grid.Row="2" Grid.Column="0" Text="Public hostname" VerticalAlignment="Center" Margin="0,12,0,0" />
    <TextBox  x:Name="HostBox" Grid.Row="2" Grid.Column="1" Height="28" Padding="6,2" Margin="0,12,0,0" />
    <TextBlock Grid.Row="3" Grid.Column="0" Text="Extra CORS origins" VerticalAlignment="Top" Margin="0,12,0,0" />
    <TextBox  x:Name="CorsBox" Grid.Row="3" Grid.Column="1" Grid.ColumnSpan="2" Height="80" Padding="6,2" Margin="0,12,0,0"
              AcceptsReturn="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto"
              ToolTip="Optional. One URL per line. Leave blank if you only access the app via the public hostname above." />
  </Grid>
  <TextBlock Foreground="#64748B" FontSize="11" Margin="0,12,0,0" TextWrapping="Wrap"
             Text="The app installs into Install root\Api and serves on http://Public hostname:port. CORS only matters if you front-end the API from a separate domain." />
</StackPanel>
"@
        return Parse-Xaml $xaml
    }
    OnEnter   = {
        param($el)
        $el.FindName('RootBox').Text = $script:State.InstallRoot
        $el.FindName('PortBox').Text = "$($script:State.ApiPort)"
        $el.FindName('HostBox').Text = $script:State.PublicHost
        $el.FindName('CorsBox').Text = $script:State.CorsOrigins

        $el.FindName('BrowseBtn').Add_Click({
            $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
            $dlg.SelectedPath = $el.FindName('RootBox').Text
            if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                $el.FindName('RootBox').Text = $dlg.SelectedPath
            }
        })

        Set-NextHandler {
            $script:State.InstallRoot = $el.FindName('RootBox').Text.Trim()
            $portText = $el.FindName('PortBox').Text.Trim()
            $port = 0
            if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
                [System.Windows.MessageBox]::Show($script:Window, 'Port must be a number between 1 and 65535.', 'Validation', 'OK', 'Warning') | Out-Null
                return
            }
            $script:State.ApiPort     = $port
            $script:State.PublicHost  = $el.FindName('HostBox').Text.Trim()
            $script:State.CorsOrigins = $el.FindName('CorsBox').Text.Trim()
            if (-not $script:State.InstallRoot) {
                [System.Windows.MessageBox]::Show($script:Window, 'Install root is required.', 'Validation', 'OK', 'Warning') | Out-Null
                return
            }
            Show-Page ($script:CurIndex + 1)
        }
    }
}

# ---------------------------------------------------------------------------
# Page 5: Admin account
# ---------------------------------------------------------------------------
$script:Pages += @{
    Subtitle  = 'Administrator account'
    Build     = {
        $xaml = @"
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Margin="8">
  <TextBlock Text="The first administrator" FontSize="18" FontWeight="SemiBold" Foreground="#0F172A" Margin="0,0,0,4" />
  <TextBlock TextWrapping="Wrap" Foreground="#64748B" Margin="0,0,0,16">
    The installer creates this user on first start. They have full permissions and can create more users from the admin module afterwards.
  </TextBlock>
  <Grid>
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="160" />
      <ColumnDefinition Width="*" />
    </Grid.ColumnDefinitions>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
      <RowDefinition Height="Auto" />
    </Grid.RowDefinitions>
    <TextBlock Grid.Row="0" Grid.Column="0" Text="Full name" VerticalAlignment="Center" />
    <TextBox  x:Name="NameBox" Grid.Row="0" Grid.Column="1" Height="28" Padding="6,2" />

    <TextBlock Grid.Row="1" Grid.Column="0" Text="Email" VerticalAlignment="Center" Margin="0,8,0,0" />
    <TextBox  x:Name="EmailBox" Grid.Row="1" Grid.Column="1" Height="28" Padding="6,2" Margin="0,8,0,0" />

    <TextBlock Grid.Row="2" Grid.Column="0" Text="Password (≥ 8 chars)" VerticalAlignment="Center" Margin="0,8,0,0" />
    <PasswordBox x:Name="PwdBox" Grid.Row="2" Grid.Column="1" Height="28" Padding="6,2" Margin="0,8,0,0" />

    <TextBlock Grid.Row="3" Grid.Column="0" Text="Confirm password" VerticalAlignment="Center" Margin="0,8,0,0" />
    <PasswordBox x:Name="ConfirmBox" Grid.Row="3" Grid.Column="1" Height="28" Padding="6,2" Margin="0,8,0,0" />

    <Separator Grid.Row="4" Grid.ColumnSpan="2" Margin="0,16,0,8" />

    <TextBlock Grid.Row="5" Grid.Column="0" Text="Jamaat name" VerticalAlignment="Center" />
    <TextBox  x:Name="TenantBox" Grid.Row="5" Grid.Column="1" Height="28" Padding="6,2" />

    <TextBlock Grid.Row="6" Grid.Column="0" Text="Base currency" VerticalAlignment="Center" Margin="0,8,0,0" />
    <ComboBox x:Name="CcyBox" Grid.Row="6" Grid.Column="1" Height="28" Margin="0,8,0,0" Width="140" HorizontalAlignment="Left">
      <ComboBoxItem Content="AED" />
      <ComboBoxItem Content="INR" />
      <ComboBoxItem Content="USD" />
      <ComboBoxItem Content="GBP" />
      <ComboBoxItem Content="PKR" />
      <ComboBoxItem Content="KWD" />
      <ComboBoxItem Content="SAR" />
    </ComboBox>
  </Grid>
</StackPanel>
"@
        return Parse-Xaml $xaml
    }
    OnEnter   = {
        param($el)
        $el.FindName('NameBox').Text   = $script:State.AdminFullName
        $el.FindName('EmailBox').Text  = $script:State.AdminEmail
        $el.FindName('PwdBox').Password    = $script:State.AdminPassword
        $el.FindName('ConfirmBox').Password = $script:State.AdminConfirm
        $el.FindName('TenantBox').Text = $script:State.TenantName
        $ccy = $el.FindName('CcyBox')
        for ($i = 0; $i -lt $ccy.Items.Count; $i++) {
            if ($ccy.Items[$i].Content -eq $script:State.BaseCurrency) { $ccy.SelectedIndex = $i; break }
        }
        if ($ccy.SelectedIndex -lt 0) { $ccy.SelectedIndex = 0 }

        Set-NextHandler {
            $name = $el.FindName('NameBox').Text.Trim()
            $em   = $el.FindName('EmailBox').Text.Trim().ToLowerInvariant()
            $pw   = $el.FindName('PwdBox').Password
            $cf   = $el.FindName('ConfirmBox').Password
            $tn   = $el.FindName('TenantBox').Text.Trim()
            $cc   = $el.FindName('CcyBox').SelectedItem.Content
            if (-not $name) { [System.Windows.MessageBox]::Show($script:Window, 'Full name is required.', 'Validation', 'OK', 'Warning') | Out-Null; return }
            if (-not ($em -match '^[^@\s]+@[^@\s]+\.[^@\s]+$')) { [System.Windows.MessageBox]::Show($script:Window, 'Enter a valid email address.', 'Validation', 'OK', 'Warning') | Out-Null; return }
            if ($pw.Length -lt 8) { [System.Windows.MessageBox]::Show($script:Window, 'Password must be at least 8 characters.', 'Validation', 'OK', 'Warning') | Out-Null; return }
            if ($pw -ne $cf) { [System.Windows.MessageBox]::Show($script:Window, 'Passwords do not match.', 'Validation', 'OK', 'Warning') | Out-Null; return }
            if (-not $tn) { [System.Windows.MessageBox]::Show($script:Window, 'Jamaat name is required.', 'Validation', 'OK', 'Warning') | Out-Null; return }
            $script:State.AdminFullName = $name
            $script:State.AdminEmail    = $em
            $script:State.AdminPassword = $pw
            $script:State.AdminConfirm  = $cf
            $script:State.TenantName    = $tn
            $script:State.BaseCurrency  = $cc
            Show-Page ($script:CurIndex + 1)
        }
    }
}

# ---------------------------------------------------------------------------
# Page 6: Review
# ---------------------------------------------------------------------------
$script:Pages += @{
    Subtitle  = 'Review'
    NextLabel = 'Install'
    Build     = {
        $cs = (Get-ConnectionString)
        if ($cs.Length -gt 90) { $cs = $cs.Substring(0, 90) + '...' }
        $cors = if ($script:State.CorsOrigins) { $script:State.CorsOrigins.Replace("`r`n", '; ') } else { '(none)' }
        $xaml = @"
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Margin="8">
  <TextBlock Text="Ready to install" FontSize="18" FontWeight="SemiBold" Foreground="#0F172A" Margin="0,0,0,4" />
  <TextBlock Text="Click Install to apply these settings. Use Back to change anything." Foreground="#64748B" Margin="0,0,0,16" />
  <Border BorderBrush="#E5E9EF" BorderThickness="1" CornerRadius="6" Padding="16" Background="White">
    <StackPanel>
      <TextBlock Text="Database" FontWeight="SemiBold" Foreground="#0B6E63" Margin="0,0,0,4" />
      <TextBlock TextWrapping="Wrap" FontSize="12" Foreground="#475569"><Run>$($script:State.DbServer)</Run> / <Run>$($script:State.DbName)</Run> · <Run>$($script:State.DbAuth) auth</Run></TextBlock>

      <TextBlock Text="Install location" FontWeight="SemiBold" Foreground="#0B6E63" Margin="0,12,0,4" />
      <TextBlock TextWrapping="Wrap" FontSize="12" Foreground="#475569"><Run>$($script:State.InstallRoot)</Run></TextBlock>

      <TextBlock Text="URL" FontWeight="SemiBold" Foreground="#0B6E63" Margin="0,12,0,4" />
      <TextBlock TextWrapping="Wrap" FontSize="12" Foreground="#475569"><Run>http://$($script:State.PublicHost):$($script:State.ApiPort)/</Run></TextBlock>

      <TextBlock Text="Extra CORS origins" FontWeight="SemiBold" Foreground="#0B6E63" Margin="0,12,0,4" />
      <TextBlock TextWrapping="Wrap" FontSize="12" Foreground="#475569"><Run>$cors</Run></TextBlock>

      <TextBlock Text="Administrator" FontWeight="SemiBold" Foreground="#0B6E63" Margin="0,12,0,4" />
      <TextBlock TextWrapping="Wrap" FontSize="12" Foreground="#475569"><Run>$($script:State.AdminFullName)</Run> · <Run>$($script:State.AdminEmail)</Run></TextBlock>

      <TextBlock Text="Jamaat" FontWeight="SemiBold" Foreground="#0B6E63" Margin="0,12,0,4" />
      <TextBlock TextWrapping="Wrap" FontSize="12" Foreground="#475569"><Run>$($script:State.TenantName)</Run> · <Run>$($script:State.BaseCurrency)</Run></TextBlock>
    </StackPanel>
  </Border>
</StackPanel>
"@
        return Parse-Xaml $xaml
    }
    OnEnter   = {
        Set-NextHandler { Show-Page ($script:CurIndex + 1) }
    }
}

# ---------------------------------------------------------------------------
# Page 7: Install (progress + log)
# ---------------------------------------------------------------------------
$script:Pages += @{
    Subtitle  = 'Installing'
    NextLabel = 'Open in browser'
    Build     = {
        $xaml = @"
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Margin="8">
  <TextBlock Text="Installing Jamaat" FontSize="18" FontWeight="SemiBold" Foreground="#0F172A" Margin="0,0,0,12" />
  <ProgressBar x:Name="Progress" Height="6" Minimum="0" Maximum="100" Foreground="#0B6E63" Background="#E5E9EF" />
  <TextBlock x:Name="StatusLabel" Margin="0,8,0,0" Foreground="#475569" Text="Preparing..." />
  <Border BorderBrush="#E5E9EF" BorderThickness="1" CornerRadius="4" Margin="0,12,0,0" Background="#0F172A" Height="220">
    <ScrollViewer x:Name="LogScroll" VerticalScrollBarVisibility="Auto">
      <TextBlock x:Name="LogText" FontFamily="Consolas" FontSize="11" Foreground="#9FCDBF" Padding="10" TextWrapping="Wrap" />
    </ScrollViewer>
  </Border>
</StackPanel>
"@
        return Parse-Xaml $xaml
    }
    OnEnter   = {
        param($el)
        $script:NextBtn.IsEnabled  = $false
        $script:BackBtn.IsEnabled  = $false
        $progress = $el.FindName('Progress')
        $status   = $el.FindName('StatusLabel')
        $logText  = $el.FindName('LogText')
        $logScroll = $el.FindName('LogScroll')

        $log = {
            param($line, $color = '#9FCDBF')
            $logText.Text = $logText.Text + $line + "`n"
            $logScroll.ScrollToEnd()
            [System.Windows.Forms.Application]::DoEvents()
        }

        $setStep = {
            param($pct, $msg)
            $progress.Value = $pct
            $status.Text = $msg
            & $log "[$pct%] $msg"
        }

        # ---- begin install steps -----------------------------------------
        try {
            & $setStep 5 "Creating install directory..."
            $apiPath = Join-Path $script:State.InstallRoot 'Api'
            $logsPath = Join-Path $script:State.InstallRoot 'Logs'
            New-Item -Path $apiPath -ItemType Directory -Force | Out-Null
            New-Item -Path $logsPath -ItemType Directory -Force | Out-Null
            & $log "  -> $apiPath"

            & $setStep 15 "Publishing API (dotnet publish)..."
            $publishLog = & dotnet publish $ApiCsproj -c Release -o $apiPath --nologo 2>&1
            if ($LASTEXITCODE -ne 0) {
                $publishLog | ForEach-Object { & $log "  $_" }
                throw "dotnet publish failed (exit $LASTEXITCODE)"
            }
            & $log "  -> Published"

            & $setStep 40 "Building web bundle (npm install + build)..."
            Push-Location $WebRoot
            try {
                if (-not (Test-Path (Join-Path $WebRoot 'node_modules'))) {
                    & $log "  npm install..."
                    & npm install --no-audit --no-fund 2>&1 | ForEach-Object { & $log "  $_" }
                    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
                }
                & $log "  npm run build..."
                & npm run build 2>&1 | ForEach-Object { & $log "  $_" }
                if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
            } finally { Pop-Location }

            & $setStep 65 "Copying web bundle into API wwwroot..."
            $wwwroot = Join-Path $apiPath 'wwwroot'
            if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }
            New-Item $wwwroot -ItemType Directory -Force | Out-Null
            Copy-Item -Path (Join-Path $WebDist '*') -Destination $wwwroot -Recurse -Force
            & $log "  -> wwwroot populated"

            & $setStep 75 "Patching appsettings.json..."
            $settingsPath = Join-Path $apiPath 'appsettings.json'
            $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
            if (-not $settings.ConnectionStrings) { $settings | Add-Member -NotePropertyName 'ConnectionStrings' -NotePropertyValue ([PSCustomObject]@{}) }
            $cs = Get-ConnectionString
            if ($settings.ConnectionStrings.PSObject.Properties.Name -contains 'Default') {
                $settings.ConnectionStrings.Default = $cs
            } else { $settings.ConnectionStrings | Add-Member -NotePropertyName 'Default' -NotePropertyValue $cs }
            # Setup:UseWizard=false because we already have admin creds — let DatabaseSeeder create the admin.
            if (-not $settings.Setup) { $settings | Add-Member -NotePropertyName 'Setup' -NotePropertyValue ([PSCustomObject]@{}) }
            if ($settings.Setup.PSObject.Properties.Name -contains 'UseWizard') { $settings.Setup.UseWizard = $false } else { $settings.Setup | Add-Member -NotePropertyName 'UseWizard' -NotePropertyValue $false }
            # Seed:* — DatabaseSeeder reads these as overrides. We ALSO set Seed:AdminTenantName so the seeded tenant is renamed on first run.
            if (-not $settings.Seed) { $settings | Add-Member -NotePropertyName 'Seed' -NotePropertyValue ([PSCustomObject]@{}) }
            $seedFields = @{ AdminEmail = $script:State.AdminEmail; AdminPassword = $script:State.AdminPassword; AdminFullName = $script:State.AdminFullName }
            foreach ($k in $seedFields.Keys) {
                if ($settings.Seed.PSObject.Properties.Name -contains $k) { $settings.Seed.$k = $seedFields[$k] } else { $settings.Seed | Add-Member -NotePropertyName $k -NotePropertyValue $seedFields[$k] }
            }
            # CORS origins (extra). Comma-joined.
            $extraCors = ($script:State.CorsOrigins -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join ','
            if ($extraCors) {
                if (-not $settings.Cors) { $settings | Add-Member -NotePropertyName 'Cors' -NotePropertyValue ([PSCustomObject]@{ Origins = $extraCors }) }
                else { if ($settings.Cors.PSObject.Properties.Name -contains 'Origins') { $settings.Cors.Origins = $extraCors } else { $settings.Cors | Add-Member -NotePropertyName 'Origins' -NotePropertyValue $extraCors } }
            }
            $settings | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8
            & $log "  -> appsettings.json updated"

            & $setStep 85 "Launching API on http://localhost:$($script:State.ApiPort)/ ..."
            $apiDll = Join-Path $apiPath 'Jamaat.Api.dll'
            $launchUrl = "http://*:$($script:State.ApiPort)"
            Start-Process -FilePath 'dotnet' -ArgumentList @($apiDll, '--urls', $launchUrl) -WorkingDirectory $apiPath | Out-Null
            & $log "  -> dotnet $apiDll --urls $launchUrl"

            & $setStep 95 "Waiting for API to come up..."
            $deadline = (Get-Date).AddSeconds(120)
            $up = $false
            $probe = "http://localhost:$($script:State.ApiPort)/api/v1/setup/status"
            while ((Get-Date) -lt $deadline) {
                try {
                    $r = Invoke-WebRequest -Uri $probe -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                    if ($r.StatusCode -eq 200) { $up = $true; break }
                } catch { Start-Sleep -Milliseconds 800 }
            }
            if (-not $up) { throw 'API did not respond within 120 seconds. Check the API logs in the install folder.' }

            & $setStep 100 "Done."
            & $log "Install complete. The app is running at http://localhost:$($script:State.ApiPort)/"
            $script:NextBtn.IsEnabled = $true
            $script:NextBtn.Content   = 'Open in browser'
            Set-NextHandler {
                Start-Process "http://localhost:$($script:State.ApiPort)/login"
                $script:Window.Close()
            }
        } catch {
            $status.Foreground = '#DC2626'
            $status.Text = "Install failed: $($_.Exception.Message)"
            & $log "[ERROR] $($_.Exception.Message)"
            $script:BackBtn.IsEnabled = $true
            $script:NextBtn.Content   = 'Close'
            $script:NextBtn.IsEnabled = $true
            Set-NextHandler { $script:Window.Close() }
        }
    }
}

# ---------------------------------------------------------------------------
# Show the wizard.
# ---------------------------------------------------------------------------
Show-Page 0
$script:Window.ShowDialog() | Out-Null
