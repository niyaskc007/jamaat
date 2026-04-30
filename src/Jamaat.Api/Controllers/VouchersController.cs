using Jamaat.Application.Common;
using Jamaat.Application.Vouchers;
using Jamaat.Contracts.Vouchers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/vouchers")]
public sealed class VouchersController(IVoucherService svc, IExcelExporter excel) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> List([FromQuery] VoucherListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    /// <summary>Export the filtered vouchers list as XLSX (capped at 5000 rows).</summary>
    [HttpGet("export.xlsx")]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> Export([FromQuery] VoucherListQuery q, CancellationToken ct)
    {
        var capped = q with { Page = 1, PageSize = 5000 };
        var page = await svc.ListAsync(capped, ct);
        var sheet = new ExcelSheet(
            "Vouchers",
            new[]
            {
                new ExcelColumn("Voucher #"),
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Pay to"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Mode"),
                new ExcelColumn("Status"),
            },
            page.Items.Select(v => (IReadOnlyList<object?>)new object?[]
            {
                v.VoucherNumber,
                v.VoucherDate,
                v.PayTo,
                v.AmountTotal,
                v.Currency,
                v.PaymentMode.ToString(),
                v.Status.ToString(),
            }).ToList());
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"vouchers_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    /// <summary>Headline counts + amounts that drive the Vouchers list KPI strip.</summary>
    [HttpGet("summary")]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> Summary(CancellationToken ct)
        => Ok(await svc.SummaryAsync(ct));

    [HttpPost]
    [Authorize(Policy = "voucher.create")]
    public async Task<IActionResult> Create([FromBody] CreateVoucherDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ControllerResults.Problem(this, r.Error);
    }

    /// <summary>Bulk-import historical vouchers from XLSX. Each row = one single-line draft voucher.</summary>
    [HttpPost("import")]
    [Authorize(Policy = "voucher.create")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Import(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "no_file" });
        await using var s = file.OpenReadStream();
        return Ok(await svc.ImportAsync(s, ct));
    }

    [HttpGet("import-template.xlsx")]
    [Authorize(Policy = "voucher.view")]
    public IActionResult ImportTemplate()
    {
        var sheet = new ExcelSheet(
            "Vouchers template",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Pay to"),
                new ExcelColumn("Payee ITS"),
                new ExcelColumn("Purpose"),
                new ExcelColumn("Expense"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Mode"),
                new ExcelColumn("Bank account"),
                new ExcelColumn("Cheque #"),
                new ExcelColumn("Cheque date", ExcelColumnType.Date),
                new ExcelColumn("Drawn on"),
                new ExcelColumn("Narration"),
                new ExcelColumn("Remarks"),
            },
            new[] { (IReadOnlyList<object?>)new object?[] {
                DateOnly.FromDateTime(DateTime.UtcNow), "Saif Cleaning Services", null, "Mosque cleaning Apr",
                "UTIL", 250m, "AED", "Cash", null, null, null, null, "Cleaning supplies", null,
            }});
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "vouchers-import-template.xlsx");
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "voucher.approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        var r = await svc.ApproveAndPayAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "voucher.cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelVoucherDto dto, CancellationToken ct)
    {
        var r = await svc.CancelAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/reverse")]
    [Authorize(Policy = "voucher.reverse")]
    public async Task<IActionResult> Reverse(Guid id, [FromBody] ReverseVoucherDto dto, CancellationToken ct)
    {
        var r = await svc.ReverseAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpGet("{id:guid}/pdf")]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> Pdf(Guid id, CancellationToken ct)
    {
        var r = await svc.RenderPdfAsync(id, ct);
        return r.IsSuccess ? File(r.Value, "application/pdf", $"voucher-{id}.pdf") : ControllerResults.Problem(this, r.Error);
    }
}
