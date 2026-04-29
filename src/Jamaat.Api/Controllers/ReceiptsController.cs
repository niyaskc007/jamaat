using Jamaat.Application.Common;
using Jamaat.Application.Receipts;
using Jamaat.Contracts.Receipts;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/receipts")]
public sealed class ReceiptsController(
    IReceiptService svc,
    IExcelExporter excel,
    IReceiptDocumentStorage docStorage,
    IOptions<ReceiptDocumentStorageOptions> docOptions) : ControllerBase
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

    /// <summary>Bulk-import historical receipts from XLSX. Each row = one single-line confirmed receipt.</summary>
    [HttpPost("import")]
    [Authorize(Policy = "receipt.create")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Import(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "no_file" });
        await using var s = file.OpenReadStream();
        return Ok(await svc.ImportAsync(s, ct));
    }

    [HttpGet("import-template.xlsx")]
    [Authorize(Policy = "receipt.view")]
    public IActionResult ImportTemplate()
    {
        var sheet = new ExcelSheet(
            "Receipts template",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("ITS"),
                new ExcelColumn("Fund code"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Mode"),
                new ExcelColumn("Bank account"),
                new ExcelColumn("Cheque #"),
                new ExcelColumn("Cheque date", ExcelColumnType.Date),
                new ExcelColumn("Reference"),
                new ExcelColumn("Purpose"),
                new ExcelColumn("Period"),
                new ExcelColumn("Remarks"),
            },
            new[] { (IReadOnlyList<object?>)new object?[] {
                DateOnly.FromDateTime(DateTime.UtcNow), "40123001", "SABIL", 100m, "AED",
                "Cash", null, null, null, null, "Monthly contribution", "Apr-2026", null,
            }});
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "receipts-import-template.xlsx");
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

    /// <summary>Approve a Draft receipt waiting for sign-off. Allocates number + posts GL +
    /// applies commitment / QH allocations. Returns the now-Confirmed receipt.</summary>
    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "receipt.approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        var r = await svc.ApproveAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    /// <summary>Process a return-to-contributor against a confirmed Returnable receipt. The
    /// caller's permissions decide whether maturity-before-return is permitted (early-return
    /// requires receipt.return.early in addition to receipt.return).</summary>
    [HttpPost("{id:guid}/return-contribution")]
    [Authorize(Policy = "receipt.return")]
    public async Task<IActionResult> ReturnContribution(Guid id, [FromBody] ReturnContributionDto dto, CancellationToken ct)
    {
        var hasOverride = User.HasClaim(c => c.Type == "permission" && c.Value == "receipt.return.early");
        var r = await svc.ReturnContributionAsync(id, dto, hasOverride, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    // --- Agreement document (PDF/image) attached to a returnable receipt --------------------

    /// <summary>Upload the contributor-signed agreement document. PDFs and images are accepted;
    /// max size from config (default 10 MB). Returns the updated receipt with the new URL.</summary>
    [HttpPost("{id:guid}/agreement-document")]
    [Authorize(Policy = "receipt.create")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> UploadAgreementDocument(Guid id, [FromForm] IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return ControllerResults.Problem(this, Error.Validation("agreement.empty", "File is required."));
        if (file.Length > docOptions.Value.MaxBytes)
            return ControllerResults.Problem(this, Error.Validation("agreement.too_large",
                $"Document exceeds the {docOptions.Value.MaxBytes / 1024 / 1024} MB limit."));
        var ct2 = file.ContentType?.ToLowerInvariant() ?? "";
        var allowed = ct2 == "application/pdf" || ct2.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        if (!allowed)
            return ControllerResults.Problem(this, Error.Validation("agreement.invalid_type",
                "Only PDF or image uploads are accepted for agreement documents."));

        await using var stream = file.OpenReadStream();
        var url = await docStorage.StoreAsync(id, stream, file.ContentType!, ct);
        var result = await svc.SetAgreementDocumentUrlAsync(id, url, ct);
        return result.IsSuccess ? Ok(result.Value) : ControllerResults.Problem(this, result.Error);
    }

    /// <summary>Stream the stored agreement document. Returns 404 if none uploaded yet.</summary>
    [HttpGet("{id:guid}/agreement-document")]
    [Authorize(Policy = "receipt.view")]
    public async Task<IActionResult> GetAgreementDocument(Guid id, CancellationToken ct)
    {
        var opened = await docStorage.OpenAsync(id, ct);
        if (opened is null) return NotFound();
        return File(opened.Value.Content, opened.Value.ContentType);
    }

    /// <summary>Remove the stored document and clear the receipt's URL pointer.</summary>
    [HttpDelete("{id:guid}/agreement-document")]
    [Authorize(Policy = "receipt.create")]
    public async Task<IActionResult> DeleteAgreementDocument(Guid id, CancellationToken ct)
    {
        await docStorage.DeleteAsync(id, ct);
        var result = await svc.SetAgreementDocumentUrlAsync(id, null, ct);
        return result.IsSuccess ? Ok(result.Value) : ControllerResults.Problem(this, result.Error);
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
