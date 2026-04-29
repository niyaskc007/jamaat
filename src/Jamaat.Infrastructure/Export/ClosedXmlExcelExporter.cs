using ClosedXML.Excel;
using Jamaat.Application.Common;

namespace Jamaat.Infrastructure.Export;

/// Thin wrapper around ClosedXML that turns <see cref="ExcelSheet"/> definitions into
/// an XLSX byte array. Writes a bold + coloured header row, freezes the first row,
/// auto-sizes columns, and applies per-type number formats. No external styling file -
/// everything is set programmatically so the output opens identically in Excel/LibreOffice.
public sealed class ClosedXmlExcelExporter : IExcelExporter
{
    public byte[] Build(IReadOnlyList<ExcelSheet> sheets)
    {
        using var wb = new XLWorkbook();
        foreach (var sheet in sheets)
        {
            // Worksheet names: max 31 chars, no reserved characters.
            var safeName = SafeSheetName(sheet.Name);
            var ws = wb.AddWorksheet(safeName);

            // Header row
            for (var c = 0; c < sheet.Columns.Count; c++)
            {
                var cell = ws.Cell(1, c + 1);
                cell.Value = sheet.Columns[c].Header;
                cell.Style.Font.Bold = true;
                cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#0B6E63");
                cell.Style.Font.FontColor = XLColor.White;
            }

            // Data rows
            for (var r = 0; r < sheet.Rows.Count; r++)
            {
                var row = sheet.Rows[r];
                for (var c = 0; c < sheet.Columns.Count && c < row.Count; c++)
                {
                    var cell = ws.Cell(r + 2, c + 1);
                    WriteCell(cell, row[c], sheet.Columns[c]);
                }
            }

            ws.SheetView.FreezeRows(1);
            ws.Columns().AdjustToContents();
            // Clamp ultra-wide columns so long notes don't push the viewport off-screen.
            foreach (var col in ws.ColumnsUsed())
            {
                if (col.Width > 60) col.Width = 60;
            }
        }

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void WriteCell(IXLCell cell, object? value, ExcelColumn col)
    {
        if (value is null) { cell.Value = string.Empty; return; }

        switch (col.Type)
        {
            case ExcelColumnType.Number:
                cell.Value = Convert.ToDouble(value);
                cell.Style.NumberFormat.Format = col.NumberFormat ?? "#,##0.00";
                break;
            case ExcelColumnType.Currency:
                cell.Value = Convert.ToDouble(value);
                cell.Style.NumberFormat.Format = col.NumberFormat ?? "#,##0.00";
                break;
            case ExcelColumnType.Date:
                cell.Value = value switch
                {
                    DateOnly d => d.ToDateTime(TimeOnly.MinValue),
                    DateTime dt => dt,
                    DateTimeOffset dto => dto.UtcDateTime,
                    _ => Convert.ToDateTime(value),
                };
                cell.Style.NumberFormat.Format = col.NumberFormat ?? "yyyy-mm-dd";
                break;
            case ExcelColumnType.DateTime:
                cell.Value = value switch
                {
                    DateTime dt => dt,
                    DateTimeOffset dto => dto.UtcDateTime,
                    _ => Convert.ToDateTime(value),
                };
                cell.Style.NumberFormat.Format = col.NumberFormat ?? "yyyy-mm-dd hh:mm";
                break;
            default:
                cell.Value = value?.ToString() ?? string.Empty;
                break;
        }
    }

    private static string SafeSheetName(string name)
    {
        var cleaned = name.Replace(":", "-").Replace("/", "-").Replace("\\", "-")
            .Replace("?", "").Replace("*", "").Replace("[", "").Replace("]", "");
        return cleaned.Length > 31 ? cleaned[..31] : cleaned;
    }
}
