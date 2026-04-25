using Jamaat.Application.Common;
using Jamaat.Application.Receipts;
using Jamaat.Contracts.Receipts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/receipts")]
public sealed class ReceiptsController(IReceiptService svc, IExcelExporter excel) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "receipt.view")]
    public async Task<IActionResult> List([FromQuery] ReceiptListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    /// <summary>Export the filtered receipts list as XLSX (capped at 5000 rows).</summary>
    [HttpGet("export.xlsx")]
    [Authorize(Policy = "receipt.view")]
    public async Task<IActionResult> Export([FromQuery] ReceiptListQuery q, CancellationToken ct)
    {
        var capped = q with { Page = 1, PageSize = 5000 };
        var page = await svc.ListAsync(capped, ct);
        var sheet = new ExcelSheet(
            "Receipts",
            new[]
            {
                new ExcelColumn("Receipt #"),
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("ITS"),
                new ExcelColumn("Member"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Mode"),
                new ExcelColumn("Status"),
            },
            page.Items.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.ReceiptNumber,
                r.ReceiptDate,
                r.ItsNumberSnapshot,
                r.MemberNameSnapshot,
                r.AmountTotal,
                r.Currency,
                r.PaymentMode.ToString(),
                r.Status.ToString(),
            }).ToList());
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"receipts_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "receipt.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost]
    [Authorize(Policy = "receipt.create")]
    public async Task<IActionResult> Create([FromBody] CreateReceiptDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAndConfirmAsync(dto, ct);
        return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "receipt.cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelReceiptDto dto, CancellationToken ct)
    {
        var r = await svc.CancelAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/reverse")]
    [Authorize(Policy = "receipt.reverse")]
    public async Task<IActionResult> Reverse(Guid id, [FromBody] ReverseReceiptDto dto, CancellationToken ct)
    {
        var r = await svc.ReverseAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpGet("{id:guid}/pdf")]
    [Authorize(Policy = "receipt.view")]
    public async Task<IActionResult> Pdf(Guid id, [FromQuery] bool reprint, CancellationToken ct)
    {
        var r = await svc.RenderPdfAsync(id, reprint, ct);
        if (!r.IsSuccess) return ControllerResults.Problem(this, r.Error);
        return File(r.Value, "application/pdf", $"receipt-{id}.pdf");
    }

    [HttpPost("{id:guid}/reprint-log")]
    [Authorize(Policy = "receipt.reprint")]
    public async Task<IActionResult> LogReprint(Guid id, [FromBody] ReprintReceiptDto dto, CancellationToken ct)
    {
        var r = await svc.LogReprintAsync(id, dto, ct);
        return r.IsSuccess ? NoContent() : ControllerResults.Problem(this, r.Error);
    }
}
