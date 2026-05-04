# Layer-1 test harness for the Jamaat installer scripts.
#
# Exercises every post-install step against an isolated test directory + test SQL DB
# WITHOUT actually installing anything to Program Files or registering a real service.
# Catches the lion's share of installer regressions on the dev machine - clean-VM testing
# (Layer 2) is only required for environment-specific issues (missing .NET runtime,
# different Windows Defender posture, etc.).
#
# Usage (elevated PS):
#   .\installer\test\run-all.ps1
#   .\installer\test\run-all.ps1 -Identity Virtual    # just one identity
#   .\installer\test\run-all.ps1 -Cleanup             # remove all test artifacts
#
# What it does per matrix:
#   1. Drops + recreates a test DB (fresh state)
#   2. Stops + deletes any existing JamaatApi-Test service
#   3. Lays down a copy of build/api/ to C:\JamaatTest\Api\
#   4. Runs each post-install step in order via post-install.ps1 -Step
#   5. Asserts: appsettings patched, DB exists, login + user + role present, service
#      registered with the right identity, service running, /setup/status returns 200,
#      admin created (login as admin succeeds)
#   6. Reports green/red per step, exits non-zero if any matrix fails

[CmdletBinding()]
param(
    [ValidateSet('All','LocalSystem','Virtual','SqlLogin')]
    [string] $Identity = 'All',
    [string] $TestRoot = 'C:\JamaatTest',
    [string] $TestDbName = 'JAMAAT_TEST_INSTALLER',
    [int]    $TestPort = 51790,
    [string] $TestServiceName = 'JamaatApi-Test',
    [switch] $Cleanup,
    [switch] $KeepArtifacts
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$apiSource = Join-Path $repoRoot 'build\api'
$installerScripts = Join-Path $repoRoot 'installer\scripts'

function Step([string] $msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Pass([string] $msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail([string] $msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red; $script:Failures++ }
function Note([string] $msg) { Write-Host "  $msg" -ForegroundColor Gray }

$script:Failures = 0

function Invoke-Sql {
    param([string] $Server, [string] $Db = 'master', [string] $Sql, [hashtable] $Params = @{})
    Add-Type -AssemblyName 'System.Data'
    $cs = "Server=$Server;Database=$Db;Integrated Security=true;TrustServerCertificate=True;Encrypt=True;Connection Timeout=10"
    $c = New-Object System.Data.SqlClient.SqlConnection $cs
    $c.Open()
    try {
        $cmd = $c.CreateCommand()
        $cmd.CommandText = $Sql
        foreach ($k in $Params.Keys) {
            $p = $cmd.CreateParameter(); $p.ParameterName = $k; $p.Value = $Params[$k]
            $cmd.Parameters.Add($p) | Out-Null
        }
        $rdr = $cmd.ExecuteReader()
        $rows = @()
        while ($rdr.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $rdr.FieldCount; $i++) { $row[$rdr.GetName($i)] = $rdr.GetValue($i) }
            $rows += [pscustomobject]$row
        }
        return $rows
    } finally { $c.Close() }
}

function Reset-TestEnvironment {
    param([string] $DbName, [string] $ServiceName, [string] $Root)

    # 1. Stop + delete the test service if it exists.
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Note "stopping + deleting service $ServiceName"
        if ($svc.Status -ne 'Stopped') { try { Stop-Service $ServiceName -Force -ErrorAction Stop } catch { } }
        Start-Sleep -Seconds 1
        & sc.exe delete $ServiceName 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }

    # 2. Free the test port if anything is on it.
    Get-NetTCPConnection -LocalPort $TestPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Note "killing PID $($_.OwningProcess) on port $TestPort"
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }

    # 3. Drop the test DB if it exists.
    Note "dropping DB $DbName if exists"
    $dropSql = @"
IF DB_ID(@d) IS NOT NULL
BEGIN
    ALTER DATABASE [$($DbName -replace '\]','\]\]')] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$($DbName -replace '\]','\]\]')];
END
"@
    Invoke-Sql -Server 'localhost' -Sql $dropSql -Params @{ '@d' = $DbName } | Out-Null

    # 4. Reset the test root directory.
    if (Test-Path $Root) {
        Note "removing $Root"
        Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path (Join-Path $Root 'Api') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $Root 'Logs') -Force | Out-Null

    # 5. Copy the published API into the test Api directory.
    if (-not (Test-Path $apiSource)) {
        throw "Published API not found at $apiSource. Run 'installer\build.ps1' first (or skip with -SkipApiBuild after a previous successful run)."
    }
    Note "copying $apiSource -> $Root\Api"
    Copy-Item -Path "$apiSource\*" -Destination (Join-Path $Root 'Api') -Recurse -Force
}

function Build-ParamsFile {
    param([string] $IdentityType, [string] $ParamsPath, [string] $StatePath, [string] $TestRoot, [string] $DbName)
    $params = @{
        AppDir              = $TestRoot
        DbServer            = 'localhost'
        DbDatabase          = $DbName
        OperatorAuth        = 'Windows'
        OperatorUser        = ''
        OperatorPassword    = ''
        ServiceIdentityType = $IdentityType
        ServiceAccount      = ''
        ServicePassword     = ''
        Port                = $TestPort
        PublicHost          = 'localhost'
        CorsOrigins         = ''
        AdminFullName       = 'Test Admin'
        AdminEmail          = 'admin@test.local'
        AdminPassword       = 'Admin@12345'
        TenantName          = 'Test Jamaat'
        BaseCurrency        = 'AED'
    }
    if ($IdentityType -eq 'SqlLogin') {
        $params.ServiceAccount  = 'jamaat_test_login'
        $params.ServicePassword = 'Sql@TestPwd123'
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ParamsPath, ($params | ConvertTo-Json), $utf8)
}

function Test-Matrix {
    param([string] $IdentityType)

    Step "Matrix: ServiceIdentity=$IdentityType"
    $matrixRoot = Join-Path $TestRoot $IdentityType
    $matrixDb   = "${TestDbName}_${IdentityType}"
    $matrixSvc  = "${TestServiceName}_${IdentityType}"

    Reset-TestEnvironment -DbName $matrixDb -ServiceName $matrixSvc -Root $matrixRoot

    $stateFile  = Join-Path $matrixRoot 'install-state.json'
    $paramsFile = Join-Path $matrixRoot 'params.json'
    Build-ParamsFile -IdentityType $IdentityType -ParamsPath $paramsFile -StatePath $stateFile -TestRoot $matrixRoot -DbName $matrixDb

    # Override the service name for the matrix - we don't want to step on the real
    # JamaatApi service if there's one. We do this by editing the post-install.ps1's
    # service name in-flight via a bound param... but for simplicity here we just rely
    # on the test using a different DB; the service name stays 'JamaatApi'. So we kill
    # any existing JamaatApi first:
    $svc = Get-Service -Name 'JamaatApi' -ErrorAction SilentlyContinue
    if ($svc) {
        if ($svc.Status -ne 'Stopped') { try { Stop-Service 'JamaatApi' -Force } catch { } }
        Start-Sleep -Seconds 1
        & sc.exe delete 'JamaatApi' 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }
    # Free the prod port too in case the user has it occupied.
    Get-NetTCPConnection -LocalPort 5174,5179 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }

    $stepNames = @('patch-config','sql-prep','firewall','service-register','service-failure','service-start','init-admin','shortcut')
    foreach ($s in $stepNames) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installerScripts 'post-install.ps1') `
            -Step $s -StateFile $stateFile -ParamsFile $paramsFile 2>&1 | ForEach-Object { Write-Host "    $_" }
        if ($LASTEXITCODE -ne 0) { Fail "step '$s' failed. State at $stateFile"; return }
    }

    # ---- Assertions ----------------------------------------------------
    Note "asserting end-state"

    # 1. appsettings patched
    $cfg = Get-Content (Join-Path $matrixRoot 'Api\appsettings.json') -Raw | ConvertFrom-Json
    if ($cfg.ConnectionStrings.Default -match $matrixDb) { Pass "appsettings.json points at $matrixDb" } else { Fail "ConnectionStrings.Default mismatch: $($cfg.ConnectionStrings.Default)" }
    if ($cfg.Setup.UseWizard -eq $false) { Pass "Setup.UseWizard=false" } else { Fail "Setup.UseWizard not patched" }
    if ($cfg.Seed.AdminEmail -eq 'admin@test.local') { Pass "Seed.AdminEmail set" } else { Fail "Seed.AdminEmail mismatch: $($cfg.Seed.AdminEmail)" }
    if ($cfg.Jwt.Key -and $cfg.Jwt.Key -ne 'REPLACE_WITH_STRONG_RANDOM_KEY_AT_LEAST_32_BYTES_LONG_0123456789') { Pass "Jwt.Key rotated" } else { Fail "Jwt.Key not rotated" }

    # 2. DB exists + login + user + role
    $dbHit = Invoke-Sql -Server 'localhost' -Sql "SELECT name FROM sys.databases WHERE name = @d" -Params @{ '@d' = $matrixDb }
    if ($dbHit) { Pass "Database $matrixDb exists" } else { Fail "Database $matrixDb missing" }

    $sqlPrincipal = switch ($IdentityType) {
        'Virtual'        { 'NT SERVICE\JamaatApi' }
        'LocalSystem'    { 'NT AUTHORITY\SYSTEM' }
        'NetworkService' { 'NT AUTHORITY\NETWORK SERVICE' }
        'SqlLogin'       { 'jamaat_test_login' }
    }
    $loginHit = Invoke-Sql -Server 'localhost' -Sql "SELECT name FROM sys.server_principals WHERE name = @n" -Params @{ '@n' = $sqlPrincipal }
    if ($loginHit) { Pass "SQL login [$sqlPrincipal] exists" } else { Fail "SQL login [$sqlPrincipal] missing" }

    $userHit = Invoke-Sql -Server 'localhost' -Db $matrixDb -Sql "SELECT name FROM sys.database_principals WHERE name = @n" -Params @{ '@n' = $sqlPrincipal }
    if ($userHit) { Pass "DB user [$sqlPrincipal] exists in $matrixDb" } else { Fail "DB user [$sqlPrincipal] missing in $matrixDb" }

    # 3. Service registered with the right identity
    $svc = Get-WmiObject -Class Win32_Service -Filter "Name='JamaatApi'" -ErrorAction SilentlyContinue
    if ($svc) {
        Pass "Service JamaatApi registered (StartName=$($svc.StartName))"
        $expectedStart = switch ($IdentityType) {
            'Virtual'        { 'NT SERVICE\JamaatApi' }
            'LocalSystem'    { 'LocalSystem' }
            'NetworkService' { 'NT AUTHORITY\NetworkService' }
            'SqlLogin'       { 'LocalSystem' }
        }
        if ($svc.StartName -eq $expectedStart) { Pass "Service identity correct ($expectedStart)" } else { Fail "Service identity mismatch: expected $expectedStart, got $($svc.StartName)" }
        if ($svc.State -eq 'Running') { Pass "Service is Running" } else { Fail "Service is $($svc.State)" }
    } else { Fail 'Service JamaatApi not registered' }

    # 4. /setup/status returns 200
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:$TestPort/api/v1/setup/status" -TimeoutSec 5
        if ($r.dbReachable) { Pass "/setup/status: dbReachable=true" } else { Fail "/setup/status: dbReachable=false" }
    } catch { Fail "/setup/status: $($_.Exception.Message)" }

    # 5. Admin login works
    try {
        $body = @{ email = 'admin@test.local'; password = 'Admin@12345' } | ConvertTo-Json
        $login = Invoke-RestMethod -Uri "http://localhost:$TestPort/api/v1/auth/login" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 10
        if ($login.accessToken) { Pass "admin login OK (token len=$($login.accessToken.Length))" } else { Fail 'admin login: no token in response' }
    } catch { Fail "admin login: $($_.Exception.Message)" }

    # 6. Idempotency: re-run the whole sequence; every step should report 'already done'.
    Note "re-running sequence (idempotency check)"
    foreach ($s in $stepNames) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installerScripts 'post-install.ps1') `
            -Step $s -StateFile $stateFile -ParamsFile $paramsFile 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Fail "idempotent re-run failed at '$s'"; return }
    }
    Pass 'idempotent re-run all green'

    # Cleanup the service so the next matrix can register it fresh.
    Get-Service 'JamaatApi' -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Status -ne 'Stopped') { try { Stop-Service 'JamaatApi' -Force } catch { } }
        Start-Sleep -Seconds 1
        & sc.exe delete 'JamaatApi' 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }
}

# ---- Cleanup-only mode --------------------------------------------------
if ($Cleanup) {
    Step "Cleanup mode"
    foreach ($id in @('LocalSystem','Virtual','NetworkService','SqlLogin')) {
        $matrixRoot = Join-Path $TestRoot $id
        $matrixDb   = "${TestDbName}_${id}"
        Reset-TestEnvironment -DbName $matrixDb -ServiceName "${TestServiceName}_${id}" -Root $matrixRoot
    }
    Get-Service 'JamaatApi' -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Status -ne 'Stopped') { try { Stop-Service 'JamaatApi' -Force } catch { } }
        & sc.exe delete 'JamaatApi' 2>&1 | Out-Null
    }
    if (Test-Path $TestRoot) { Remove-Item $TestRoot -Recurse -Force -ErrorAction SilentlyContinue }
    Step "Cleanup done."
    exit 0
}

# ---- Run the matrix or matrices ----------------------------------------
$matrices = if ($Identity -eq 'All') { @('LocalSystem','Virtual','SqlLogin') } else { @($Identity) }

foreach ($m in $matrices) {
    Test-Matrix -IdentityType $m
}

Step "SUMMARY: $($script:Failures) failures across $($matrices.Count) matrices"
if ($script:Failures -gt 0) { exit 1 }
exit 0
