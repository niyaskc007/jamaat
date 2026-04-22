namespace Jamaat.Application.Common;

/// Abstraction over the XLSX writer so Application code doesn't depend on ClosedXML directly.
/// Reports build a <see cref="ExcelSheet"/> per tab and hand them off — the Infrastructure
/// implementation handles formatting, header styling, and byte-buffer production.
public interface IExcelExporter
{
    /// <summary>Render the given sheets to an XLSX byte array ready to stream to the client.</summary>
    byte[] Build(IReadOnlyList<ExcelSheet> sheets);
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
