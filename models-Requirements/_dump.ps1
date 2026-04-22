param(
  [string]$Xlsx = 'C:\Repos\Jamaat\models-Requirements\Jamaat System (1).xlsx'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Xlsx)

function Read-Entry([string]$name) {
  $e = $zip.Entries | Where-Object { $_.FullName -eq $name }
  $sr = New-Object System.IO.StreamReader($e.Open())
  try { $sr.ReadToEnd() } finally { $sr.Dispose() }
}

# Parse shared strings
[xml]$sstXml = Read-Entry 'xl/sharedStrings.xml'
$ns = New-Object System.Xml.XmlNamespaceManager($sstXml.NameTable)
$ns.AddNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$strings = @()
foreach ($si in $sstXml.sst.si) {
  $parts = @()
  if ($si.t) { $parts += $si.t.'#text' ?? $si.t }
  if ($si.r) {
    foreach ($r in $si.r) { $parts += ($r.t.'#text' ?? $r.t) }
  }
  $strings += ($parts -join '')
}

# Parse workbook sheet order
[xml]$wb = Read-Entry 'xl/workbook.xml'
$sheets = @()
foreach ($s in $wb.workbook.sheets.sheet) {
  $sheets += [pscustomobject]@{ Name = $s.name; SheetId = $s.sheetId; RId = $s.id }
}
# Map rIds to xml files via workbook rels
[xml]$rels = Read-Entry 'xl/_rels/workbook.xml.rels'
$relMap = @{}
foreach ($rel in $rels.Relationships.Relationship) {
  $relMap[$rel.Id] = $rel.Target
}

function Col-To-Num([string]$col) {
  $letters = ($col -replace '[0-9]','').ToUpper()
  $n = 0
  foreach ($c in $letters.ToCharArray()) { $n = $n * 26 + ([int]$c - 64) }
  return $n
}

foreach ($s in $sheets) {
  $target = $relMap[$s.RId]
  $entryPath = "xl/$target"
  Write-Output "===== SHEET: $($s.Name) ====="
  [xml]$sx = Read-Entry $entryPath
  foreach ($row in $sx.worksheet.sheetData.row) {
    $cells = @{}
    $maxCol = 0
    if ($row.c) {
      foreach ($c in $row.c) {
        $val = ''
        if ($c.t -eq 's') {
          if ($c.v) { $val = $strings[[int]$c.v] }
        } elseif ($c.t -eq 'inlineStr') {
          $val = $c.is.t
        } else {
          if ($c.v) { $val = $c.v }
        }
        $ref = $c.r
        $colNum = Col-To-Num $ref
        $cells[$colNum] = $val
        if ($colNum -gt $maxCol) { $maxCol = $colNum }
      }
    }
    $ordered = @()
    for ($i = 1; $i -le $maxCol; $i++) {
      $ordered += ($cells[$i] ?? '')
    }
    $line = ($ordered | ForEach-Object { $_ -replace "`r?`n"," \\n " }) -join ' | '
    Write-Output ("R{0}: {1}" -f $row.r, $line)
  }
}

$zip.Dispose()
