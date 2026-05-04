# Generates installer/assets/jamaat.ico from scratch using System.Drawing.
# Multi-resolution ICO (16, 32, 48, 64, 128, 256) — what Windows expects for installer
# icons + Start Menu shortcuts. Run once when branding changes; check the result into git.
#
# Design: green-gradient rounded square with a stylised "J" in white. Matches the brand
# colour (#0E5C40) used elsewhere in the SPA.

[CmdletBinding()]
param(
    [string] $OutputPath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrEmpty($OutputPath)) {
    $OutputPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) 'jamaat.ico'
}
Add-Type -AssemblyName 'System.Drawing'

function New-IconBitmap {
    param([int] $Size)
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.TextRenderingHint = 'AntiAliasGridFit'

    # Background: green gradient rounded square
    $rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,
        ([System.Drawing.Color]::FromArgb(255, 14, 92, 64)),     # #0E5C40
        ([System.Drawing.Color]::FromArgb(255, 8, 60, 42)),      # #083C2A
        45.0
    $radius = [Math]::Max(2, [int]($Size * 0.18))

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
    $path.AddArc($Size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
    $path.AddArc($Size - $radius * 2, $Size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $path.AddArc(0, $Size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $path.CloseFigure()

    $g.FillPath($brush, $path)
    $brush.Dispose()

    # White "J" centred, takes ~70% of the canvas
    $fontSize = [int]($Size * 0.7)
    $font = New-Object System.Drawing.Font 'Segoe UI', $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    # Explicit RectangleF so DrawString picks the (str, font, brush, RectangleF, fmt) overload.
    $sizeF = [single]$Size
    $rectF = New-Object System.Drawing.RectangleF (0.0, 0.0, $sizeF, $sizeF)
    $g.DrawString('J', $font, $textBrush, $rectF, $sf)
    $textBrush.Dispose()
    $font.Dispose()

    $g.Dispose()
    return $bmp
}

# Generate sizes Windows wants. ICO supports multiple resolutions in one file; the OS
# picks the right one for context (16 for tray, 32 for explorer, 48 for shortcuts, etc).
$sizes = @(16, 32, 48, 64, 128, 256)
$bitmaps = @{}
foreach ($s in $sizes) {
    Write-Host "  rendering ${s}x${s}..."
    $bitmaps[$s] = New-IconBitmap -Size $s
}

# Write a multi-resolution ICO file by hand. ICO format:
#   header (6 bytes): reserved=0, type=1 (icon), count=N
#   per-image directory entry (16 bytes each): width, height, colorCount=0, reserved=0,
#     planes=1, bitsPerPixel=32, dataSize, dataOffset
#   PNG payload per image (we use PNG inside ICO since Vista+ supports it; smaller files,
#     no DIB headers to fuss with)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms

# Pre-encode each bitmap to PNG bytes so we know payload sizes for the directory.
$pngs = @{}
foreach ($s in $sizes) {
    $pngStream = New-Object System.IO.MemoryStream
    $bitmaps[$s].Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs[$s] = $pngStream.ToArray()
    $pngStream.Dispose()
}

# Header
$bw.Write([uint16]0)               # reserved
$bw.Write([uint16]1)               # type (icon)
$bw.Write([uint16]$sizes.Count)    # number of images

# Directory entries
$offset = 6 + (16 * $sizes.Count)
foreach ($s in $sizes) {
    # ICO format quirk: width/height of 0 means 256. So we encode 256 as 0, others as-is.
    $w = if ($s -ge 256) { 0 } else { $s }
    $h = $w
    $bw.Write([byte]$w)             # width
    $bw.Write([byte]$h)             # height
    $bw.Write([byte]0)             # color count (0 for >=8bpp)
    $bw.Write([byte]0)             # reserved
    $bw.Write([uint16]1)           # color planes
    $bw.Write([uint16]32)          # bits per pixel
    $bw.Write([uint32]$pngs[$s].Length)
    $bw.Write([uint32]$offset)
    $offset += $pngs[$s].Length
}

# Payloads
foreach ($s in $sizes) { $bw.Write($pngs[$s]) }

[System.IO.File]::WriteAllBytes($OutputPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()

foreach ($s in $sizes) { $bitmaps[$s].Dispose() }

$size = (Get-Item $OutputPath).Length
Write-Host ""
Write-Host "Wrote $OutputPath ($size bytes, $($sizes.Count) resolutions)"
