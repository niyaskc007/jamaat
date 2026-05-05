using System.Security.Claims;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Users;
using Jamaat.Domain.ValueObjects;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Api.Controllers;

/// Member self-service portal API. Every endpoint is scoped to the **current user only** via
/// the JWT subject claim. Even with a stolen JWT, a member can never read or mutate another
/// member's data through this controller.
///
/// Authorization: portal.access (granted to the seeded "Member" role; admins also have it).
[ApiController]
[Authorize(Policy = "portal.access")]
[Route("api/v1/portal/me")]
public sealed class PortalMeController(
    UserManager<ApplicationUser> users,
    JamaatDbContextFacade db,
    ILoginAuditService loginAudit) : ControllerBase
{
    /// Snapshot of the current member - resolved from the ITS number on the ApplicationUser.
    /// Used by the portal home page to render the welcome row + KPI tiles.
    [HttpGet]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var (user, memberId) = await CurrentMemberAsync(ct);
        if (user is null) return Unauthorized();
        return Ok(new
        {
            user.Id,
            user.UserName,
            user.FullName,
            user.Email,
            user.ItsNumber,
            user.PhoneE164,
            MemberId = memberId,
        });
    }

    /// Phase E8 - own login history (most recent first; capped at 100). Filters out other
    /// users' attempts at the service level - the audit table is tenant-scoped via EF query
    /// filters and we add a second `userId` filter inside ListForUserAsync.
    [HttpGet("login-history")]
    public async Task<IActionResult> LoginHistory([FromQuery] int max = 50, CancellationToken ct = default)
    {
        var userId = TryGetUserId(User);
        if (userId is null) return Unauthorized();
        var rows = await loginAudit.ListForUserAsync(userId.Value, max, ct);
        return Ok(rows.Select(r => new LoginAttemptDto(
            r.Id, r.TenantId, r.UserId, r.Identifier, r.AttemptedAtUtc,
            r.Success, r.FailureReason, r.IpAddress, r.UserAgent, r.GeoCountry, r.GeoCity)).ToList());
    }

    /// Phase E3 - own contributions (receipts where the member is the contributor).
    [HttpGet("contributions")]
    public async Task<IActionResult> Contributions(CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return Ok(Array.Empty<object>());
        var rows = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value)
            .OrderByDescending(r => r.ReceiptDate)
            .Take(200)
            .Select(r => new
            {
                r.Id, r.ReceiptNumber, r.ReceiptDate, Amount = r.AmountTotal, r.Currency,
                r.Status, PaymentMethod = r.PaymentMode, Notes = r.Remarks,
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// Phase E4 - own commitments (active + past).
    [HttpGet("commitments")]
    public async Task<IActionResult> Commitments(CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return Ok(Array.Empty<object>());
        var rows = await db.Commitments.AsNoTracking()
            .Where(c => c.MemberId == memberId.Value)
            .OrderByDescending(c => c.StartDate)
            .Take(200)
            .Select(c => new
            {
                c.Id, c.Code, c.FundTypeId, c.FundNameSnapshot, c.TotalAmount, c.PaidAmount, c.Currency, c.Status,
                c.StartDate, c.EndDate, InstallmentCount = c.NumberOfInstallments,
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// Phase E5 - own QH loans.
    [HttpGet("qarzan-hasana")]
    public async Task<IActionResult> QarzanHasana(CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return Ok(Array.Empty<object>());
        var rows = await db.QarzanHasanaLoans.AsNoTracking()
            .Where(l => l.MemberId == memberId.Value)
            .OrderByDescending(l => l.StartDate)
            .Take(50)
            .Select(l => new
            {
                l.Id, l.Code, l.StartDate, l.AmountRequested, l.AmountApproved, l.AmountDisbursed,
                l.AmountRepaid, l.Currency, l.Status, InstallmentCount = l.InstalmentsApproved,
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// Guarantor inbox: QH loans where I'm listed as a guarantor. Each row carries the loan
    /// details (code, borrower, amount, scheme, purpose) so a member can decide right here
    /// without opening a token-protected public link. Accept / decline action endpoints live
    /// just below — they take the consent id (NOT the public token), authenticate via the
    /// portal JWT, and verify ownership before delegating to the existing service.
    [HttpGet("guarantor-inbox")]
    public async Task<IActionResult> GuarantorInbox(CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return Ok(Array.Empty<object>());
        // Join to the loan + borrower so the portal page renders without N follow-up calls.
        var rows = await (
            from g in db.QarzanHasanaGuarantorConsents.AsNoTracking()
            where g.GuarantorMemberId == memberId.Value
            join l in db.QarzanHasanaLoans.AsNoTracking() on g.LoanId equals l.Id
            join m in db.Members.AsNoTracking() on l.MemberId equals m.Id
            orderby g.CreatedAtUtc descending
            select new
            {
                g.Id,
                g.LoanId,
                g.GuarantorMemberId,
                Status = (int)g.Status,
                g.Token,
                RequestedAtUtc = g.CreatedAtUtc,
                g.RespondedAtUtc,
                Loan = new
                {
                    l.Code, l.AmountRequested, l.AmountApproved, l.Currency,
                    l.InstalmentsRequested, l.InstalmentsApproved,
                    l.Scheme, LoanStatus = (int)l.Status,
                    l.Purpose, l.RepaymentPlan, l.SourceOfIncome,
                    l.MonthlyIncome, l.MonthlyExpenses, l.MonthlyExistingEmis,
                    BorrowerItsNumber = m.ItsNumber.Value,
                    BorrowerName = m.FullName,
                    l.StartDate,
                },
            }
        ).ToListAsync(ct);
        return Ok(rows);
    }

    /// Portal-authenticated guarantor decision. Mirrors the public token endpoints in
    /// QarzanHasanaController but identifies the responder via the JWT instead of the token,
    /// and verifies the consent row's GuarantorMemberId matches the signed-in member before
    /// recording the decision. <paramref name="decision"/> = "accept" | "decline".
    [HttpPost("guarantor-inbox/{consentId:guid}/{decision}")]
    public async Task<IActionResult> GuarantorAct(
        Guid consentId, string decision,
        [FromServices] Application.QarzanHasana.IQarzanHasanaService qhSvc,
        CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return Unauthorized();
        var consent = await db.QarzanHasanaGuarantorConsents.AsNoTracking()
            .Where(g => g.Id == consentId && g.GuarantorMemberId == memberId.Value)
            .Select(g => new { g.Token })
            .FirstOrDefaultAsync(ct);
        if (consent is null) return NotFound();

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers.UserAgent.ToString();
        var meta = new Contracts.QarzanHasana.RecordConsentResponseDto(ip, ua);
        var r = decision.ToLowerInvariant() switch
        {
            "accept"  => await qhSvc.AcceptConsentAsync(consent.Token, meta, ct),
            "decline" => await qhSvc.DeclineConsentAsync(consent.Token, meta, ct),
            _         => Domain.Common.Result.Failure<Contracts.QarzanHasana.GuarantorConsentPortalDto>(
                            Domain.Common.Error.Validation("guarantor.bad_decision",
                                "Decision must be 'accept' or 'decline'.")),
        };
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Member-friendly search for a guarantor or family member to attach to a Qarzan Hasana
    /// application. Returns minimal fields (id, ITS, full name) so the portal isn't a vector
    /// for member-directory scraping. Capped at 25 hits; min 2 chars to query.
    [HttpGet("members/search")]
    public async Task<IActionResult> SearchMembers([FromQuery] string q, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return Ok(Array.Empty<object>());
        var s = q.Trim();
        var (_, memberId) = await CurrentMemberAsync(ct);
        var rows = await db.Members.AsNoTracking()
            .Where(m => !m.IsDeleted
                && (m.Id != memberId
                    && (EF.Functions.Like(m.FullName, $"%{s}%")
                        || EF.Functions.Like(m.ItsNumber.Value, $"%{s}%"))))
            .OrderBy(m => m.FullName)
            .Take(25)
            .Select(m => new { m.Id, ItsNumber = m.ItsNumber.Value, FullName = m.FullName })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// Phase E7 - own event registrations.
    [HttpGet("events")]
    public async Task<IActionResult> Events(CancellationToken ct)
    {
        var (_, memberId) = await CurrentMemberAsync(ct);
        if (memberId is null) return Ok(Array.Empty<object>());
        var rows = await db.EventRegistrations.AsNoTracking()
            .Where(r => r.MemberId == memberId.Value)
            .OrderByDescending(r => r.RegisteredAtUtc)
            .Select(r => new
            {
                r.Id, r.EventId, r.RegistrationCode, r.Status,
                r.RegisteredAtUtc, r.ConfirmedAtUtc, r.CheckedInAtUtc,
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// Resolves the signed-in JWT subject to (ApplicationUser, optional MemberId). MemberId is
    /// looked up by ITS-number match - the canonical link until we add a hard FK on Member.UserId.
    private async Task<(ApplicationUser? User, Guid? MemberId)> CurrentMemberAsync(CancellationToken ct)
    {
        var userId = TryGetUserId(User);
        if (userId is null) return (null, null);
        var user = await users.FindByIdAsync(userId.Value.ToString());
        if (user is null) return (null, null);

        Guid? memberId = null;
        if (!string.IsNullOrWhiteSpace(user.ItsNumber)
            && ItsNumber.TryCreate(user.ItsNumber!, out var its))
        {
            memberId = await db.Members.AsNoTracking()
                .Where(m => m.ItsNumber == its && !m.IsDeleted)
                .Select(m => (Guid?)m.Id)
                .FirstOrDefaultAsync(ct);
        }
        return (user, memberId);
    }

    private static Guid? TryGetUserId(ClaimsPrincipal user)
    {
        var sub = user.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? user.FindFirst("sub")?.Value;
        return Guid.TryParse(sub, out var id) ? id : null;
    }
}
