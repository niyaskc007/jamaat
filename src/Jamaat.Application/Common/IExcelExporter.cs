namespace Jamaat.Application.Common;

/// Abstraction over the XLSX writer so Application code doesn't depend on ClosedXML directly.
/// Reports build a <see cref="ExcelSheet"/> per tab and hand them off - the Infrastructure
/// implementation handles formatting, header styling, and byte-buffer production.
public interface IExcelExporter
{
    /// <summary>Render the given sheets to an XLSX byte array ready to stream to the client.</summary>
    byte[] Build(IReadOnlyList<ExcelSheet> sheets);

    /// <summary>Render a single sheet as RFC 4180 CSV bytes (UTF-8 with BOM so Excel
    /// detects the encoding correctly when double-clicked). CSV has no concept of multiple
    /// tabs — callers either pick the most useful sheet or call this once per sheet they
    /// want exported separately.</summary>
    byte[] BuildCsv(ExcelSheet sheet);
}

public sealed record ExcelSheet(
    string Name,
    IReadOnlyList<ExcelColumn> Columns,
    IReadOnlyList<IReadOnlyList<object?>> Rows);

public sealed record ExcelColumn(string Header, ExcelColumnType Type = ExcelColumnType.Text, string? NumberFormat = null);

public enum ExcelColumnType
{
    Text,
    Number,
    Currency,
    Date,
    DateTime,
}
