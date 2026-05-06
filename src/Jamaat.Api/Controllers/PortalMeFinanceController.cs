using System.Globalization;
using System.Security.Claims;
using Jamaat.Application.Commitments;
using Jamaat.Application.FundEnrollments;
using Jamaat.Application.Persistence;
using Jamaat.Application.QarzanHasana;
using Jamaat.Application.Receipts;
using Jamaat.Contracts.Commitments;
using Jamaat.Contracts.FundEnrollments;
using Jamaat.Contracts.QarzanHasana;
using Jamaat.Domain.Enums;
using Jamaat.Domain.ValueObjects;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Api.Controllers;

/// Portal "finance" controller - extends the basic list endpoints in <see cref="PortalMeController"/>
/// with detail views, downloads, member-scoped fund enrollments (patronages), member self-submit
/// for Qarzan Hasana, and a real KPI dashboard. Every endpoint resolves the current member from
/// the JWT and double-checks ownership before returning service-layer data, so even with a stolen
/// JWT a member can never read another member's records through this controller.
[ApiController]
[Authorize(Policy = "portal.access")]
[Route("api/v1/portal/me")]
public sealed class PortalMeFinanceController(
    UserManager<ApplicationUser> users,
    JamaatDbContextFacade db,
    IReceiptService receiptSvc,
    ICommitmentService commitmentSvc,
    IQarzanHasanaService qhSvc,
    IFundEnrollmentService fundEnrollmentSvc) : ControllerBase
{
    // ----- Receipts -----------------------------------------------------------

    /// Receipt detail for the current member. Wraps <see cref="IReceiptService.GetAsync"/>
    /// after asserting the receipt belongs to me; otherwise 404.
    [HttpGet("contributions/{id:guid}")]
    public async Task<IActionResult> ContributionDetail(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.Receipts.AsNoTracking()
            .AnyAsync(r => r.Id == id && r.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        var r = await receiptSvc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Streams the receipt PDF (a "duplicate copy" - reprint=true, so the rendered PDF carries
    /// the standard reprint banner and we log it via the same path operators use).
    [HttpGet("contributions/{id:guid}/pdf")]
    public async Task<IActionResult> ContributionPdf(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.Receipts.AsNoTracking()
            .AnyAsync(r => r.Id == id && r.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        var r = await receiptSvc.RenderPdfAsync(id, reprint: true, ct);
        if (!r.IsSuccess) return ErrorMapper.ToActionResult(this, r.Error);
        return File(r.Value, "application/pdf", $"receipt-{id}.pdf");
    }

    // ----- Fund-types lookup (portal-accessible) -----------------------------

    /// Slim fund-type picker for the portal commitment + patronage forms. Members don't have
    /// admin.masterdata so the operator FundTypesController is off-limits. <c>category</c> filter:
    /// "donation" → non-loan funds (commitment / patronage submission); "loan" → loan funds.
    [HttpGet("fund-types")]
    public async Task<IActionResult> FundTypeLookup([FromQuery] string? category, CancellationToken ct)
    {
        IQueryable<Domain.Entities.FundType> q = db.FundTypes.AsNoTracking().Where(f => f.IsActive);
        if (string.Equals(category, "loan", StringComparison.OrdinalIgnoreCase))
            q = q.Where(f => f.Category == FundCategory.Loan);
        else
            q = q.Where(f => f.Category != FundCategory.Loan);
        var rows = await q
            .OrderBy(f => f.NameEnglish)
            .Select(f => new { f.Id, f.Code, Name = f.NameEnglish, Category = (int)f.Category, f.AllowedPaymentModes })
            .ToListAsync(ct);
        return Ok(rows);
    }

    // ----- Commitments --------------------------------------------------------

    /// Self-submit a Draft commitment from the member portal. Forces <c>PartyType=Member</c>
    /// and <c>MemberId</c>=current so a stolen JWT can never pledge on someone else's behalf.
    /// The commitment lands in Draft status; an admin (or a future portal "accept agreement"
    /// step) moves it to Active.
    [HttpPost("commitments")]
    [Authorize(Policy = "portal.commitments.create.own")]
    public async Task<IActionResult> CommitmentCreate([FromBody] PortalCreateCommitmentDto dto, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return BadRequest(new { error = "no_member_link", detail = "Sign-in is not linked to a member record." });
        var safe = new CreateCommitmentDto(
            PartyType: CommitmentPartyType.Member,
            MemberId: memberId.Value,
            FamilyId: null,
            FundTypeId: dto.FundTypeId,
            Currency: dto.Currency,
            TotalAmount: dto.TotalAmount,
            Frequency: dto.Frequency,
            NumberOfInstallments: dto.NumberOfInstallments,
            StartDate: dto.StartDate,
            AllowPartialPayments: true,
            AllowAutoAdvance: true,
            Notes: dto.Notes,
            Intention: ContributionIntention.Permanent);
        var r = await commitmentSvc.CreateDraftAsync(safe, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpGet("commitments/{id:guid}")]
    public async Task<IActionResult> CommitmentDetail(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.Commitments.AsNoTracking()
            .AnyAsync(c => c.Id == id && c.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        var r = await commitmentSvc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Receipts that contributed to this commitment - one row per receipt-line tied to it.
    /// Same shape the operator's payments panel uses; ownership verified before delegating.
    [HttpGet("commitments/{id:guid}/payments")]
    public async Task<IActionResult> CommitmentPayments(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.Commitments.AsNoTracking()
            .AnyAsync(c => c.Id == id && c.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        var r = await commitmentSvc.ListPaymentsAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Render the agreement text for a Draft commitment WITHOUT accepting it. The portal
    /// shows this text in a modal so the member can read what they're agreeing to before
    /// they click Accept. Same template-resolution path as <see cref="CommitmentAcceptAgreement"/>.
    [HttpGet("commitments/{id:guid}/agreement-preview")]
    public async Task<IActionResult> CommitmentAgreementPreview(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var c = await db.Commitments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null || c.MemberId != memberId.Value) return NotFound();

        var rendered = await RenderAgreementForCommitmentAsync(c, ct);
        return Ok(new
        {
            templateId = rendered.TemplateId,
            templateVersion = rendered.TemplateVersion,
            templateName = rendered.TemplateName,
            renderedText = rendered.Text,
            isAlreadyAccepted = c.Status != Domain.Enums.CommitmentStatus.Draft,
        });
    }

    /// Member-self acceptance of a Draft commitment's agreement, moving it Draft → Active.
    /// Mirrors the operator flow but resolves the agreement template server-side (members don't
    /// have access to template master-data) and stamps method=Self instead of Admin so the audit
    /// trail records who actually accepted.
    [HttpPost("commitments/{id:guid}/accept-agreement")]
    [Authorize(Policy = "portal.commitments.create.own")]
    public async Task<IActionResult> CommitmentAcceptAgreement(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var c = await db.Commitments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null || c.MemberId != memberId.Value) return NotFound();

        var rendered = await RenderAgreementForCommitmentAsync(c, ct);
        var dto = new AcceptAgreementDto(rendered.TemplateId, rendered.Text, AcceptedByAdmin: false);
        var r = await commitmentSvc.AcceptAgreementAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Resolves the active agreement template + builds the values dictionary the operator
    /// path uses (party_name / fund_name / total_amount / installment_amount / start_date /
    /// jamaat_name / etc.) and runs them through the shared <see cref="AgreementRenderer"/>.
    /// Falls back to a self-composed sentence only when no template is seeded - members must
    /// never be blocked from accepting just because master-data is missing.
    private async Task<(Guid? TemplateId, int? TemplateVersion, string? TemplateName, string Text)>
        RenderAgreementForCommitmentAsync(Domain.Entities.Commitment c, CancellationToken ct)
    {
        var tpl = await db.CommitmentAgreementTemplates.AsNoTracking()
            .Where(t => t.IsActive)
            .OrderByDescending(t => t.Version)
            .FirstOrDefaultAsync(ct);

        var fund = await db.FundTypes.AsNoTracking()
            .Where(f => f.Id == c.FundTypeId)
            .Select(f => new { f.Code, f.NameEnglish })
            .FirstOrDefaultAsync(ct);

        var jamaatName = await db.Tenants.AsNoTracking()
            .Where(t => t.Id == c.TenantId)
            .Select(t => t.JamiaatName ?? t.Name)
            .FirstOrDefaultAsync(ct) ?? "Jamaat";

        var installmentAmount = c.NumberOfInstallments > 0
            ? c.TotalAmount / c.NumberOfInstallments
            : c.TotalAmount;

        var values = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["party_name"]         = c.PartyNameSnapshot ?? "",
            ["party_type"]         = c.PartyType == CommitmentPartyType.Member ? "Member" : "Family",
            ["fund_name"]          = fund?.NameEnglish ?? c.FundNameSnapshot ?? "",
            ["fund_code"]          = fund?.Code ?? "",
            ["total_amount"]       = c.TotalAmount.ToString("N2", CultureInfo.InvariantCulture),
            ["currency"]           = c.Currency ?? "",
            ["installments"]       = c.NumberOfInstallments.ToString(CultureInfo.InvariantCulture),
            ["frequency"]          = FrequencyLabel(c.Frequency),
            ["installment_amount"] = installmentAmount.ToString("N2", CultureInfo.InvariantCulture),
            ["start_date"]         = c.StartDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture),
            ["end_date"]           = c.EndDate?.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) ?? "—",
            ["today"]              = DateTime.UtcNow.ToString("dd MMM yyyy", CultureInfo.InvariantCulture),
            ["jamaat_name"]        = jamaatName,
        };

        var text = tpl is null
            ? $"I, **{values["party_name"]}**, accept commitment {c.Code} for **{values["fund_name"]}** totalling {values["total_amount"]} {values["currency"]} over {values["installments"]} {values["frequency"]} installments starting {values["start_date"]}."
            : AgreementRenderer.Render(tpl.BodyMarkdown, values);
        return (tpl?.Id, tpl?.Version, tpl?.Name, text);
    }

    private static string FrequencyLabel(CommitmentFrequency f) => f switch
    {
        CommitmentFrequency.OneTime    => "one-time",
        CommitmentFrequency.Weekly     => "weekly",
        CommitmentFrequency.BiWeekly   => "bi-weekly",
        CommitmentFrequency.Monthly    => "monthly",
        CommitmentFrequency.Quarterly  => "quarterly",
        CommitmentFrequency.HalfYearly => "half-yearly",
        CommitmentFrequency.Yearly     => "yearly",
        _                              => "custom",
    };

    // ----- Qarzan Hasana ------------------------------------------------------

    [HttpGet("qarzan-hasana/{id:guid}")]
    public async Task<IActionResult> QhDetail(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.QarzanHasanaLoans.AsNoTracking()
            .AnyAsync(l => l.Id == id && l.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        var r = await qhSvc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Per-guarantor consent rows for the borrower's loan: who, ITS, status, decided-at.
    /// Lets the borrower see "Kafil 1: pending; Kafil 2: endorsed at ..." on the QH detail page.
    [HttpGet("qarzan-hasana/{id:guid}/guarantor-consents")]
    public async Task<IActionResult> QhGuarantorConsents(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.QarzanHasanaLoans.AsNoTracking()
            .AnyAsync(l => l.Id == id && l.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        var r = await qhSvc.ListGuarantorConsentsAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Receipts that contributed to this loan's repayments - one row per receipt-line tied
    /// to the loan, mirroring the commitment-payments shape so the portal can re-use the same
    /// table component.
    [HttpGet("qarzan-hasana/{id:guid}/payments")]
    public async Task<IActionResult> QhPayments(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.QarzanHasanaLoans.AsNoTracking()
            .AnyAsync(l => l.Id == id && l.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        // No dedicated service method - assemble from receipts where any line points at this loan.
        var rows = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value
                && r.Lines.Any(l => l.QarzanHasanaLoanId == id))
            .OrderByDescending(r => r.ReceiptDate)
            .Select(r => new
            {
                r.Id, r.ReceiptNumber, r.ReceiptDate,
                Status = (int)r.Status,
                Amount = r.Lines.Where(l => l.QarzanHasanaLoanId == id).Sum(l => l.Amount),
                r.Currency,
                PaymentMode = (int)r.PaymentMode,
                r.ChequeNumber, r.ChequeDate, r.PaymentReference, r.Remarks,
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// Self-submit a Qarzan Hasana application from the member portal. The body is the same
    /// CreateQarzanHasanaDto that operators post, BUT we override <c>MemberId</c> to the current
    /// signed-in member so a member can never apply on behalf of someone else.
    [HttpPost("qarzan-hasana")]
    [Authorize(Policy = "portal.qh.request")]
    public async Task<IActionResult> QhCreate([FromBody] CreateQarzanHasanaDto dto, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return BadRequest(new { error = "no_member_link", detail = "Sign-in is not linked to a member record." });

        // Force the borrower to be the current member regardless of what the client sent.
        var safe = dto with { MemberId = memberId.Value };
        var r = await qhSvc.CreateDraftAsync(safe, ct);
        if (!r.IsSuccess) return ErrorMapper.ToActionResult(this, r.Error);

        // Auto-submit so the application immediately enters L1 review (operators do this in
        // two clicks; a member shouldn't have to come back to a separate page to confirm).
        var submit = await qhSvc.SubmitAsync(r.Value.Id, ct);
        return submit.IsSuccess ? Ok(submit.Value) : ErrorMapper.ToActionResult(this, submit.Error);
    }

    // ----- Fund enrollments (patronages) -------------------------------------

    /// List the current member's fund enrollments / patronages (active + history).
    [HttpGet("fund-enrollments")]
    public async Task<IActionResult> FundEnrollments(CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return Ok(Array.Empty<object>());
        // FundEnrollment doesn't snapshot the fund-type name so we join the FundTypes table
        // for display - cheap because the set is small (one row per fund type).
        var rows = await db.FundEnrollments.AsNoTracking()
            .Where(e => e.MemberId == memberId.Value)
            .OrderByDescending(e => e.StartDate)
            .Join(db.FundTypes.AsNoTracking(), e => e.FundTypeId, ft => ft.Id, (e, ft) => new
            {
                e.Id, e.Code, e.FundTypeId, FundTypeName = ft.NameEnglish, FundTypeCode = ft.Code,
                e.SubType, e.Recurrence, e.StartDate, e.EndDate, e.Status, e.Notes,
                e.CreatedAtUtc,
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// Self-submit a fund enrollment / patronage request. Forces <c>MemberId</c> to the current
    /// member; an admin approves the resulting Draft via the existing approval workflow.
    [HttpPost("fund-enrollments")]
    [Authorize(Policy = "portal.fund_enrollments.request")]
    public async Task<IActionResult> FundEnrollmentCreate([FromBody] PortalCreateFundEnrollmentDto dto, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return BadRequest(new { error = "no_member_link", detail = "Sign-in is not linked to a member record." });
        var safe = new CreateFundEnrollmentDto(
            MemberId: memberId.Value,
            FundTypeId: dto.FundTypeId,
            SubType: dto.SubType,
            Recurrence: dto.Recurrence,
            StartDate: dto.StartDate,
            EndDate: dto.EndDate,
            FamilyId: null,
            Notes: dto.Notes);
        var r = await fundEnrollmentSvc.CreateAsync(safe, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpGet("fund-enrollments/{id:guid}")]
    public async Task<IActionResult> FundEnrollmentDetail(Guid id, CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return NotFound();
        var owns = await db.FundEnrollments.AsNoTracking()
            .AnyAsync(e => e.Id == id && e.MemberId == memberId.Value, ct);
        if (!owns) return NotFound();
        var detail = await fundEnrollmentSvc.GetAsync(id, ct);
        if (!detail.IsSuccess) return ErrorMapper.ToActionResult(this, detail.Error);
        var receipts = await fundEnrollmentSvc.ListReceiptsAsync(id, ct);
        return Ok(new { Enrollment = detail.Value, Receipts = receipts.IsSuccess ? receipts.Value : Array.Empty<PatronageReceiptDto>() });
    }

    // ----- Dashboard ----------------------------------------------------------

    /// One-shot KPI bundle for the member home screen. Cheap aggregate queries; computed
    /// on demand because materializing a per-member rollup table for ~all the moving pieces
    /// (receipts/commitments/QH/guarantor inbox/upcoming installments) would be premature.
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null)
        {
            return Ok(new MemberDashboardDto(
                YtdContributions: 0, YtdReceiptCount: 0, Currency: "INR",
                ActiveCommitments: 0, CommitmentOutstanding: 0,
                ActiveQhLoans: 0, QhOutstanding: 0,
                PendingGuarantorRequests: 0, PendingChangeRequests: 0,
                UpcomingEventCount: 0,
                MonthDelta: null,
                ThisMonthContributions: 0,
                NextInstallment: null,
                RecentContributions: Array.Empty<DashboardContributionDto>(),
                ActiveCommitmentsList: Array.Empty<DashboardCommitmentDto>(),
                CollectionTrend: Array.Empty<DashboardTrendPointDto>(),
                FundShare: Array.Empty<DashboardFundShareDto>()));
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var startOfYear = new DateOnly(today.Year, 1, 1);

        // YTD confirmed contributions (include returnable too - they still represent member activity).
        var ytdAgg = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value
                && r.Status == ReceiptStatus.Confirmed
                && r.ReceiptDate >= startOfYear)
            .GroupBy(r => 1)
            .Select(g => new { Total = g.Sum(x => x.AmountTotal), Count = g.Count() })
            .FirstOrDefaultAsync(ct);

        var primaryCurrency = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value && r.Status == ReceiptStatus.Confirmed)
            .OrderByDescending(r => r.ReceiptDate)
            .Select(r => r.Currency)
            .FirstOrDefaultAsync(ct) ?? "INR";

        var commitmentRows = await db.Commitments.AsNoTracking()
            .Where(c => c.MemberId == memberId.Value && c.Status == CommitmentStatus.Active)
            .Select(c => new { c.Id, c.Code, c.FundNameSnapshot, c.TotalAmount, c.PaidAmount, c.Currency })
            .ToListAsync(ct);

        var qhRows = await db.QarzanHasanaLoans.AsNoTracking()
            .Where(l => l.MemberId == memberId.Value
                && (l.Status == QarzanHasanaStatus.Disbursed || l.Status == QarzanHasanaStatus.Active))
            .Select(l => new { l.AmountDisbursed, l.AmountRepaid })
            .ToListAsync(ct);

        var pendingGuarantor = await db.QarzanHasanaGuarantorConsents.AsNoTracking()
            .Where(g => g.GuarantorMemberId == memberId.Value && g.Status == QhGuarantorConsentStatus.Pending)
            .CountAsync(ct);

        var pendingChange = await db.MemberChangeRequests.AsNoTracking()
            .Where(c => c.MemberId == memberId.Value && c.Status == MemberChangeRequestStatus.Pending)
            .CountAsync(ct);

        var upcomingEvents = await db.EventRegistrations.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value
                && (r.Status == RegistrationStatus.Confirmed || r.Status == RegistrationStatus.Pending))
            .CountAsync(ct);

        // Next due installment across all active commitments. EF can't easily project owned types
        // through a join, so pull the active commitment IDs first and then look at their installments.
        var activeCommitmentIds = commitmentRows.Select(c => c.Id).ToList();
        DashboardInstallmentDto? next = null;
        if (activeCommitmentIds.Count > 0)
        {
            var loaded = await db.Commitments.AsNoTracking()
                .Where(c => activeCommitmentIds.Contains(c.Id))
                .Select(c => new
                {
                    c.Id, c.Code, c.FundNameSnapshot, c.Currency,
                    Pending = c.Installments
                        .Where(i => i.PaidAmount < i.ScheduledAmount && i.Status != InstallmentStatus.Waived)
                        .OrderBy(i => i.DueDate)
                        .Select(i => new { i.InstallmentNo, i.DueDate, i.ScheduledAmount, i.PaidAmount })
                        .FirstOrDefault(),
                })
                .ToListAsync(ct);
            var earliest = loaded
                .Where(x => x.Pending != null)
                .OrderBy(x => x.Pending!.DueDate)
                .FirstOrDefault();
            if (earliest != null)
            {
                next = new DashboardInstallmentDto(
                    earliest.Id, earliest.Code, earliest.FundNameSnapshot,
                    earliest.Pending!.InstallmentNo, earliest.Pending.DueDate,
                    earliest.Pending.ScheduledAmount - earliest.Pending.PaidAmount, earliest.Currency);
            }
        }

        var recent = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value && r.Status == ReceiptStatus.Confirmed)
            .OrderByDescending(r => r.ReceiptDate)
            .Take(5)
            .Select(r => new DashboardContributionDto(
                r.Id, r.ReceiptNumber, r.ReceiptDate, r.AmountTotal, r.Currency))
            .ToListAsync(ct);

        var activeCommitmentDtos = commitmentRows
            .OrderBy(c => c.TotalAmount - c.PaidAmount > 0 ? 0 : 1)
            .Take(5)
            .Select(c => new DashboardCommitmentDto(
                c.Id, c.Code, c.FundNameSnapshot,
                c.TotalAmount, c.PaidAmount, c.TotalAmount - c.PaidAmount, c.Currency))
            .ToList();

        // 12-month contribution trend, grouped by year-month so the line chart on the home
        // page shows seasonality. We pull confirmed receipts in the window and aggregate in
        // memory (small set per member) instead of relying on EF for date-trunc behaviour.
        var trendStart = today.AddMonths(-11);
        trendStart = new DateOnly(trendStart.Year, trendStart.Month, 1);
        var trendRows = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value
                && r.Status == ReceiptStatus.Confirmed
                && r.ReceiptDate >= trendStart)
            .Select(r => new { r.ReceiptDate, r.AmountTotal })
            .ToListAsync(ct);
        var trend = new List<DashboardTrendPointDto>(12);
        for (var m = 0; m < 12; m++)
        {
            var anchor = trendStart.AddMonths(m);
            var bucket = new DateOnly(anchor.Year, anchor.Month, 1);
            var sum = trendRows
                .Where(r => r.ReceiptDate.Year == bucket.Year && r.ReceiptDate.Month == bucket.Month)
                .Sum(r => r.AmountTotal);
            trend.Add(new DashboardTrendPointDto(bucket, sum));
        }

        // This month vs last month - a simple delta indicator for the YTD KPI tile.
        var thisMonth = trend[^1].Amount;
        var lastMonth = trend.Count >= 2 ? trend[^2].Amount : 0m;
        decimal? monthDelta = lastMonth > 0
            ? Math.Round(((thisMonth - lastMonth) / lastMonth) * 100m, 1)
            : (thisMonth > 0 ? 100m : (decimal?)null);

        // Fund share for the last 12 months - donut chart on the home page.
        var fundSharePairs = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value
                && r.Status == ReceiptStatus.Confirmed
                && r.ReceiptDate >= trendStart)
            .SelectMany(r => r.Lines, (r, l) => new { l.FundTypeId, l.Amount })
            .GroupBy(x => x.FundTypeId)
            .Select(g => new { FundTypeId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        var fundIds = fundSharePairs.Select(x => x.FundTypeId).ToList();
        var fundNameById = fundIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.FundTypes.AsNoTracking()
                .Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => f.NameEnglish, ct);
        var fundShare = fundSharePairs
            .Select(x => new DashboardFundShareDto(x.FundTypeId, fundNameById.GetValueOrDefault(x.FundTypeId, "Other"), x.Amount))
            .OrderByDescending(x => x.Amount)
            .Take(8)
            .ToList();

        var dto = new MemberDashboardDto(
            YtdContributions: ytdAgg?.Total ?? 0m,
            YtdReceiptCount: ytdAgg?.Count ?? 0,
            Currency: primaryCurrency,
            ActiveCommitments: commitmentRows.Count,
            CommitmentOutstanding: commitmentRows.Sum(c => c.TotalAmount - c.PaidAmount),
            ActiveQhLoans: qhRows.Count,
            QhOutstanding: qhRows.Sum(q => q.AmountDisbursed - q.AmountRepaid),
            PendingGuarantorRequests: pendingGuarantor,
            PendingChangeRequests: pendingChange,
            UpcomingEventCount: upcomingEvents,
            MonthDelta: monthDelta,
            ThisMonthContributions: thisMonth,
            NextInstallment: next,
            RecentContributions: recent,
            ActiveCommitmentsList: activeCommitmentDtos,
            CollectionTrend: trend,
            FundShare: fundShare);
        return Ok(dto);
    }

    // ---- helpers -----------------------------------------------------------

    private async Task<(ApplicationUser? User, Guid? MemberId)> CurrentMemberAsync(CancellationToken ct)
    {
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(sub, out var userId)) return (null, null);
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null) return (null, null);
        Guid? memberId = null;
        if (!string.IsNullOrWhiteSpace(user.ItsNumber) && ItsNumber.TryCreate(user.ItsNumber!, out var its))
        {
            memberId = await db.Members.AsNoTracking()
                .Where(m => m.ItsNumber == its && !m.IsDeleted)
                .Select(m => (Guid?)m.Id)
                .FirstOrDefaultAsync(ct);
        }
        return (user, memberId);
    }
}

// Dashboard payload. Lives next to the controller because it is bespoke to /portal/me/dashboard.
public sealed record MemberDashboardDto(
    decimal YtdContributions,
    int YtdReceiptCount,
    string Currency,
    int ActiveCommitments,
    decimal CommitmentOutstanding,
    int ActiveQhLoans,
    decimal QhOutstanding,
    int PendingGuarantorRequests,
    int PendingChangeRequests,
    int UpcomingEventCount,
    decimal? MonthDelta,
    decimal ThisMonthContributions,
    DashboardInstallmentDto? NextInstallment,
    IReadOnlyList<DashboardContributionDto> RecentContributions,
    IReadOnlyList<DashboardCommitmentDto> ActiveCommitmentsList,
    IReadOnlyList<DashboardTrendPointDto> CollectionTrend,
    IReadOnlyList<DashboardFundShareDto> FundShare);

public sealed record DashboardTrendPointDto(DateOnly Month, decimal Amount);
public sealed record DashboardFundShareDto(Guid FundTypeId, string Name, decimal Amount);

public sealed record DashboardInstallmentDto(
    Guid CommitmentId, string CommitmentCode, string FundName,
    int InstallmentNo, DateOnly DueDate, decimal AmountDue, string Currency);

public sealed record DashboardContributionDto(
    Guid Id, string? ReceiptNumber, DateOnly ReceiptDate, decimal Amount, string Currency);

public sealed record DashboardCommitmentDto(
    Guid Id, string Code, string FundName,
    decimal TotalAmount, decimal PaidAmount, decimal RemainingAmount, string Currency);

/// Portal-self commitment submit body. PartyType + MemberId are forced server-side; the
/// portal client only has to choose the fund + amount + schedule.
public sealed record PortalCreateCommitmentDto(
    Guid FundTypeId,
    string Currency,
    decimal TotalAmount,
    CommitmentFrequency Frequency,
    int NumberOfInstallments,
    DateOnly StartDate,
    string? Notes);

/// Portal-self fund-enrollment / patronage request body.
public sealed record PortalCreateFundEnrollmentDto(
    Guid FundTypeId,
    string? SubType,
    FundEnrollmentRecurrence Recurrence,
    DateOnly StartDate,
    DateOnly? EndDate,
    string? Notes);
