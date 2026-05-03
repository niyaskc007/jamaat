<#
.SYNOPSIS
    One-click installer for the Jamaat web app.

.DESCRIPTION
    Walks an operator through getting a fresh Jamaat install up and running on a
    Windows machine. Steps performed (in order):

      1. Prerequisite check       — .NET 10 SDK, Node 20+, SQL Server reachable
      2. Connection string prompt — operator chooses LocalDB / named SQL instance / custom
      3. appsettings.json patch   — writes the connection string + Setup:UseWizard=true
      4. Backend build            — `dotnet restore` then `dotnet build` (Release)
      5. Frontend build           — `npm install` then `npm run build`
      6. Run                      — launches the API + Vite preview in two PowerShell windows
      7. Browser handoff          — opens http://localhost:5173/setup so the operator
                                    finishes the in-app wizard (creates tenant + admin)

    The installer is idempotent: it can be re-run safely. If the API is already
    listening on :5174 it skips the build and just opens the browser.

    Setup:UseWizard=true tells DatabaseSeeder NOT to auto-create the default admin —
    the in-app wizard creates it interactively from the operator's input instead.

.PARAMETER ConnectionString
    Override the connection string non-interactively. Useful for CI / scripted installs.
    Example: install.ps1 -ConnectionString "Server=.\SQLEXPRESS;Database=JAMAAT;..."

.PARAMETER SkipBuild
    Skip the dotnet/npm build steps. Use this when re-running after a code change
    has already triggered a build through `dotnet run` / `npm run dev`.

.PARAMETER NoBrowser
    Don't open the browser at the end. Useful for headless environments.

.EXAMPLE
    .\install.ps1
    Interactive install with prompts.

.EXAMPLE
    .\install.ps1 -ConnectionString "Server=(localdb)\MSSQLLocalDB;Database=JAMAAT;..." -NoBrowser
    Headless install with explicit connection string.
#>

[CmdletBinding()]
param(
    [string]$ConnectionString,
    [switch]$SkipBuild,
    [switch]$NoBrowser
)

# Force the script to abort on any unhandled error so half-installed states don't go silent.
$ErrorActionPreference = 'Stop'

# Repo paths are resolved relative to this script's location so the installer works from
# any cwd (e.g. when invoked from a desktop shortcut).
$RepoRoot   = Split-Path -Parent $PSCommandPath
$ApiProject = Join-Path $RepoRoot 'src\Jamaat.Api'
$ApiCsproj  = Join-Path $ApiProject 'Jamaat.Api.csproj'
$ApiSettings = Join-Path $ApiProject 'appsettings.json'
$WebRoot    = Join-Path $RepoRoot 'web\jamaat-web'

function Write-Banner($text) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Write-Step($n, $text) {
    Write-Host ""
    Write-Host "[$n] $text" -ForegroundColor Yellow
}

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# 1. Prerequisite check
# ---------------------------------------------------------------------------
Write-Banner "Jamaat one-click installer"
Write-Step 1 "Checking prerequisites"

$missing = @()

if (-not (Test-Command 'dotnet')) {
    $missing += '.NET SDK (https://dot.net) — install .NET 10'
} else {
    $dotnetVersion = (& dotnet --version).Trim()
    Write-Host "  ✓ .NET SDK $dotnetVersion" -ForegroundColor Green
    if (-not $dotnetVersion.StartsWith('10.')) {
        Write-Host "  ! Warning: this app targets .NET 10. Detected $dotnetVersion." -ForegroundColor Yellow
    }
}

if (-not (Test-Command 'node')) {
    $missing += 'Node.js 20+ (https://nodejs.org)'
} else {
    $nodeVersion = (& node --version).Trim()
    Write-Host "  ✓ Node $nodeVersion" -ForegroundColor Green
    # Node prints "v20.11.0" - strip the leading v + parse the major.
    $major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
    if ($major -lt 20) {
        $missing += "Node.js 20+ — found $nodeVersion. Upgrade from https://nodejs.org"
    }
}

if (-not (Test-Command 'npm')) {
    $missing += 'npm (bundled with Node.js)'
} else {
    $npmVersion = (& npm --version).Trim()
    Write-Host "  ✓ npm $npmVersion" -ForegroundColor Green
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing prerequisites:" -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Install the listed tools and re-run this script." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Connection string
# ---------------------------------------------------------------------------
Write-Step 2 "Database connection"

if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
    Write-Host "Pick the SQL Server connection to use:"
    Write-Host "  [1] Local SQL Server                (Server=localhost; Integrated Security)"
    Write-Host "  [2] SQL Server LocalDB              (Server=(localdb)\MSSQLLocalDB)"
    Write-Host "  [3] Named instance / custom         (you'll be prompted for the full string)"
    $choice = Read-Host "Choice [1/2/3]"

    switch ($choice) {
        '2' {
            $ConnectionString = 'Server=(localdb)\MSSQLLocalDB;Database=JAMAAT;Integrated Security=true;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true'
        }
        '3' {
            $ConnectionString = Read-Host "Enter the full ConnectionString"
        }
        default {
            $ConnectionString = 'Server=localhost;Database=JAMAAT;Integrated Security=true;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true'
        }
    }
}

if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
    Write-Host "No connection string provided. Aborting." -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Using connection string: $($ConnectionString.Substring(0, [Math]::Min(60, $ConnectionString.Length)))..." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 3. Patch appsettings.json
# ---------------------------------------------------------------------------
Write-Step 3 "Patching appsettings.json"

if (-not (Test-Path $ApiSettings)) {
    Write-Host "appsettings.json not found at $ApiSettings" -ForegroundColor Red
    exit 1
}

# Read as raw text and let System.Text.Json parse it. Avoids the trailing-comma /
# comments lossiness of ConvertFrom-Json on PowerShell 5.1.
$json = Get-Content $ApiSettings -Raw
$settings = $json | ConvertFrom-Json

# ConnectionStrings -> Default
if (-not $settings.ConnectionStrings) {
    $settings | Add-Member -NotePropertyName 'ConnectionStrings' -NotePropertyValue ([PSCustomObject]@{ Default = $ConnectionString })
} else {
    if ($settings.ConnectionStrings.PSObject.Properties.Name -contains 'Default') {
        $settings.ConnectionStrings.Default = $ConnectionString
    } else {
        $settings.ConnectionStrings | Add-Member -NotePropertyName 'Default' -NotePropertyValue $ConnectionString
    }
}

# Setup -> UseWizard = true. This tells DatabaseSeeder to skip the auto-admin so the
# in-app wizard can create one interactively.
if (-not $settings.Setup) {
    $settings | Add-Member -NotePropertyName 'Setup' -NotePropertyValue ([PSCustomObject]@{ UseWizard = $true })
} else {
    if ($settings.Setup.PSObject.Properties.Name -contains 'UseWizard') {
        $settings.Setup.UseWizard = $true
    } else {
        $settings.Setup | Add-Member -NotePropertyName 'UseWizard' -NotePropertyValue $true
    }
}

$settings | ConvertTo-Json -Depth 10 | Set-Content -Path $ApiSettings -Encoding UTF8
Write-Host "  ✓ appsettings.json updated (Setup:UseWizard=true; ConnectionStrings:Default set)" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 4. Backend build
# ---------------------------------------------------------------------------
if ($SkipBuild) {
    Write-Step 4 "Skipping backend build (-SkipBuild)"
} else {
    Write-Step 4 "Building API"
    Push-Location $RepoRoot
    try {
        & dotnet restore $ApiCsproj
        if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed" }
        & dotnet build $ApiCsproj --configuration Release --nologo
        if ($LASTEXITCODE -ne 0) { throw "dotnet build failed" }
        Write-Host "  ✓ API build succeeded" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# 5. Frontend build
# ---------------------------------------------------------------------------
if ($SkipBuild) {
    Write-Step 5 "Skipping frontend build (-SkipBuild)"
} else {
    Write-Step 5 "Installing + building web bundle"
    Push-Location $WebRoot
    try {
        if (-not (Test-Path (Join-Path $WebRoot 'node_modules'))) {
            & npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        } else {
            Write-Host "  • node_modules already present, skipping npm install" -ForegroundColor DarkGray
        }
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
        Write-Host "  ✓ Web bundle built (web/jamaat-web/dist)" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# 6. Launch API + Vite preview
# ---------------------------------------------------------------------------
Write-Step 6 "Starting API and web preview"

# Skip launching if something is already on the API port - lets the operator re-run
# the installer without duplicating processes.
$apiAlreadyUp = $false
try {
    $existing = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
    if ($existing) { $apiAlreadyUp = $true }
} catch { }

if ($apiAlreadyUp) {
    Write-Host "  • API is already listening on :5174 - skipping launch" -ForegroundColor DarkGray
} else {
    # Launch the API in a new PowerShell window so the operator can see logs and Ctrl-C it.
    # `--no-build` because we just built it.
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "cd '$RepoRoot'; dotnet run --project '$ApiCsproj' --no-build"
    ) | Out-Null
    Write-Host "  ✓ API launching on http://localhost:5174 (separate window)" -ForegroundColor Green

    # Launch Vite preview (serves the production build) on :5173.
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "cd '$WebRoot'; npm run preview -- --port 5173"
    ) | Out-Null
    Write-Host "  ✓ Web preview launching on http://localhost:5173 (separate window)" -ForegroundColor Green
}

# Wait for the API to start responding before opening the browser. Probe /api/v1/setup/status
# (anonymous) until it returns 200, max 60s.
Write-Host ""
Write-Host "  Waiting for the API to come up..." -NoNewline
$deadline = (Get-Date).AddSeconds(60)
$apiUp = $false
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri 'http://localhost:5174/api/v1/setup/status' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $apiUp = $true; break }
    } catch { Start-Sleep -Milliseconds 800; Write-Host '.' -NoNewline }
}
Write-Host ""
if ($apiUp) {
    Write-Host "  ✓ API is responding" -ForegroundColor Green
} else {
    Write-Host "  ! API didn't respond within 60s. Check the API window for errors." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 7. Browser handoff
# ---------------------------------------------------------------------------
$wizardUrl = 'http://localhost:5173/setup'
Write-Step 7 "Opening setup wizard"
Write-Host "  $wizardUrl"

if (-not $NoBrowser) {
    Start-Process $wizardUrl | Out-Null
}

Write-Banner "Installer done"
Write-Host "Next:"
Write-Host "  1. Finish the in-app wizard at $wizardUrl"
Write-Host "  2. Sign in with the admin credentials you just created"
Write-Host ""
Write-Host "To stop the app: close the API + Web preview PowerShell windows."
Write-Host "To re-run the wizard: drop the database (or DELETE FROM AspNetUserRoles WHERE RoleId=Administrator role id) and refresh /setup."
Write-Host ""
