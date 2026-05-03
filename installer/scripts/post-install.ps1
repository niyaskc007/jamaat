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
    # Helper: idempotently set a property on a pscustomobject. Required because PS 5.1
    # `ConvertFrom-Json` returns objects you can't dot-assign new properties to: $cfg.Foo.Bar
    # = ... blows up with "The property 'Bar' cannot be found on this object" when Bar
    # didn't already exist. Add-Member -Force handles both create and overwrite.
    function Set-NestedJsonProp { param($Obj, [string]$Name, $Value)
        $Obj | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
    }
    function Initialize-JsonSection { param($Parent, [string]$Name)
        if ($null -eq $Parent.$Name) {
            $Parent | Add-Member -NotePropertyName $Name -NotePropertyValue ([pscustomobject]@{}) -Force
        }
        return $Parent.$Name
    }

    $csSection = Initialize-JsonSection $cfg 'ConnectionStrings'
    Set-NestedJsonProp $csSection 'Default' $cs

    # CORS: always include the public hostname; append any extras.
    $origins = @("http://${PublicHost}:$Port", "https://${PublicHost}:$Port")
    if ($CorsOrigins) {
        $extra = $CorsOrigins -split "[\r\n,]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $origins += $extra
    }
    $corsSection = Initialize-JsonSection $cfg 'Cors'
    Set-NestedJsonProp $corsSection 'Origins' @($origins | Select-Object -Unique)

    # Bake the seed admin so DatabaseSeeder hooks pick it up if Setup:UseWizard is false.
    # We default to UseWizard=false for installer-driven installs (admin already chosen here).
    $setupSection = Initialize-JsonSection $cfg 'Setup'
    Set-NestedJsonProp $setupSection 'UseWizard' $false

    $seedSection = Initialize-JsonSection $cfg 'Seed'
    Set-NestedJsonProp $seedSection 'AdminEmail' $AdminEmail
    Set-NestedJsonProp $seedSection 'AdminPassword' $AdminPassword
    Set-NestedJsonProp $seedSection 'AdminFullName' $AdminFullName
    Set-NestedJsonProp $seedSection 'TenantName' $TenantName
    Set-NestedJsonProp $seedSection 'BaseCurrency' $BaseCurrency

    # Rotate the JWT signing key. The shipped value is a placeholder; on a fresh install
    # we generate a 64-byte random secret so two installs of the same MSI don't share a key.
    $bytes = New-Object byte[] 64
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $jwtSection = Initialize-JsonSection $cfg 'Jwt'
    Set-NestedJsonProp $jwtSection 'Key' ([Convert]::ToBase64String($bytes))

    # Direct .NET write rather than Set-Content. Set-Content does an atomic temp-write +
    # move which Defender / EDR sometimes blocks on Program Files (the temp file's hash
    # doesn't match a trusted EXE so it gets quarantined mid-rename, surfacing as "access
    # denied" on the original target). WriteAllText is a single in-place write that's much
    # less likely to trip those rules.
    $jsonOut = $cfg | ConvertTo-Json -Depth 16
    $utf8 = New-Object System.Text.UTF8Encoding($false)  # no BOM, ASP.NET config reader doesn't need one
    [System.IO.File]::WriteAllText($cfgPath, $jsonOut, $utf8)

    # ---- Register Windows Service ----------------------------------------
    Write-Step "Registering JamaatApi Windows Service"
    $apiExe = Join-Path $apiDir 'Jamaat.Api.exe'
    if (-not (Test-Path $apiExe)) { throw "Jamaat.Api.exe not found at $apiExe" }

    # Stop + remove any existing service from a prior install so binPath updates.
    $existing = Get-Service -Name 'JamaatApi' -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Step "Removing existing JamaatApi service"
        if ($existing.Status -ne 'Stopped') {
            try { Stop-Service -Name 'JamaatApi' -Force -ErrorAction Stop } catch { }
            Start-Sleep -Seconds 1
        }
        # Remove-Service is PS 6+. On 5.1 we use sc.exe delete which DOES work for delete -
        # the create command is the only one that PS 5.1 mangles in this script.
        if (Get-Command Remove-Service -ErrorAction SilentlyContinue) {
            Remove-Service -Name 'JamaatApi' -ErrorAction SilentlyContinue
        } else {
            & sc.exe delete JamaatApi 2>&1 | Out-Null
        }
        Start-Sleep -Seconds 2
    }

    # New-Service is the right tool here: clean named parameters, no sc.exe `key= value`
    # quoting mess. The earlier `sc.exe create` route was failing with exit 1639 ("invalid
    # command line argument") because PowerShell collapses spaces around `=` and sc.exe
    # ends up seeing nonsense.
    $binPath = "`"$apiExe`" --urls http://*:$Port"
    New-Service `
        -Name 'JamaatApi' `
        -BinaryPathName $binPath `
        -DisplayName 'Jamaat API' `
        -Description 'Jamaat community management web API.' `
        -StartupType Automatic | Out-Null

    # Restart on crash: 60s delay, three retries inside 24h. sc.exe failure DOES work
    # because its arguments don't include a `=` followed by a space-separated value -
    # they're all single tokens so PS arg-parsing is happy.
    & sc.exe failure JamaatApi reset= 86400 actions= restart/60000/restart/60000/restart/60000 2>&1 | Out-Null

    Write-Step "Starting JamaatApi service"
    try {
        Start-Service -Name 'JamaatApi' -ErrorAction Stop
    } catch {
        throw "Start-Service failed: $($_.Exception.Message). Check $logsDir and the JamaatApi service status / event log."
    }

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
