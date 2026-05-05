using System.Security.Claims;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Application.QarzanHasana;
using Jamaat.Contracts.QarzanHasana;
using Jamaat.Domain.Common;
using Jamaat.Domain.ValueObjects;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/qarzan-hasana")]
public sealed class QarzanHasanaController(
    IQarzanHasanaService svc,
    IExcelExporter excel,
    IQarzanHasanaDocumentStorage docStorage,
    IOptions<QarzanHasanaDocumentStorageOptions> docOptions,
    IQhAgreementPdfRenderer agreementPdf,
    UserManager<ApplicationUser> users,
    JamaatDbContextFacade db) : ControllerBase
{
    /// Returns true if the signed-in operator is the same person as the loan's borrower.
    /// Resolved via the canonical ApplicationUser.ItsNumber → Member.ItsNumber link. Used to
    /// enforce SOD: a borrower must never approve / disburse / cancel their own QH application
    /// even if they happen to hold the matching operator permission.
    private async Task<bool> IsBorrowerAsync(Guid memberId, CancellationToken ct)
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(sub, out var userId)) return false;
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null || string.IsNullOrWhiteSpace(user.ItsNumber)) return false;
        if (!ItsNumber.TryCreate(user.ItsNumber!, out var its)) return false;
        return await db.Members.AsNoTracking()
            .AnyAsync(m => m.Id == memberId && m.ItsNumber == its && !m.IsDeleted, ct);
    }
    [HttpGet]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> List([FromQuery] QarzanHasanaListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("export.xlsx")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> Export([FromQuery] QarzanHasanaListQuery q, CancellationToken ct)
    {
        var capped = q with { Page = 1, PageSize = 5000 };
        var page = await svc.ListAsync(capped, ct);
        var sheet = new ExcelSheet(
            "Qarzan Hasana",
            new[]
            {
                new ExcelColumn("Code"),
                new ExcelColumn("ITS"),
                new ExcelColumn("Member"),
                new ExcelColumn("Scheme"),
                new ExcelColumn("Requested", ExcelColumnType.Currency),
                new ExcelColumn("Approved", ExcelColumnType.Currency),
                new ExcelColumn("Disbursed", ExcelColumnType.Currency),
                new ExcelColumn("Repaid", ExcelColumnType.Currency),
                new ExcelColumn("Outstanding", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Start", ExcelColumnType.Date),
                new ExcelColumn("Status"),
                new ExcelColumn("Guarantor 1"),
                new ExcelColumn("Guarantor 2"),
            },
            page.Items.Select(l => (IReadOnlyList<object?>)new object?[]
            {
                l.Code, l.MemberItsNumber, l.MemberName, l.Scheme.ToString(),
                l.AmountRequested, l.AmountApproved, l.AmountDisbursed, l.AmountRepaid, l.AmountOutstanding,
                l.Currency, l.StartDate, l.Status.ToString(),
                l.Guarantor1Name, l.Guarantor2Name,
            }).ToList());
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"qarzan-hasana_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    { var r = await svc.GetAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>
    /// Generate the printable Qarzan Hasana agreement PDF for this loan. Returns the
    /// document with parties, principal, instalment schedule, terms, and signature lines —
    /// the version the borrower + guarantors physically sign at disbursement.
    /// </summary>
    [HttpGet("{id:guid}/agreement.pdf")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> AgreementPdf(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        if (!r.IsSuccess) return ErrorMapper.ToActionResult(this, r.Error);
        var bytes = agreementPdf.Render(r.Value);
        return File(bytes, "application/pdf", $"qh-agreement_{r.Value.Loan.Code}.pdf");
    }

    [HttpPost]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> Create([FromBody] CreateQarzanHasanaDto dto, CancellationToken ct)
    { var r = await svc.CreateDraftAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> UpdateDraft(Guid id, [FromBody] UpdateQarzanHasanaDraftDto dto, CancellationToken ct)
    { var r = await svc.UpdateDraftAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/submit")]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> Submit(Guid id, CancellationToken ct)
    { var r = await svc.SubmitAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/approve-l1")]
    [Authorize(Policy = "qh.approve_l1")]
    public async Task<IActionResult> ApproveL1(Guid id, [FromBody] ApproveL1Dto dto, CancellationToken ct)
    {
        var sodFail = await SodGuard(id, ct);
        if (sodFail is not null) return sodFail;
        var r = await svc.ApproveLevel1Async(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("{id:guid}/approve-l2")]
    [Authorize(Policy = "qh.approve_l2")]
    public async Task<IActionResult> ApproveL2(Guid id, [FromBody] ApproveL2Dto dto, CancellationToken ct)
    {
        var sodFail = await SodGuard(id, ct);
        if (sodFail is not null) return sodFail;
        var r = await svc.ApproveLevel2Async(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = "qh.approve_l1")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectQhDto dto, CancellationToken ct)
    {
        var sodFail = await SodGuard(id, ct);
        if (sodFail is not null) return sodFail;
        var r = await svc.RejectAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "qh.cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelQhDto dto, CancellationToken ct)
    { var r = await svc.CancelAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/disburse")]
    [Authorize(Policy = "qh.disburse")]
    public async Task<IActionResult> Disburse(Guid id, [FromBody] DisburseQhDto dto, CancellationToken ct)
    {
        var sodFail = await SodGuard(id, ct);
        if (sodFail is not null) return sodFail;
        var r = await svc.DisburseAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// SOD short-circuit: load the loan's MemberId and refuse if the actor IS the borrower.
    /// Returns 422 with a stable error code so the SPA can surface a precise message rather
    /// than a generic 500. Returns null when the action is allowed to proceed.
    private async Task<IActionResult?> SodGuard(Guid loanId, CancellationToken ct)
    {
        var memberId = await db.QarzanHasanaLoans.AsNoTracking()
            .Where(l => l.Id == loanId).Select(l => (Guid?)l.MemberId).FirstOrDefaultAsync(ct);
        if (memberId is null) return null; // service will return its own NotFound
        if (await IsBorrowerAsync(memberId.Value, ct))
            return ErrorMapper.ToActionResult(this, Error.Business(
                "qh.sod_borrower_cannot_act",
                "A borrower cannot approve, reject or disburse their own Qarzan Hasana application."));
        return null;
    }

    [HttpPost("{id:guid}/waive-installment")]
    [Authorize(Policy = "qh.waive")]
    public async Task<IActionResult> Waive(Guid id, [FromBody] WaiveQhInstallmentDto dto, CancellationToken ct)
    { var r = await svc.WaiveInstallmentAsync(id, dto, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Decision-support bundle for an L1/L2 approver - reliability + commitments +
    /// donations + past loans + fund position. Gated to qh.view since both L1 and L2 approvers
    /// (and admins) hold it; the panel exposes nothing more sensitive than what those roles
    /// already see on the loan detail page.</summary>
    [HttpGet("{id:guid}/decision-support")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> DecisionSupport(Guid id, CancellationToken ct)
    { var r = await svc.DecisionSupportAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Probe whether a member can act as a guarantor for a new loan. Used by the
    /// new-loan form to give the borrower upfront feedback before submission. Hard failures
    /// block submit; soft warnings allow but surface in yellow.</summary>
    [HttpGet("check-guarantor/{memberId:guid}")]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> CheckGuarantor(Guid memberId,
        [FromQuery] Guid borrowerId,
        [FromQuery] Guid? otherGuarantorId,
        [FromQuery] Guid? excludeLoanId,
        CancellationToken ct)
    {
        var r = await svc.CheckGuarantorEligibilityAsync(memberId, borrowerId, otherGuarantorId, excludeLoanId, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// <summary>List per-guarantor consent records for a loan - tokens, statuses, response
    /// timestamps. Used on the loan detail page so the operator can copy the portal link
    /// to share with each guarantor (SMS / WhatsApp / email).</summary>
    [HttpGet("{id:guid}/guarantor-consents")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> ListGuarantorConsents(Guid id, CancellationToken ct)
    {
        var r = await svc.ListGuarantorConsentsAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    // --- Supporting documents (cashflow + gold-slip) -----------------------------------
    // Two slots per loan, each accepting PDF or image up to the configured limit (default 10 MB).
    // Mirrors the receipts/agreement-document endpoints exactly so frontend uses the same flow.

    [HttpPost("{id:guid}/cashflow-document")]
    [Authorize(Policy = "qh.create")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public Task<IActionResult> UploadCashflow(Guid id, [FromForm] IFormFile file, CancellationToken ct)
        => UploadDocAsync(id, file, QhDocumentKind.Cashflow, "cashflow", ct);

    [HttpGet("{id:guid}/cashflow-document")]
    [Authorize(Policy = "qh.view")]
    public Task<IActionResult> GetCashflow(Guid id, CancellationToken ct)
        => GetDocAsync(id, QhDocumentKind.Cashflow, ct);

    [HttpDelete("{id:guid}/cashflow-document")]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> DeleteCashflow(Guid id, CancellationToken ct)
    {
        await docStorage.DeleteAsync(id, QhDocumentKind.Cashflow, ct);
        var r = await svc.SetCashflowDocumentUrlAsync(id, null, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("{id:guid}/gold-slip-document")]
    [Authorize(Policy = "qh.create")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public Task<IActionResult> UploadGoldSlip(Guid id, [FromForm] IFormFile file, CancellationToken ct)
        => UploadDocAsync(id, file, QhDocumentKind.GoldSlip, "gold slip", ct);

    [HttpGet("{id:guid}/gold-slip-document")]
    [Authorize(Policy = "qh.view")]
    public Task<IActionResult> GetGoldSlip(Guid id, CancellationToken ct)
        => GetDocAsync(id, QhDocumentKind.GoldSlip, ct);

    [HttpDelete("{id:guid}/gold-slip-document")]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> DeleteGoldSlip(Guid id, CancellationToken ct)
    {
        await docStorage.DeleteAsync(id, QhDocumentKind.GoldSlip, ct);
        var r = await svc.SetGoldSlipDocumentUrlAsync(id, null, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    // -- Helpers --------------------------------------------------------------------

    private async Task<IActionResult> UploadDocAsync(Guid id, IFormFile? file, QhDocumentKind kind, string label, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return ErrorMapper.ToActionResult(this, Error.Validation($"qh.{kind.ToString().ToLowerInvariant()}.empty", $"{label} file is required."));
        if (file.Length > docOptions.Value.MaxBytes)
            return ErrorMapper.ToActionResult(this, Error.Validation($"qh.{kind.ToString().ToLowerInvariant()}.too_large",
                $"Document exceeds the {docOptions.Value.MaxBytes / 1024 / 1024} MB limit."));
        var ct2 = file.ContentType?.ToLowerInvariant() ?? "";
        var allowed = ct2 == "application/pdf" || ct2.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        if (!allowed)
            return ErrorMapper.ToActionResult(this, Error.Validation($"qh.{kind.ToString().ToLowerInvariant()}.invalid_type",
                "Only PDF or image uploads are accepted."));

        await using var stream = file.OpenReadStream();
        var url = await docStorage.StoreAsync(id, kind, stream, file.ContentType!, ct);
        var result = kind == QhDocumentKind.Cashflow
            ? await svc.SetCashflowDocumentUrlAsync(id, url, ct)
            : await svc.SetGoldSlipDocumentUrlAsync(id, url, ct);
        return result.IsSuccess ? Ok(result.Value) : ErrorMapper.ToActionResult(this, result.Error);
    }

    private async Task<IActionResult> GetDocAsync(Guid id, QhDocumentKind kind, CancellationToken ct)
    {
        var opened = await docStorage.OpenAsync(id, kind, ct);
        if (opened is null) return NotFound();
        return File(opened.Value.Content, opened.Value.ContentType);
    }
}
