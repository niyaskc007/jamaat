# Idempotent SQL provisioning for the Jamaat installer.
#
# Runs as the OPERATOR's identity (the person clicking through the installer wizard) and
# uses sysadmin-level rights to:
#   1. CREATE DATABASE if missing.
#   2. CREATE LOGIN for the chosen service identity (if not already present).
#   3. CREATE USER in the database mapped to the login.
#   4. ALTER ROLE db_owner ADD MEMBER -> grants the service the rights it needs.
#
# Every action is idempotent (IF NOT EXISTS guards) so this script is safe to re-run on a
# partially-provisioned install.
#
# Service identity types (the SQL principal name varies by type):
#   Virtual         -> "NT SERVICE\<ServiceName>"   (auto-managed virtual service account)
#   LocalSystem     -> "NT AUTHORITY\SYSTEM"
#   NetworkService  -> "NT AUTHORITY\NETWORK SERVICE"
#   Custom          -> "DOMAIN\user" (Windows account)
#   SqlLogin        -> the SQL login name (created with password)

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Server,
    [Parameter(Mandatory = $true)] [string] $Database,

    # Operator credentials - used to connect with sysadmin rights to do the provisioning.
    [Parameter(Mandatory = $true)] [ValidateSet('Windows','Sql')] [string] $OperatorAuth,
    [string] $OperatorUser = '',
    [string] $OperatorPassword = '',

    # Service identity that the API will run under after install.
    [Parameter(Mandatory = $true)]
    [ValidateSet('Virtual','LocalSystem','NetworkService','Custom','SqlLogin')]
    [string] $ServiceIdentityType,

    # For Custom + SqlLogin: the principal name.
    # For Custom: "DOMAIN\user". For SqlLogin: the login name.
    [string] $ServiceAccount = '',

    # For SqlLogin only: the password to set on the login.
    [string] $ServicePassword = '',

    # Used to construct the Virtual account name: "NT SERVICE\<ServiceName>"
    [Parameter(Mandatory = $true)] [string] $ServiceName,

    [int] $TimeoutSeconds = 15
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName 'System.Data'

function Write-Step([string] $msg) {
    Write-Output ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg)
}

function Resolve-SqlPrincipal {
    param([string] $Type, [string] $Account, [string] $Service)
    switch ($Type) {
        'Virtual'        { return "NT SERVICE\$Service" }
        'LocalSystem'    { return 'NT AUTHORITY\SYSTEM' }
        'NetworkService' { return 'NT AUTHORITY\NETWORK SERVICE' }
        'Custom'         { return $Account }
        'SqlLogin'       { return $Account }
    }
    throw "Unknown ServiceIdentityType: $Type"
}

function New-OperatorConnectionString {
    param([string] $Server, [string] $InitialCatalog, [string] $Auth, [string] $User, [string] $Password, [int] $Timeout)
    if ($Auth -eq 'Windows') {
        return "Server=$Server;Database=$InitialCatalog;Integrated Security=true;TrustServerCertificate=True;Encrypt=True;Connection Timeout=$Timeout"
    }
    return "Server=$Server;Database=$InitialCatalog;User Id=$User;Password=$Password;TrustServerCertificate=True;Encrypt=True;Connection Timeout=$Timeout"
}

function Invoke-Scalar {
    param($Connection, [string] $Sql, [hashtable] $Params = @{})
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    foreach ($k in $Params.Keys) {
        $p = $cmd.CreateParameter()
        $p.ParameterName = $k
        $p.Value = $Params[$k]
        $cmd.Parameters.Add($p) | Out-Null
    }
    return $cmd.ExecuteScalar()
}

function Invoke-NonQuery {
    param($Connection, [string] $Sql)
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    # Discard the rows-affected return - DDL returns -1 which would otherwise leak into stdout.
    [void]$cmd.ExecuteNonQuery()
}

# --- Resolve the SQL principal name for the chosen service identity --------
$sqlPrincipal = Resolve-SqlPrincipal -Type $ServiceIdentityType -Account $ServiceAccount -Service $ServiceName
Write-Step "Service identity will be: $sqlPrincipal (type=$ServiceIdentityType)"

# --- Connect to master under operator creds --------------------------------
$cs = New-OperatorConnectionString -Server $Server -InitialCatalog 'master' `
    -Auth $OperatorAuth -User $OperatorUser -Password $OperatorPassword -Timeout $TimeoutSeconds
$conn = New-Object System.Data.SqlClient.SqlConnection $cs

try {
    Write-Step "Connecting to $Server as $(if ($OperatorAuth -eq 'Windows') { '<integrated>' } else { $OperatorUser })"
    $conn.Open()

    # Verify operator has the rights we need (sysadmin OR equivalent grants).
    # IS_SRVROLEMEMBER returns 1 if member, 0 if not, NULL if role doesn't exist.
    $isSysadmin = Invoke-Scalar -Connection $conn -Sql "SELECT IS_SRVROLEMEMBER('sysadmin')"
    Write-Step "Operator is sysadmin: $($isSysadmin -eq 1)"
    if ($isSysadmin -ne 1) {
        # Not strictly required - they might have explicit grants - but warn.
        Write-Step "WARN: operator is not sysadmin. Provisioning may fail if explicit CREATE LOGIN / CREATE DATABASE rights aren't granted."
    }

    # ---- 1. CREATE DATABASE if missing -----------------------------------
    # Use QUOTENAME via dynamic SQL because CREATE DATABASE doesn't take parameters.
    # The injection vector is closed by escaping ] inside QUOTENAME.
    $dbExists = (Invoke-Scalar -Connection $conn -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = @n" -Params @{ '@n' = $Database }) -gt 0
    if ($dbExists) {
        Write-Step "Database [$Database] already exists - skipping CREATE."
    } else {
        Write-Step "Creating database [$Database]"
        $createDbSql = "DECLARE @sql nvarchar(200) = N'CREATE DATABASE ' + QUOTENAME(@n); EXEC sp_executesql @sql, N'@n sysname', @n = @nval"
        # We have to execute parametrically to avoid injection; sp_executesql gives us that.
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "DECLARE @sql nvarchar(200) = N'CREATE DATABASE ' + QUOTENAME(@dbn); EXEC(@sql)"
        $p = $cmd.CreateParameter(); $p.ParameterName = '@dbn'; $p.Value = $Database; $cmd.Parameters.Add($p) | Out-Null
        $cmd.ExecuteNonQuery() | Out-Null
        Write-Step "Database [$Database] created."
    }

    # ---- 2. CREATE LOGIN if missing --------------------------------------
    $loginExists = (Invoke-Scalar -Connection $conn -Sql "SELECT COUNT(*) FROM sys.server_principals WHERE name = @n" -Params @{ '@n' = $sqlPrincipal }) -gt 0
    if ($loginExists) {
        Write-Step "Login [$sqlPrincipal] already exists - skipping CREATE LOGIN."
    } else {
        Write-Step "Creating login [$sqlPrincipal]"
        $cmd = $conn.CreateCommand()
        if ($ServiceIdentityType -eq 'SqlLogin') {
            # SQL login with password. Password is escaped via dynamic SQL with REPLACE for ' chars.
            # Best practice: use a hashed/parameterless approach via sp_executesql with a sysname.
            if ([string]::IsNullOrWhiteSpace($ServicePassword)) {
                throw "SqlLogin requires -ServicePassword."
            }
            # Build a parameterless CREATE LOGIN ... WITH PASSWORD = N'...'
            # We escape ' by doubling it. This is the documented T-SQL escape.
            $escapedPw = ($ServicePassword -replace "'", "''")
            $cmd.CommandText = "DECLARE @sql nvarchar(max) = N'CREATE LOGIN ' + QUOTENAME(@p) + N' WITH PASSWORD = N''$escapedPw'', CHECK_POLICY = OFF'; EXEC(@sql)"
        } else {
            $cmd.CommandText = "DECLARE @sql nvarchar(max) = N'CREATE LOGIN ' + QUOTENAME(@p) + N' FROM WINDOWS'; EXEC(@sql)"
        }
        $p = $cmd.CreateParameter(); $p.ParameterName = '@p'; $p.Value = $sqlPrincipal; $cmd.Parameters.Add($p) | Out-Null
        $cmd.ExecuteNonQuery() | Out-Null
        Write-Step "Login [$sqlPrincipal] created."
    }

    # ---- 3. Switch to target database, CREATE USER if missing ------------
    Invoke-NonQuery -Connection $conn -Sql "USE [$($Database -replace '\]','\]\]')]"
    $userExists = (Invoke-Scalar -Connection $conn -Sql "SELECT COUNT(*) FROM sys.database_principals WHERE name = @n" -Params @{ '@n' = $sqlPrincipal }) -gt 0
    if ($userExists) {
        Write-Step "User [$sqlPrincipal] already exists in [$Database] - skipping CREATE USER."
    } else {
        Write-Step "Creating user [$sqlPrincipal] in [$Database]"
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "DECLARE @sql nvarchar(max) = N'CREATE USER ' + QUOTENAME(@p) + N' FOR LOGIN ' + QUOTENAME(@p); EXEC(@sql)"
        $p = $cmd.CreateParameter(); $p.ParameterName = '@p'; $p.Value = $sqlPrincipal; $cmd.Parameters.Add($p) | Out-Null
        $cmd.ExecuteNonQuery() | Out-Null
        Write-Step "User [$sqlPrincipal] created."
    }

    # ---- 4. Grant db_owner ----------------------------------------------
    $isOwner = (Invoke-Scalar -Connection $conn -Sql @"
SELECT COUNT(*) FROM sys.database_role_members rm
INNER JOIN sys.database_principals r ON rm.role_principal_id = r.principal_id
INNER JOIN sys.database_principals u ON rm.member_principal_id = u.principal_id
WHERE r.name = 'db_owner' AND u.name = @n
"@ -Params @{ '@n' = $sqlPrincipal }) -gt 0
    if ($isOwner) {
        Write-Step "User [$sqlPrincipal] is already db_owner - skipping ALTER ROLE."
    } else {
        Write-Step "Adding [$sqlPrincipal] to db_owner role in [$Database]"
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "DECLARE @sql nvarchar(max) = N'ALTER ROLE [db_owner] ADD MEMBER ' + QUOTENAME(@p); EXEC(@sql)"
        $p = $cmd.CreateParameter(); $p.ParameterName = '@p'; $p.Value = $sqlPrincipal; $cmd.Parameters.Add($p) | Out-Null
        $cmd.ExecuteNonQuery() | Out-Null
        Write-Step "Granted db_owner."
    }

    # ---- Output the principal name so post-install.ps1 can use it -------
    Write-Output "RESULT_SQL_PRINCIPAL=$sqlPrincipal"
    Write-Step "SQL prep completed successfully."
    exit 0
}
catch {
    Write-Step "ERROR: $($_.Exception.Message)"
    Write-Output $_.ScriptStackTrace
    exit 1
}
finally {
    if ($conn -and $conn.State -ne 'Closed') { $conn.Close() }
}
