# Post-install state machine for the Jamaat installer.
#
# Invoked by the Inno Setup Configuration page once per step. Each step is independently:
#   - Idempotent (safe to re-run)
#   - Verifiable (post-state check that returns true if done)
#   - Recoverable (stores state to <AppDir>\install-state.json so the wizard can retry one
#     step without redoing everything)
#
# Steps (in execution order):
#   1. patch-config        Write appsettings.json
#   2. sql-prep            CREATE DATABASE / LOGIN / USER / role grant (delegates to sql-prep.ps1)
#   3. firewall            Open inbound TCP rule for the chosen port
#   4. service-register    sc.exe / New-Service for the chosen identity
#   5. service-failure     sc.exe failure for restart-on-crash
#   6. service-start       Start-Service + wait for /health/ready
#   7. init-admin          POST /api/v1/setup/initialize
#   8. shortcut            Write <AppDir>\open-browser.cmd
#
# The wizard's Configuration page invokes us as:
#   post-install.ps1 -Step <name> -StateFile ... -ParamsFile ...
# where ParamsFile is a JSON blob of all the wizard inputs (so we don't have 30 -Param args).
# Exit code: 0 = step succeeded (or already done). Non-zero = failed; the JSON state file
# will have an `error` field and the wizard surfaces Retry / Skip / View log buttons.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('patch-config','sql-prep','firewall','service-register','service-failure','data-dirs','service-start','init-admin','shortcut','all')]
    [string] $Step,

    [Parameter(Mandatory = $true)] [string] $StateFile,
    [Parameter(Mandatory = $true)] [string] $ParamsFile,

    # When set, the script writes step-by-step progress lines that the Pascal page can
    # parse to update its UI. Format: "PROGRESS|<state>|<message>" where state is one of
    # running|done|skipped|error.
    [switch] $Progress
)

$ErrorActionPreference = 'Stop'

# ---- Helpers --------------------------------------------------------------

function Write-Progress2 {
    param([string] $State, [string] $Message)
    if ($Progress) { Write-Output "PROGRESS|$State|$Message" }
    Write-Output ("[{0}] {1}: {2}" -f (Get-Date -Format 'HH:mm:ss'), $State.ToUpper(), $Message)
}

function Read-State {
    param([string] $Path)
    if (Test-Path $Path) {
        try { return Get-Content $Path -Raw | ConvertFrom-Json } catch { }
    }
    return [pscustomobject]@{ steps = [pscustomobject]@{}; errors = @(); started_at = (Get-Date).ToUniversalTime().ToString('o') }
}

function Save-State {
    param([string] $Path, $State)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, ($State | ConvertTo-Json -Depth 16), $utf8)
}

function Set-StepStatus {
    param($State, [string] $StepName, [string] $Status, [string] $Detail = '')
    if (-not $State.steps) { $State | Add-Member -NotePropertyName 'steps' -NotePropertyValue ([pscustomobject]@{}) -Force }
    $State.steps | Add-Member -NotePropertyName $StepName -NotePropertyValue $Status -Force
    if ($Detail) {
        $State | Add-Member -NotePropertyName "${StepName}_detail" -NotePropertyValue $Detail -Force
    }
}

function Read-Params {
    param([string] $Path)
    return Get-Content $Path -Raw | ConvertFrom-Json
}

function Initialize-JsonSection {
    param($Parent, [string] $Name)
    if ($null -eq $Parent.$Name) {
        $Parent | Add-Member -NotePropertyName $Name -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    return $Parent.$Name
}

function Set-NestedJsonProp {
    param($Obj, [string] $Name, $Value)
    $Obj | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
}

# ---- Step implementations -------------------------------------------------

function Step-PatchConfig {
    param($p)
    $cfgPath = Join-Path $p.AppDir 'Api\appsettings.json'
    if (-not (Test-Path $cfgPath)) { throw "appsettings.json not found at $cfgPath" }

    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json

    # Build connection string for the SERVICE identity. The service uses Windows auth as
    # NT SERVICE\JamaatApi / NT AUTHORITY\SYSTEM / NT AUTHORITY\NETWORK SERVICE / a domain
    # account, OR a SQL login. Matched to what sql-prep.ps1 provisioned.
    $cs = switch ($p.ServiceIdentityType) {
        'SqlLogin' {
            # Use the SqlLogin credentials in the connection string.
            "Server=$($p.DbServer);Database=$($p.DbDatabase);User Id=$($p.ServiceAccount);Password=$($p.ServicePassword);TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true"
        }
        default {
            # Windows auth - the service identity authenticates implicitly.
            "Server=$($p.DbServer);Database=$($p.DbDatabase);Integrated Security=true;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true"
        }
    }

    $csSection = Initialize-JsonSection $cfg 'ConnectionStrings'
    Set-NestedJsonProp $csSection 'Default' $cs

    # CORS: include the public hostname + any extras.
    $origins = @("http://$($p.PublicHost):$($p.Port)", "https://$($p.PublicHost):$($p.Port)")
    if ($p.CorsOrigins) {
        $extra = $p.CorsOrigins -split "[\r\n,]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $origins += $extra
    }
    $corsSection = Initialize-JsonSection $cfg 'Cors'
    Set-NestedJsonProp $corsSection 'Origins' @($origins | Select-Object -Unique)

    $setupSection = Initialize-JsonSection $cfg 'Setup'
    Set-NestedJsonProp $setupSection 'UseWizard' $false

    $seedSection = Initialize-JsonSection $cfg 'Seed'
    Set-NestedJsonProp $seedSection 'AdminEmail' $p.AdminEmail
    Set-NestedJsonProp $seedSection 'AdminPassword' $p.AdminPassword
    Set-NestedJsonProp $seedSection 'AdminFullName' $p.AdminFullName
    Set-NestedJsonProp $seedSection 'TenantName' $p.TenantName
    Set-NestedJsonProp $seedSection 'BaseCurrency' $p.BaseCurrency

    # JWT key rotation: only if it still has the placeholder (idempotent across re-runs).
    if (-not $cfg.Jwt -or $cfg.Jwt.Key -eq 'REPLACE_WITH_STRONG_RANDOM_KEY_AT_LEAST_32_BYTES_LONG_0123456789' -or [string]::IsNullOrEmpty($cfg.Jwt.Key)) {
        $bytes = New-Object byte[] 64
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $jwtSection = Initialize-JsonSection $cfg 'Jwt'
        Set-NestedJsonProp $jwtSection 'Key' ([Convert]::ToBase64String($bytes))
    }

    $jsonOut = $cfg | ConvertTo-Json -Depth 16
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($cfgPath, $jsonOut, $utf8)

    return "Patched $cfgPath"
}

function Step-SqlPrep {
    param($p)
    $script = Join-Path $PSScriptRoot 'sql-prep.ps1'
    if (-not (Test-Path $script)) {
        # When invoked from the installer's {tmp} dir, the helpers sit alongside us.
        $script = Join-Path (Split-Path -Parent $MyInvocation.ScriptName) 'sql-prep.ps1'
    }
    $args = @(
        '-NoProfile','-ExecutionPolicy','Bypass','-File',$script,
        '-Server',$p.DbServer,
        '-Database',$p.DbDatabase,
        '-OperatorAuth',$p.OperatorAuth,
        '-ServiceIdentityType',$p.ServiceIdentityType,
        '-ServiceName','JamaatApi'
    )
    if ($p.OperatorAuth -eq 'Sql') {
        $args += @('-OperatorUser',$p.OperatorUser,'-OperatorPassword',$p.OperatorPassword)
    }
    if ($p.ServiceIdentityType -in @('Custom','SqlLogin')) {
        $args += @('-ServiceAccount',$p.ServiceAccount)
    }
    if ($p.ServiceIdentityType -eq 'SqlLogin') {
        $args += @('-ServicePassword',$p.ServicePassword)
    }
    $tmpOut = [System.IO.Path]::GetTempFileName()
    try {
        $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $args `
            -RedirectStandardOutput $tmpOut -NoNewWindow -PassThru -Wait
        $output = Get-Content $tmpOut -Raw
        if ($proc.ExitCode -ne 0) {
            throw "sql-prep.ps1 exit $($proc.ExitCode):`n$output"
        }
        # Capture the resolved principal name for downstream steps.
        if ($output -match 'RESULT_SQL_PRINCIPAL=(.+)') {
            return "Provisioned. Service principal: $($matches[1].Trim())"
        }
        return 'Provisioned.'
    } finally {
        Remove-Item $tmpOut -ErrorAction SilentlyContinue
    }
}

function Step-Firewall {
    param($p)
    $ruleName = "Jamaat API ($($p.Port))"
    # netsh.exe works on every Windows version; New-NetFirewallRule needs PSv5+ and admin.
    & netsh.exe advfirewall firewall delete rule name="`"$ruleName`"" 2>&1 | Out-Null
    & netsh.exe advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$($p.Port) 2>&1 | Out-String | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "netsh add rule failed (exit $LASTEXITCODE)" }
    return "Opened TCP $($p.Port)"
}

function Step-ServiceRegister {
    param($p)
    $apiExe = Join-Path $p.AppDir 'Api\Jamaat.Api.exe'
    if (-not (Test-Path $apiExe)) { throw "Jamaat.Api.exe not found at $apiExe" }

    # Stop + remove existing service so binPath / identity changes take effect.
    $existing = Get-Service -Name 'JamaatApi' -ErrorAction SilentlyContinue
    if ($existing) {
        if ($existing.Status -ne 'Stopped') {
            try { Stop-Service -Name 'JamaatApi' -Force -ErrorAction Stop } catch { }
            Start-Sleep -Seconds 1
        }
        if (Get-Command Remove-Service -ErrorAction SilentlyContinue) {
            Remove-Service -Name 'JamaatApi' -ErrorAction SilentlyContinue
        } else {
            & sc.exe delete JamaatApi 2>&1 | Out-Null
        }
        Start-Sleep -Seconds 2
    }

    $binPath = "`"$apiExe`" --urls http://*:$($p.Port)"
    $newSvcArgs = @{
        Name           = 'JamaatApi'
        BinaryPathName = $binPath
        DisplayName    = 'Jamaat API'
        Description    = "Jamaat - product of Ubrixy Technologies. Service identity: $($p.ServiceIdentityType)."
        StartupType    = 'Automatic'
    }

    # Per-identity credential plumbing.
    switch ($p.ServiceIdentityType) {
        'LocalSystem' {
            # Default - no -Credential. New-Service registers as LocalSystem.
        }
        'NetworkService' {
            # New-Service in PS 5.1 doesn't expose NetworkService directly. Register as
            # LocalSystem then sc.exe config to flip the start-account.
            New-Service @newSvcArgs | Out-Null
            & sc.exe config JamaatApi obj= 'NT AUTHORITY\NETWORK SERVICE' 2>&1 | Out-Null
            return "Registered as NT AUTHORITY\NETWORK SERVICE"
        }
        'Virtual' {
            # Virtual service account: register as LocalSystem, then sc.exe config the
            # start-account to "NT SERVICE\JamaatApi" (the per-service virtual account).
            New-Service @newSvcArgs | Out-Null
            & sc.exe config JamaatApi obj= 'NT SERVICE\JamaatApi' 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "sc.exe config (Virtual) failed exit $LASTEXITCODE" }
            return "Registered as NT SERVICE\JamaatApi (virtual service account)"
        }
        'Custom' {
            if ([string]::IsNullOrWhiteSpace($p.ServiceAccount)) { throw "Custom identity requires ServiceAccount." }
            if ([string]::IsNullOrWhiteSpace($p.ServicePassword)) { throw "Custom identity requires ServicePassword." }
            # Build PSCredential and pass via -Credential.
            $secure = ConvertTo-SecureString $p.ServicePassword -AsPlainText -Force
            $cred = New-Object System.Management.Automation.PSCredential($p.ServiceAccount, $secure)
            $newSvcArgs.Credential = $cred
            New-Service @newSvcArgs | Out-Null
            return "Registered as $($p.ServiceAccount)"
        }
        'SqlLogin' {
            # SqlLogin = Windows auth at the service-process level (LocalSystem default),
            # but the API connects to SQL with the SQL login from appsettings. So no
            # service-identity changes here.
            New-Service @newSvcArgs | Out-Null
            return 'Registered as LocalSystem (API uses SQL login internally)'
        }
        default {
            throw "Unknown ServiceIdentityType: $($p.ServiceIdentityType)"
        }
    }
    New-Service @newSvcArgs | Out-Null
    return 'Registered as LocalSystem'
}

function Step-ServiceFailure {
    param($p)
    # Restart on crash: 60s delay, three retries inside 24h.
    & sc.exe failure JamaatApi reset= 86400 actions= restart/60000/restart/60000/restart/60000 2>&1 | Out-Null
    return 'Configured restart-on-crash (3x60s)'
}

function Resolve-ServicePrincipal {
    param($p)
    # Returns the actual Windows principal the service process runs as. Used for ACL grants.
    switch ($p.ServiceIdentityType) {
        'Virtual'        { return 'NT SERVICE\JamaatApi' }
        'LocalSystem'    { return 'NT AUTHORITY\SYSTEM' }
        'NetworkService' { return 'NT AUTHORITY\NETWORK SERVICE' }
        'SqlLogin'       { return 'NT AUTHORITY\SYSTEM' }
        'Custom'         { return $p.ServiceAccount }
        default          { return 'NT AUTHORITY\SYSTEM' }
    }
}

function Step-DataDirs {
    param($p)
    # Pre-create App_Data subdirectories used by IPhotoStorage / IEventAssetStorage /
    # IReceiptDocumentStorage / IQarzanHasanaDocumentStorage and grant Modify to the
    # service identity. Without this the storage adapters' Directory.CreateDirectory()
    # calls hit ACL denial under Program Files and the controllers using them throw
    # UnauthorizedAccessException on every request.
    $apiRoot = Join-Path $p.AppDir 'Api'
    $dirs = @(
        (Join-Path $apiRoot 'App_Data\photos\members'),
        (Join-Path $apiRoot 'App_Data\event-assets'),
        (Join-Path $apiRoot 'App_Data\documents\receipt-agreements'),
        (Join-Path $apiRoot 'App_Data\documents\qarzan-hasana')
    )
    foreach ($d in $dirs) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }

    $principal = Resolve-ServicePrincipal $p
    # Grant Modify on the App_Data root recursively. icacls /grant uses (OI)(CI) for inheritance
    # so newly created subdirs inherit. /T applies to existing children too.
    $appDataRoot = Join-Path $apiRoot 'App_Data'
    $grantArg = "$principal" + ':(OI)(CI)M'
    & icacls.exe "$appDataRoot" /grant "$grantArg" /T /C 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # icacls returns non-zero for warnings (e.g. "files skipped"); only treat as failure
        # when it didn't actually grant. Re-query to verify.
        $verify = & icacls.exe "$appDataRoot" 2>&1 | Out-String
        if ($verify -notmatch [regex]::Escape($principal)) {
            throw "icacls grant failed for $principal on $appDataRoot. Output: $verify"
        }
    }
    return "Provisioned App_Data dirs and granted Modify to $principal"
}

function Step-ServiceStart {
    param($p)
    Start-Service -Name 'JamaatApi' -ErrorAction Stop

    # Wait up to 120s for /health/ready to return 200.
    $deadline = (Get-Date).AddSeconds(120)
    $url = "http://localhost:$($p.Port)/api/v1/setup/status"
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) {
                return "Service running, /api/v1/setup/status returned 200"
            }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw "Service started but $url did not respond within 120s. Check Windows Event Log + service status."
}

function Step-InitAdmin {
    param($p)
    $body = @{
        TenantName    = $p.TenantName
        TenantCode    = ($p.TenantName -replace '\s+','').ToUpperInvariant()
        AdminFullName = $p.AdminFullName
        AdminEmail    = $p.AdminEmail
        AdminPassword = $p.AdminPassword
        BaseCurrency  = $p.BaseCurrency
        PreferredLanguage = 'en'
    } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "http://localhost:$($p.Port)/api/v1/setup/initialize" -Method Post `
            -Body $body -ContentType 'application/json' -TimeoutSec 30 | Out-Null
        return "Admin $($p.AdminEmail) created."
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 409) {
            return 'Setup already initialized (409). Skipped.'
        }
        throw "POST /api/v1/setup/initialize failed: $($_.Exception.Message)"
    }
}

function Step-Shortcut {
    param($p)
    $shortcut = Join-Path $p.AppDir 'open-browser.cmd'
    Set-Content -Path $shortcut -Value "@start http://$($p.PublicHost):$($p.Port)/login" -Encoding ASCII
    return "Wrote $shortcut"
}

# ---- Driver --------------------------------------------------------------

function Invoke-Step {
    param([string] $Name, $Params, $State)
    $existing = $null
    if ($State.steps -and $State.steps.PSObject.Properties.Name -contains $Name) {
        $existing = $State.steps.$Name
    }
    if ($existing -eq 'ok') {
        Write-Progress2 'skipped' "$Name : already done"
        return $true
    }
    Write-Progress2 'running' "$Name"
    try {
        $detail = switch ($Name) {
            'patch-config'      { Step-PatchConfig $Params }
            'sql-prep'          { Step-SqlPrep $Params }
            'firewall'          { Step-Firewall $Params }
            'service-register'  { Step-ServiceRegister $Params }
            'service-failure'   { Step-ServiceFailure $Params }
            'data-dirs'         { Step-DataDirs $Params }
            'service-start'     { Step-ServiceStart $Params }
            'init-admin'        { Step-InitAdmin $Params }
            'shortcut'          { Step-Shortcut $Params }
        }
        Set-StepStatus $State $Name 'ok' $detail
        Save-State $StateFile $State
        Write-Progress2 'done' "$Name : $detail"
        return $true
    } catch {
        $msg = $_.Exception.Message
        Set-StepStatus $State $Name 'error' $msg
        # Append to error history so we have a chain across retries.
        if (-not $State.errors) {
            $State | Add-Member -NotePropertyName 'errors' -NotePropertyValue @() -Force
        }
        $State.errors = @($State.errors) + @([pscustomobject]@{ step = $Name; message = $msg; at = (Get-Date).ToUniversalTime().ToString('o') })
        Save-State $StateFile $State
        Write-Progress2 'error' "$Name : $msg"
        return $false
    }
}

# ---- Main ----------------------------------------------------------------

$state = Read-State $StateFile
$params = Read-Params $ParamsFile

# Make sure logs dir exists for transcript-style fallback.
$logsDir = Join-Path $params.AppDir 'Logs'
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

if ($Step -eq 'all') {
    $allSteps = @('patch-config','sql-prep','firewall','service-register','service-failure','data-dirs','service-start','init-admin','shortcut')
    foreach ($s in $allSteps) {
        $ok = Invoke-Step -Name $s -Params $params -State $state
        if (-not $ok) { exit 1 }
    }
    exit 0
}

$ok = Invoke-Step -Name $Step -Params $params -State $state
if ($ok) { exit 0 } else { exit 1 }
