using System.Text.Json;
using Jamaat.Application.Persistence;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Application.Members.Reliability;

/// <summary>
/// Computes member reliability profiles. Read path is lazy-cached: returns the
/// existing snapshot if computed in the last 24h, otherwise recomputes and upserts.
/// Source aggregates (commitments / loans / receipts) call InvalidateAsync after
/// their own writes to mark snapshots stale - the next read picks up the change.
/// </summary>
public sealed class ReliabilityService(
    JamaatDbContextFacade db,
    ITenantContext tenant,
    IClock clock,
    ILogger<ReliabilityService> logger) : IReliabilityService
{
    /// <summary>How long a snapshot is considered fresh. Members rarely accumulate
    /// 24h-worth of meaningful new history; the eager invalidate path catches the
    /// urgent cases.</summary>
    private static readonly TimeSpan FreshnessWindow = TimeSpan.FromHours(24);

    /// <summary>Members with less than this much history get an "Unrated" grade rather
    /// than being unfairly tagged with a low score on too little data.</summary>
    private static readonly TimeSpan MinTenureForGrade = TimeSpan.FromDays(90);

    public async Task<Result<ReliabilityProfileDto>> GetAsync(Guid memberId, CancellationToken ct = default)
    {
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) return Error.NotFound("member.not_found", "Member not found.");

        var snap = await db.MemberBehaviorSnapshots.FirstOrDefaultAsync(s => s.MemberId == memberId, ct);
        var now = clock.UtcNow;

        if (snap is not null && (now - snap.ComputedAtUtc) < FreshnessWindow)
        {
            return ToDto(member.Id, snap);
        }

        return await ComputeAndUpsertAsync(member, snap, ct);
    }

    public async Task<Result<ReliabilityProfileDto>> RecomputeAsync(Guid memberId, CancellationToken ct = default)
    {
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) return Error.NotFound("member.not_found", "Member not found.");

        var snap = await db.MemberBehaviorSnapshots.FirstOrDefaultAsync(s => s.MemberId == memberId, ct);
        return await ComputeAndUpsertAsync(member, snap, ct);
    }

    public async Task InvalidateAsync(Guid memberId, CancellationToken ct = default)
    {
        // Cheapest invalidation: force the snapshot to look older than the freshness window.
        // We don't want to delete the row because the AuditInterceptor's diff is more useful
        // than disappearing rows.
        await db.MemberBehaviorSnapshots
            .Where(s => s.MemberId == memberId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(
                s => s.ComputedAtUtc,
                _ => DateTimeOffset.UnixEpoch), ct);
    }

    public async Task<Result<ReliabilityDistributionDto>> GetDistributionAsync(CancellationToken ct = default)
    {
        var totalMembers = await db.Members.CountAsync(ct);
        var snapshots = await db.MemberBehaviorSnapshots.AsNoTracking()
            .Join(db.Members.AsNoTracking(),
                s => s.MemberId,
                m => m.Id,
                (s, m) => new { Snap = s, Member = m })
            .ToListAsync(ct);

        var byGrade = snapshots
            .GroupBy(x => x.Snap.Grade)
            .ToDictionary(g => g.Key, g => g.Count());

        var rated = snapshots.Count(x => x.Snap.Grade != "Unrated");
        var unrated = snapshots.Count - rated + (totalMembers - snapshots.Count); // members without any snapshot are also Unrated

        var top = snapshots
            .Where(x => x.Snap.Grade != "Unrated")
            .OrderByDescending(x => x.Snap.TotalScore)
            .Take(10)
            .Select(x => new MemberRankDto(
                x.Member.Id, x.Member.ItsNumber.Value, x.Member.FullName,
                x.Snap.Grade, x.Snap.TotalScore, x.Snap.LoanReady))
            .ToList();

        var bottom = snapshots
            .Where(x => x.Snap.Grade == "C" || x.Snap.Grade == "D")
            .OrderBy(x => x.Snap.TotalScore)
            .Take(10)
            .Select(x => new MemberRankDto(
                x.Member.Id, x.Member.ItsNumber.Value, x.Member.FullName,
                x.Snap.Grade, x.Snap.TotalScore, x.Snap.LoanReady))
            .ToList();

        return new ReliabilityDistributionDto(totalMembers, rated, unrated, byGrade, top, bottom);
    }

    // ---------------------------------------------------------------------
    // Compute pipeline
    // ---------------------------------------------------------------------

    private async Task<Result<ReliabilityProfileDto>> ComputeAndUpsertAsync(
        Member member, MemberBehaviorSnapshot? existing, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var today = clock.Today;

        // Tenure check - members with less than 90 days of history get Unrated to avoid
        // labelling someone who hasn't had a chance to demonstrate behavior.
        var tenure = now - member.CreatedAtUtc;
        var unratedDueToTenure = tenure < MinTenureForGrade;

        var dimensions = new List<DimensionDto>();
        var lapses = new List<LapseDto>();

        var commitmentDim = await ComputeCommitmentDimensionAsync(member.Id, today, lapses, ct);
        dimensions.Add(commitmentDim);

        var loanDim = await ComputeLoanDimensionAsync(member.Id, today, lapses, ct);
        dimensions.Add(loanDim);

        var returnableDim = await ComputeReturnableDimensionAsync(member.Id, today, lapses, ct);
        dimensions.Add(returnableDim);

        var donationDim = await ComputeDonationDimensionAsync(member.Id, today, ct);
        dimensions.Add(donationDim);

        // Weighted total over only the included dimensions, renormalized so the user
        // is not penalized for not having (e.g.) loan history.
        var contributing = dimensions.Where(d => !d.Excluded && d.Score.HasValue).ToList();
        decimal? totalScore = null;
        string grade;
        if (unratedDueToTenure || contributing.Count == 0)
        {
            grade = "Unrated";
        }
        else
        {
            var weightSum = contributing.Sum(d => d.Weight);
            var weighted = contributing.Sum(d => d.Score!.Value * d.Weight) / weightSum;
            totalScore = Math.Round(weighted, 2);
            grade = totalScore >= 85m ? "A" : totalScore >= 70m ? "B" : totalScore >= 55m ? "C" : "D";
        }

        var (loanReady, loanReadyReason) = await EvaluateLoanReadinessAsync(member, grade, today, ct);

        var dimensionsJson = JsonSerializer.Serialize(dimensions);
        var lapsesJson = JsonSerializer.Serialize(lapses.OrderByDescending(l => l.OccurredOn).Take(10));

        if (existing is null)
        {
            existing = new MemberBehaviorSnapshot(
                Guid.NewGuid(), tenant.TenantId, member.Id,
                grade, totalScore ?? 0m,
                dimensionsJson, lapsesJson,
                loanReady, loanReadyReason,
                now);
            db.MemberBehaviorSnapshots.Add(existing);
        }
        else
        {
            existing.Replace(grade, totalScore ?? 0m, dimensionsJson, lapsesJson, loanReady, loanReadyReason, now);
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // Don't fail the read path because we couldn't cache. Log and serve the live result.
            logger.LogWarning(ex, "Failed to persist reliability snapshot for member {MemberId}", member.Id);
        }

        return new ReliabilityProfileDto(
            member.Id, grade, totalScore,
            dimensions,
            lapses.OrderByDescending(l => l.OccurredOn).Take(10).ToList(),
            loanReady, loanReadyReason,
            now);
    }

    // -- Dimension computers ----------------------------------------------

    /// <summary>Commitment compliance: of the installments due by today, what fraction
    /// were paid on time? Late-but-paid counts as half. Waived counts as on-time.</summary>
    private async Task<DimensionDto> ComputeCommitmentDimensionAsync(
        Guid memberId, DateOnly today, List<LapseDto> lapses, CancellationToken ct)
    {
        var commitments = await db.Commitments.AsNoTracking()
            .Include(c => c.Installments)
            .Where(c => c.MemberId == memberId)
            .ToListAsync(ct);

        var dueInstallments = commitments
            .SelectMany(c => c.Installments.Select(i => new { c.Code, Inst = i }))
            .Where(x => x.Inst.DueDate <= today)
            .ToList();

        if (dueInstallments.Count == 0)
        {
            return new DimensionDto("commitment", "Commitment compliance", 0.45m,
                Score: null, Excluded: true,
                Raw: "No commitments yet",
                Tip: null);
        }

        decimal credit = 0m;
        int onTime = 0, late = 0, missed = 0;
        foreach (var x in dueInstallments)
        {
            if (x.Inst.Status == InstallmentStatus.Waived)
            {
                credit += 1m;
                onTime++;
                continue;
            }
            if (x.Inst.Status == InstallmentStatus.Paid && x.Inst.LastPaymentDate.HasValue)
            {
                var daysLate = x.Inst.LastPaymentDate.Value.DayNumber - x.Inst.DueDate.DayNumber;
                if (daysLate <= 0) { credit += 1m; onTime++; }
                else if (daysLate <= 14) { credit += 0.85m; onTime++; }
                else { credit += 0.5m; late++; lapses.Add(new LapseDto("commitment", x.Code,
                    $"Installment due {x.Inst.DueDate:dd MMM yyyy} paid {daysLate} days late",
                    x.Inst.LastPaymentDate.Value)); }
            }
            else
            {
                missed++;
                lapses.Add(new LapseDto("commitment", x.Code,
                    $"Installment due {x.Inst.DueDate:dd MMM yyyy} not yet paid",
                    x.Inst.DueDate));
            }
        }

        var score = Math.Round(100m * credit / dueInstallments.Count, 2);
        var raw = $"{onTime} on time, {late} late, {missed} missed - {dueInstallments.Count} installments due";
        var tip = score < 90m
            ? "Pay current commitment installments on or before the due date for 3 consecutive months to lift this dimension."
            : null;
        return new DimensionDto("commitment", "Commitment compliance", 0.45m, score, false, raw, tip);
    }

    /// <summary>Loan repayment: of the loan installments due by today, what fraction
    /// were paid on time? Excluded if the member has no loan history.</summary>
    private async Task<DimensionDto> ComputeLoanDimensionAsync(
        Guid memberId, DateOnly today, List<LapseDto> lapses, CancellationToken ct)
    {
        var loans = await db.QarzanHasanaLoans.AsNoTracking()
            .Include(l => l.Installments)
            .Where(l => l.MemberId == memberId
                && (l.Status == QarzanHasanaStatus.Active
                    || l.Status == QarzanHasanaStatus.Completed
                    || l.Status == QarzanHasanaStatus.Defaulted))
            .ToListAsync(ct);

        var dueInst = loans
            .SelectMany(l => l.Installments.Select(i => new { l.Code, Inst = i }))
            .Where(x => x.Inst.DueDate <= today)
            .ToList();

        if (dueInst.Count == 0)
        {
            return new DimensionDto("loan", "Loan repayment", 0.25m,
                Score: null, Excluded: true,
                Raw: "No loan history",
                Tip: null);
        }

        decimal credit = 0m;
        int onTime = 0, late = 0, missed = 0;
        foreach (var x in dueInst)
        {
            if (x.Inst.Status == QarzanHasanaInstallmentStatus.Waived)
            {
                credit += 1m;
                onTime++;
                continue;
            }
            if (x.Inst.Status == QarzanHasanaInstallmentStatus.Paid && x.Inst.LastPaymentDate.HasValue)
            {
                var daysLate = x.Inst.LastPaymentDate.Value.DayNumber - x.Inst.DueDate.DayNumber;
                if (daysLate <= 0) { credit += 1m; onTime++; }
                else if (daysLate <= 14) { credit += 0.85m; onTime++; }
                else { credit += 0.5m; late++; lapses.Add(new LapseDto("loan", x.Code,
                    $"Loan installment due {x.Inst.DueDate:dd MMM yyyy} paid {daysLate} days late",
                    x.Inst.LastPaymentDate.Value)); }
            }
            else
            {
                missed++;
                lapses.Add(new LapseDto("loan", x.Code,
                    $"Loan installment due {x.Inst.DueDate:dd MMM yyyy} not yet repaid",
                    x.Inst.DueDate));
            }
        }

        var score = Math.Round(100m * credit / dueInst.Count, 2);
        var raw = $"{onTime} on time, {late} late, {missed} missed - {dueInst.Count} loan installments due";
        var tip = score < 90m
            ? "Repay loan installments by their due date - this is the strongest signal an approver looks at."
            : null;
        return new DimensionDto("loan", "Loan repayment", 0.25m, score, false, raw, tip);
    }

    /// <summary>Returnable timeliness: of the matured returnable receipts, what fraction
    /// were fully returned by maturity? Excluded if the member has no matured returnables.</summary>
    private async Task<DimensionDto> ComputeReturnableDimensionAsync(
        Guid memberId, DateOnly today, List<LapseDto> lapses, CancellationToken ct)
    {
        var matured = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId
                && r.Intention == ContributionIntention.Returnable
                && r.Status == ReceiptStatus.Confirmed
                && r.MaturityDate != null
                && r.MaturityDate <= today)
            .Select(r => new { Code = r.ReceiptNumber ?? r.Id.ToString(), r.MaturityDate, r.AmountTotal, r.AmountReturned })
            .ToListAsync(ct);

        if (matured.Count == 0)
        {
            return new DimensionDto("returnable", "Returnable timeliness", 0.15m,
                Score: null, Excluded: true,
                Raw: "No matured returnable receipts",
                Tip: null);
        }

        int returnedFully = 0;
        decimal credit = 0m;
        foreach (var r in matured)
        {
            if (r.AmountReturned >= r.AmountTotal)
            {
                credit += 1m;
                returnedFully++;
            }
            else
            {
                lapses.Add(new LapseDto("returnable", r.Code,
                    $"Returnable matured {r.MaturityDate:dd MMM yyyy} but {r.AmountTotal - r.AmountReturned:N2} still outstanding",
                    r.MaturityDate!.Value));
            }
        }

        var score = Math.Round(100m * credit / matured.Count, 2);
        var raw = $"{returnedFully} of {matured.Count} matured returnables fully returned";
        var tip = score < 100m
            ? "Settle outstanding returnable balances at maturity to strengthen this dimension."
            : null;
        return new DimensionDto("returnable", "Returnable timeliness", 0.15m, score, false, raw, tip);
    }

    /// <summary>Donation cadence: in the last 12 months, in how many months did the
    /// member confirm at least one receipt? Capped at 1.0 (12/12).</summary>
    private async Task<DimensionDto> ComputeDonationDimensionAsync(
        Guid memberId, DateOnly today, CancellationToken ct)
    {
        var twelveMonthsAgo = today.AddMonths(-12);
        var receiptDates = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId
                && r.Status == ReceiptStatus.Confirmed
                && r.ReceiptDate >= twelveMonthsAgo)
            .Select(r => r.ReceiptDate)
            .ToListAsync(ct);

        // We always include this dimension even at zero - paying nothing is itself a signal
        // about engagement, unlike loans (which require having taken one out).
        var distinctMonths = receiptDates
            .Select(d => new { d.Year, d.Month })
            .Distinct()
            .Count();

        var ratio = Math.Min(1m, distinctMonths / 12m);
        var score = Math.Round(100m * ratio, 2);
        var raw = $"Receipts in {distinctMonths} of the last 12 months";
        var tip = score < 80m
            ? "Even small monthly contributions help establish a regular cadence."
            : null;
        return new DimensionDto("donation", "Donation cadence", 0.15m, score, false, raw, tip);
    }

    // -- Loan readiness ----------------------------------------------------

    private async Task<(bool Ready, string? Reason)> EvaluateLoanReadinessAsync(
        Member member, string grade, DateOnly today, CancellationToken ct)
    {
        // Tenure
        var tenureDays = (today.DayNumber - DateOnly.FromDateTime(member.CreatedAtUtc.UtcDateTime).DayNumber);
        if (tenureDays < 180)
            return (false, "Less than 6 months as a member - tenure too short to assess.");

        // Active overdue commitment installments older than 30 days
        var thresholdDate = today.AddDays(-30);
        var hasStaleOverdue = await db.Commitments.AsNoTracking()
            .Include(c => c.Installments)
            .Where(c => c.MemberId == member.Id)
            .SelectMany(c => c.Installments)
            .AnyAsync(i =>
                i.DueDate <= thresholdDate
                && (i.Status == InstallmentStatus.Pending
                    || i.Status == InstallmentStatus.PartiallyPaid
                    || i.Status == InstallmentStatus.Overdue),
                ct);
        if (hasStaleOverdue)
            return (false, "Has commitment installments more than 30 days overdue.");

        // Defaulted QH in last 24 months
        var twoYearsAgo = today.AddMonths(-24);
        var hadDefault = await db.QarzanHasanaLoans.AsNoTracking()
            .AnyAsync(l => l.MemberId == member.Id
                && l.Status == QarzanHasanaStatus.Defaulted
                && l.DisbursedOn != null && l.DisbursedOn >= twoYearsAgo, ct);
        if (hadDefault)
            return (false, "Has a defaulted Qarzan Hasana loan in the last 24 months.");

        if (grade == "Unrated")
            return (false, "Insufficient history to make a recommendation.");
        if (grade == "C" || grade == "D")
            return (false, $"Reliability grade {grade} - approver should review carefully before disbursing.");

        return (true, null);
    }

    // -- Mapping -----------------------------------------------------------

    private static ReliabilityProfileDto ToDto(Guid memberId, MemberBehaviorSnapshot snap)
    {
        var dimensions = JsonSerializer.Deserialize<List<DimensionDto>>(snap.DimensionsJson)
            ?? new List<DimensionDto>();
        var lapses = JsonSerializer.Deserialize<List<LapseDto>>(snap.LapsesJson)
            ?? new List<LapseDto>();
        decimal? total = snap.Grade == "Unrated" ? null : snap.TotalScore;
        return new ReliabilityProfileDto(memberId, snap.Grade, total,
            dimensions, lapses, snap.LoanReady, snap.LoanReadyReason, snap.ComputedAtUtc);
    }
}
