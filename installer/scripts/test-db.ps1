# Bundled inside the installer; invoked by Inno Setup's Pascal "Test connection" button.
# Args are passed positionally and we write a one-line result to stdout that the Pascal
# code parses (OK / FAIL <message>). Exit code mirrors success so Pascal can also use
# Result rather than parsing the line if it prefers.

param(
    [Parameter(Mandatory = $true)] [string] $Server,
    [Parameter(Mandatory = $true)] [string] $Database,
    [Parameter(Mandatory = $true)] [ValidateSet('Windows','Sql')] [string] $AuthMode,
    [string] $User,
    [string] $Password,
    [int] $TimeoutSeconds = 5
)

$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName 'System.Data'

    if ($AuthMode -eq 'Windows') {
        $cs = "Server=$Server;Database=$Database;Integrated Security=true;TrustServerCertificate=True;Encrypt=True;Connection Timeout=$TimeoutSeconds"
    } else {
        if (-not $User) { throw 'SQL authentication selected but no user supplied.' }
        $cs = "Server=$Server;Database=$Database;User Id=$User;Password=$Password;TrustServerCertificate=True;Encrypt=True;Connection Timeout=$TimeoutSeconds"
    }

    $conn = New-Object System.Data.SqlClient.SqlConnection($cs)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT @@VERSION"
    $version = ($cmd.ExecuteScalar() -as [string]).Split("`n")[0].Trim()
    $conn.Close()

    Write-Output "OK $version"
    exit 0
}
catch {
    $msg = $_.Exception.Message -replace "[\r\n]+", ' '
    Write-Output "FAIL $msg"
    exit 1
}
