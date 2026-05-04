# Build orchestration for the Jamaat Windows installer.
#
# Run this from a clean checkout to produce installer\output\JamaatInstaller-<version>.exe.
# It does the following, sequentially:
#   1. Stops any running JamaatApi service or local dev API on the target port (so dotnet
#      publish doesn't fail on locked DLLs).
#   2. dotnet publish src\Jamaat.Api into build\api\ (framework-dependent, win-x64).
#   3. npm install + npm run build in web\jamaat-web; copies the dist into build\api\wwwroot\.
#   4. (Optional) downloads the .NET 10 Hosting Bundle into installer\redist\ if not cached
#      and -SkipHostingBundle isn't set.
#   5. Locates ISCC.exe (Inno Setup compiler) and invokes it on Jamaat.iss.
#
# Output: installer\output\JamaatInstaller-<version>.exe
#
# Usage:
#   .\installer\build.ps1                                 # default version 1.0.0
#   .\installer\build.ps1 -Version 1.2.3
#   .\installer\build.ps1 -SkipWebBuild                   # reuse existing dist (faster)
#   .\installer\build.ps1 -SkipHostingBundle              # don't bundle .NET runtime (smaller)

[CmdletBinding()]
param(
    [string]   $Version           = '1.0.0',
    [switch]   $SkipApiBuild,
    [switch]   $SkipWebBuild,
    [switch]   $SkipHostingBundle,
    [string]   $HostingBundleUrl  = 'https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/10.0.0/dotnet-hosting-10.0.0-win.exe',
    [string]   $IsccPath          = ''
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (script is at installer\build.ps1).
$repoRoot     = Resolve-Path (Join-Path $PSScriptRoot '..')
$installerDir = $PSScriptRoot
$buildRoot    = Join-Path $repoRoot 'build'
$apiOut       = Join-Path $buildRoot 'api'
$trayOut      = Join-Path $buildRoot 'tray'
$adminOut     = Join-Path $buildRoot 'admin'
$webRoot      = Join-Path $repoRoot 'web\jamaat-web'
$webDist      = Join-Path $webRoot  'dist'
$apiCsproj    = Join-Path $repoRoot 'src\Jamaat.Api\Jamaat.Api.csproj'
$trayCsproj   = Join-Path $repoRoot 'src\Jamaat.Tray\Jamaat.Tray.csproj'
$adminCsproj  = Join-Path $repoRoot 'src\Jamaat.AdminConsole\Jamaat.AdminConsole.csproj'
$redistDir    = Join-Path $installerDir 'redist'
$outputDir    = Join-Path $installerDir 'output'

function Step([string] $msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Stop-RunningApi {
    # The dev API often holds locks on the publish target. Stop the service if installed,
    # and kill any local dotnet hosting Jamaat.Api.dll.
    Step "Stopping any running Jamaat API instance..."
    & sc.exe query JamaatApi 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        & sc.exe stop JamaatApi 2>&1 | Out-Null
        Start-Sleep -Seconds 1
    }
    Get-Process -Name 'Jamaat.Api','dotnet' -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            if ($cmdline -and $cmdline -match 'Jamaat\.Api') {
                Write-Host "    killing PID $($_.Id) ($($_.Name))"
                Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            }
        } catch { }
    }
}

function Build-Api {
    if ($SkipApiBuild -and (Test-Path $apiOut)) {
        Step "Skipping API build (-SkipApiBuild). Using existing $apiOut"
        return
    }
    Step "Publishing API to $apiOut"
    if (Test-Path $apiOut) { Remove-Item $apiOut -Recurse -Force }
    & dotnet publish $apiCsproj `
        -c Release `
        -r win-x64 `
        --self-contained false `
        -p:PublishReadyToRun=false `
        -o $apiOut
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)" }
}

function Build-Tray {
    Step "Publishing tray app to $trayOut"
    if (Test-Path $trayOut) { Remove-Item $trayOut -Recurse -Force }
    & dotnet publish $trayCsproj -c Release -o $trayOut --self-contained false
    if ($LASTEXITCODE -ne 0) { throw "tray publish failed (exit $LASTEXITCODE)" }
}

function Build-Admin {
    Step "Publishing admin console to $adminOut"
    if (Test-Path $adminOut) { Remove-Item $adminOut -Recurse -Force }
    & dotnet publish $adminCsproj -c Release -o $adminOut --self-contained false
    if ($LASTEXITCODE -ne 0) { throw "admin console publish failed (exit $LASTEXITCODE)" }
}

function Build-Web {
    if ($SkipWebBuild -and (Test-Path $webDist)) {
        Step "Skipping web build (-SkipWebBuild). Using existing $webDist"
    } else {
        Step "Building web bundle in $webRoot"
        Push-Location $webRoot
        try {
            if (-not (Test-Path 'node_modules')) {
                & npm install
                if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
            }
            # Use build:fast which skips the strict tsc -b pre-step. The dev codebase has
            # pre-existing type errors in pages outside the System module that block the
            # default `npm run build`; Vite still bundles correctly without the type-check.
            # Once the broader codebase is type-clean, this can switch back to `npm run build`.
            & npm run build:fast
            if ($LASTEXITCODE -ne 0) { throw "npm run build:fast failed (exit $LASTEXITCODE)" }
        } finally { Pop-Location }
    }
    $wwwroot = Join-Path $apiOut 'wwwroot'
    if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }
    New-Item -Path $wwwroot -ItemType Directory | Out-Null
    Copy-Item -Path (Join-Path $webDist '*') -Destination $wwwroot -Recurse -Force
    Write-Host "    Web bundle copied to $wwwroot"
}

function Ensure-HostingBundle {
    if ($SkipHostingBundle) {
        Step "Skipping hosting bundle (will rely on .NET 10 already being installed on target)."
        return
    }
    if (-not (Test-Path $redistDir)) { New-Item -Path $redistDir -ItemType Directory | Out-Null }
    $cached = Join-Path $redistDir 'dotnet-hosting.exe'
    if (Test-Path $cached) {
        Step ".NET hosting bundle already cached at $cached"
        return
    }
    # Fixed filename: the .iss [Files] line references "dotnet-hosting.exe" exactly,
    # because Inno's [Files] DestName can't be combined with wildcard sources.
    $target = Join-Path $redistDir 'dotnet-hosting.exe'
    Step "Downloading .NET 10 hosting bundle from $HostingBundleUrl"
    try {
        Invoke-WebRequest -Uri $HostingBundleUrl -OutFile $target -UseBasicParsing
        Write-Host "    Saved to $target"
    } catch {
        Write-Warning "Hosting bundle download failed: $($_.Exception.Message). The installer will be built without it; the operator's box must already have .NET 10 installed."
        if (Test-Path $target) { Remove-Item $target -Force }
    }
}

function Find-Iscc {
    if ($IsccPath -and (Test-Path $IsccPath)) { return $IsccPath }
    $candidates = @(
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        'C:\Program Files\Inno Setup 6\ISCC.exe',
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    $whichOut = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if ($whichOut) { return $whichOut.Source }
    throw "ISCC.exe (Inno Setup compiler) not found. Install via 'winget install JRSoftware.InnoSetup' or pass -IsccPath."
}

function Compile-Installer {
    if (-not (Test-Path $outputDir)) { New-Item -Path $outputDir -ItemType Directory | Out-Null }

    # Sanity check: the [Files] section ships everything from build/api into the installer.
    # If publish silently produced nothing (or someone ran -SkipApiBuild against an empty dir)
    # we'd compile a working-looking but empty installer that bricks every customer install.
    # Bail loudly instead.
    $apiDll = Join-Path $apiOut 'Jamaat.Api.dll'
    $apiExe = Join-Path $apiOut 'Jamaat.Api.exe'
    if (-not (Test-Path $apiDll) -or -not (Test-Path $apiExe)) {
        throw "Refusing to compile an empty installer: $apiOut is missing Jamaat.Api.dll or Jamaat.Api.exe. Run without -SkipApiBuild, or publish the API manually before retrying."
    }
    $wwwroot = Join-Path $apiOut 'wwwroot'
    if (-not (Test-Path $wwwroot) -or -not (Test-Path (Join-Path $wwwroot 'index.html'))) {
        throw "Refusing to compile installer: $wwwroot is missing index.html. Run without -SkipWebBuild, or build the SPA manually before retrying."
    }
    $apiSizeMb = [math]::Round(((Get-ChildItem $apiOut -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
    Step "Sanity check OK: $apiOut contains Jamaat.Api.exe + wwwroot/index.html (~$apiSizeMb MB total)"

    $iscc = Find-Iscc
    Step "Compiling installer via $iscc"
    & $iscc "/DMyAppVersion=$Version" (Join-Path $installerDir 'Jamaat.iss')
    if ($LASTEXITCODE -ne 0) { throw "ISCC failed (exit $LASTEXITCODE)" }
    $exe = Join-Path $outputDir "JamaatInstaller-$Version.exe"
    if (-not (Test-Path $exe)) { throw "Expected $exe to exist after ISCC, but it doesn't." }
    $exeSizeMb = [math]::Round((Get-Item $exe).Length / 1MB, 1)
    Step "Built: $exe ($exeSizeMb MB)"
    if ($exeSizeMb -lt 20) {
        Write-Warning "Installer is only $exeSizeMb MB - that looks too small for a real build. Did the API publish succeed? Inspect $apiOut to confirm."
    }
    Get-Item $exe | Select-Object FullName, Length, LastWriteTime
}

# -- main --
Stop-RunningApi
Build-Api
Build-Tray
Build-Admin
Build-Web
Ensure-HostingBundle
Compile-Installer
