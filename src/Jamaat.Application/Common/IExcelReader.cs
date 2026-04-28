namespace Jamaat.Application.Common;

/// Abstraction over the XLSX reader so Application code doesn't depend on ClosedXML.
/// The Infrastructure implementation streams the first sheet, treats row 1 as headers,
/// and returns each subsequent row as a header-keyed dictionary of trimmed strings.
public interface IExcelReader
{
    /// Read every data row from the given workbook. Cell values are coerced to string —
    /// dates emit ISO yyyy-MM-dd, decimals invariant culture, booleans 'true'/'false'.
    /// Empty rows (all cells blank) are skipped silently.
    IReadOnlyList<ExcelImportRow> Read(Stream stream, int sheetIndex = 0);
}

/// One read row + its 1-based Excel row number, so error messages can point at the
/// exact line a user sees in their workbook.
public sealed record ExcelImportRow(int RowNumber, IReadOnlyDictionary<string, string?> Cells)
{
    public string? Get(string header) => Cells.TryGetValue(header, out var v) ? v : null;
    public string? Get(params string[] aliases)
    {
        // Some operators export with slightly different headers (e.g. "Full Name" vs "FullName").
        // Accept any of the supplied aliases — match is case-insensitive, ignores whitespace.
        foreach (var a in aliases)
            if (Cells.TryGetValue(a, out var v) && !string.IsNullOrWhiteSpace(v)) return v;
        return null;
    }
}

/// Standard return shape for any import. Errors are per-row so the user can pinpoint
/// what failed in their spreadsheet without having to rerun the whole job.
public sealed record ImportResult(int TotalRows, int CommittedCount, IReadOnlyList<ImportRowError> Errors);

public sealed record ImportRowError(int RowNumber, string Message, string? Field = null);
