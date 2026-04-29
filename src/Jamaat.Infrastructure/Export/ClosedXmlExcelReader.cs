using System.Globalization;
using ClosedXML.Excel;
using Jamaat.Application.Common;

namespace Jamaat.Infrastructure.Export;

/// ClosedXML-backed implementation of <see cref="IExcelReader"/>.
/// Reads only the requested sheet, treats row 1 as headers (case-preserved), trims every
/// cell, and skips fully blank rows. Numeric/date cells are stringified using invariant
/// culture so downstream parsing is locale-stable regardless of where the file was authored.
public sealed class ClosedXmlExcelReader : IExcelReader
{
    public IReadOnlyList<ExcelImportRow> Read(Stream stream, int sheetIndex = 0)
    {
        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheets.Worksheet(sheetIndex + 1); // ClosedXML is 1-indexed

        // Use the worksheet's used range so we don't iterate millions of empty cells.
        var range = ws.RangeUsed();
        if (range is null) return Array.Empty<ExcelImportRow>();

        // Headers from row 1
        var headerRow = range.Row(1);
        var headers = new List<string>();
        foreach (var cell in headerRow.Cells())
        {
            var h = (cell.GetString() ?? string.Empty).Trim();
            if (h.Length == 0) break; // stop at first blank header - operator likely has a sentinel column
            headers.Add(h);
        }
        if (headers.Count == 0) return Array.Empty<ExcelImportRow>();

        var results = new List<ExcelImportRow>();
        // Data rows start at row 2 in the used range (i.e., absolute row 2 if header is at top).
        var lastRow = range.LastRow().RowNumber();
        var firstRow = range.FirstRow().RowNumber();
        for (var r = firstRow + 1; r <= lastRow; r++)
        {
            var row = ws.Row(r);
            var cells = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            var anyValue = false;
            for (var c = 0; c < headers.Count; c++)
            {
                var cell = row.Cell(c + 1);
                var raw = ReadCell(cell);
                cells[headers[c]] = raw;
                if (!string.IsNullOrWhiteSpace(raw)) anyValue = true;
            }
            if (anyValue) results.Add(new ExcelImportRow(r, cells));
        }
        return results;
    }

    private static string? ReadCell(IXLCell cell)
    {
        // Preserve typed values where possible - saves callers from re-parsing locale-specific text.
        if (cell.IsEmpty()) return null;
        var v = cell.Value;
        if (v.IsBlank) return null;
        if (v.IsDateTime) return v.GetDateTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (v.IsTimeSpan) return v.GetTimeSpan().ToString("c", CultureInfo.InvariantCulture);
        if (v.IsNumber) return v.GetNumber().ToString("0.############", CultureInfo.InvariantCulture);
        if (v.IsBoolean) return v.GetBoolean() ? "true" : "false";
        var s = cell.GetString();
        return string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    }
}
