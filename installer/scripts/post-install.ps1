# Runs at the end of installation. Inno Setup [Run] section invokes this with the
# values the operator chose in the custom wizard pages (passed as args). It:
#   1. Patches {AppDir}\Api\appsettings.json with the operator's connection string,
#      port, hostname, CORS origins, and admin seed values.
#   2. Registers and starts the JamaatApi Windows Service via sc.exe.
#   3. Polls http://localhost:<Port>/api/v1/setup/status until the API is up.
#   4. POSTs to /api/v1/setup/initialize to create the first admin + name the tenant.
#   5. Writes a small open-browser.cmd shortcut.
#
# Returns non-zero on hard failure so the Inno Setup [Run] entry shows an error to
# the operator. Soft failures (e.g. browser open) just log to a transcript and exit 0.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $AppDir,
    [Parameter(Mandatory = $true)] [string] $DbServer,
    [Parameter(Mandatory = $true)] [string] $DbDatabase,
    [Parameter(Mandatory = $true)] [ValidateSet('Windows','Sql')] [string] $DbAuthMode,
    [string] $DbUser = '',
    [string] $DbPassword = '',
    [Parameter(Mandatory = $true)] [int] $Port,
    [Parameter(Mandatory = $true)] [string] $PublicHost,
    [string] $CorsOrigins = '',
    [Parameter(Mandatory = $true)] [string] $AdminFullName,
    [Parameter(Mandatory = $true)] [string] $AdminEmail,
    [Parameter(Mandatory = $true)] [string] $AdminPassword,
    [Parameter(Mandatory = $true)] [string] $TenantName,
    [Parameter(Mandatory = $true)] [string] $BaseCurrency
)

$ErrorActionPreference = 'Stop'
$apiDir   = Join-Path $AppDir 'Api'
$logsDir  = Join-Path $AppDir 'Logs'
$logFile  = Join-Path $logsDir ("post-install-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
$null = New-Item -Path $logsDir -ItemType Directory -Force

Start-Transcript -Path $logFile -Append | Out-Null

function Write-Step([string] $msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Write-Output $line
}

try {
    # ---- Patch appsettings.json ------------------------------------------
    Write-Step "Patching appsettings.json"
    $cfgPath = Join-Path $apiDir 'appsettings.json'
    if (-not (Test-Path $cfgPath)) { throw "appsettings.json not found at $cfgPath" }
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json

    if ($DbAuthMode -eq 'Windows') {
        $cs = "Server=$DbServer;Database=$DbDatabase;Integrated Security=true;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true"
    } else {
        $cs = "Server=$DbServer;Database=$DbDatabase;User Id=$DbUser;Password=$DbPassword;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true"
    }
    if (-not $cfg.ConnectionStrings) { $cfg | Add-Member -NotePropertyName ConnectionStrings -NotePropertyValue ([pscustomobject]@{}) -Force }
    $cfg.ConnectionStrings.Default = $cs

    # CORS: always include the public hostname; append any extras.
    $origins = @("http://${PublicHost}:$Port", "https://${PublicHost}:$Port")
    if ($CorsOrigins) {
        $extra = $CorsOrigins -split "[\r\n,]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $origins += $extra
    }
    if (-not $cfg.Cors) { $cfg | Add-Member -NotePropertyName Cors -NotePropertyValue ([pscustomobject]@{}) -Force }
    $cfg.Cors.Origins = @($origins | Select-Object -Unique)

    # Bake the seed admin so DatabaseSeeder hooks pick it up if Setup:UseWizard is false.
    # We default to UseWizard=false for installer-driven installs (admin already chosen here).
    if (-not $cfg.Setup) { $cfg | Add-Member -NotePropertyName Setup -NotePropertyValue ([pscustomobject]@{}) -Force }
    $cfg.Setup.UseWizard = $false
    if (-not $cfg.Seed) { $cfg | Add-Member -NotePropertyName Seed -NotePropertyValue ([pscustomobject]@{}) -Force }
    $cfg.Seed.AdminEmail = $AdminEmail
    $cfg.Seed.AdminPassword = $AdminPassword
    $cfg.Seed.AdminFullName = $AdminFullName
    $cfg.Seed.TenantName = $TenantName
    $cfg.Seed.BaseCurrency = $BaseCurrency

    # Rotate the JWT signing key. The shipped value is a placeholder; on a fresh install
    # we generate a 64-byte random secret so two installs of the same MSI don't share a key.
    $bytes = New-Object byte[] 64
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    if (-not $cfg.Jwt) { $cfg | Add-Member -NotePropertyName Jwt -NotePropertyValue ([pscustomobject]@{}) -Force }
    $cfg.Jwt.Key = [Convert]::ToBase64String($bytes)

    $cfg | ConvertTo-Json -Depth 16 | Set-Content -Path $cfgPath -Encoding UTF8

    # ---- Register Windows Service ----------------------------------------
    Write-Step "Registering JamaatApi Windows Service"
    $apiExe = Join-Path $apiDir 'Jamaat.Api.exe'
    if (-not (Test-Path $apiExe)) { throw "Jamaat.Api.exe not found at $apiExe" }

    # If the service exists from a prior install, stop and delete first so binPath updates.
    & sc.exe query JamaatApi 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        & sc.exe stop JamaatApi 2>&1 | Out-Null
        Start-Sleep -Seconds 1
        & sc.exe delete JamaatApi 2>&1 | Out-Null
        Start-Sleep -Seconds 1
    }

    # binPath syntax: each space-separated piece is a token. We need quotes around the exe
    # because of the program-files path with spaces, and we wrap the whole binPath value in
    # quotes (with embedded escaped double-quotes around the exe). sc.exe is fussy about the
    # space after each `=`.
    $binPath = "`"$apiExe`" --urls http://*:$Port"
    & sc.exe create JamaatApi binPath= $binPath start= auto DisplayName= "Jamaat API" 2>&1 | Out-String | Write-Output
    if ($LASTEXITCODE -ne 0) { throw "sc.exe create failed (exit $LASTEXITCODE)" }
    & sc.exe description JamaatApi "Jamaat community management web API." 2>&1 | Out-Null
    # Restart on crash: 60s delay, max 3 retries inside 24h.
    & sc.exe failure JamaatApi reset= 86400 actions= restart/60000/restart/60000/restart/60000 2>&1 | Out-Null

    Write-Step "Starting JamaatApi service"
    & sc.exe start JamaatApi 2>&1 | Out-String | Write-Output
    if ($LASTEXITCODE -ne 0) { throw "sc.exe start failed (exit $LASTEXITCODE) - check $logsDir for stderr" }

    # ---- Wait for health -------------------------------------------------
    Write-Step "Waiting for API to respond on http://localhost:$Port"
    $deadline = (Get-Date).AddSeconds(120)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/v1/setup/status" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw "API did not respond within 120s. Check $logsDir and the JamaatApi service status." }
    Write-Step "API is up."

    # ---- Initialize first admin via /setup/initialize --------------------
    Write-Step "Creating first admin via /api/v1/setup/initialize"
    $initBody = @{
        TenantName    = $TenantName
        TenantCode    = ($TenantName -replace '\s+','').ToUpperInvariant()
        AdminFullName = $AdminFullName
        AdminEmail    = $AdminEmail
        AdminPassword = $AdminPassword
        BaseCurrency  = $BaseCurrency
        PreferredLanguage = 'en'
    } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "http://localhost:$Port/api/v1/setup/initialize" -Method Post -Body $initBody -ContentType 'application/json' -TimeoutSec 30 | Out-Null
        Write-Step "Admin created."
    } catch {
        # If 409 already_initialized, that's fine - re-running the installer.
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 409) {
            Write-Step "Setup already initialized (409). Skipping admin creation."
        } else {
            throw "Initialize call failed: $($_.Exception.Message)"
        }
    }

    # ---- Convenience shortcut --------------------------------------------
    $shortcut = Join-Path $AppDir 'open-browser.cmd'
    Set-Content -Path $shortcut -Value "@start http://${PublicHost}:$Port/login" -Encoding ASCII

    Write-Step "Done. Open http://${PublicHost}:$Port/login to sign in."
    Stop-Transcript | Out-Null
    exit 0
}
catch {
    Write-Step "ERROR: $($_.Exception.Message)"
    Write-Output $_.ScriptStackTrace
    Stop-Transcript | Out-Null
    exit 1
}
