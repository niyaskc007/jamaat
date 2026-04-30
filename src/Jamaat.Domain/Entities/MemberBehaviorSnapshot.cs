using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Cached "Reliability Profile" snapshot for a single member. Computed from journal data
/// (commitments, loans, returnables, donations) and refreshed lazily when stale or
/// invalidated by a write to one of the source aggregates.
/// </summary>
/// <remarks>
/// Why a denormalized snapshot rather than computing on each read:
///   - Every read hits 5+ tables across 3+ aggregates; for a single profile that's fine,
///     but the admin reliability dashboard scans all members and the QH approval panel
///     fetches it under approver attention - latency matters there.
///   - Audit/explainability: snapshotting freezes the *reasons* (DimensionsJson, LapsesJson)
///     at compute time. The admin can later see "this score was based on the following
///     facts at the time" rather than re-reading current data that may have shifted.
///
/// Score model is advisory only - approvers and admins make final decisions. This class
/// stores the score, not the policy that uses it.
/// </remarks>
public sealed class MemberBehaviorSnapshot : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private MemberBehaviorSnapshot() { }

    public MemberBehaviorSnapshot(
        Guid id, Guid tenantId, Guid memberId,
        string grade, decimal totalScore,
        string dimensionsJson, string lapsesJson,
        bool loanReady, string? loanReadyReason,
        DateTimeOffset computedAtUtc)
    {
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));
        if (string.IsNullOrWhiteSpace(grade)) throw new ArgumentException("Grade required.", nameof(grade));

        Id = id;
        TenantId = tenantId;
        MemberId = memberId;
        Grade = grade;
        TotalScore = totalScore;
        DimensionsJson = dimensionsJson;
        LapsesJson = lapsesJson;
        LoanReady = loanReady;
        LoanReadyReason = loanReadyReason;
        ComputedAtUtc = computedAtUtc;
    }

    public Guid TenantId { get; private set; }
    public Guid MemberId { get; private set; }

    /// <summary>One of A, B, C, D, or "Unrated" (insufficient history).</summary>
    public string Grade { get; private set; } = default!;

    /// <summary>Weighted total 0-100. NULL semantically when Grade=="Unrated".</summary>
    public decimal TotalScore { get; private set; }

    /// <summary>Serialized array of {name, weight, score, raw, tip}.</summary>
    public string DimensionsJson { get; private set; } = default!;

    /// <summary>Serialized array of {kind, ref, description, atUtc} - the top recent lapses.</summary>
    public string LapsesJson { get; private set; } = default!;

    public bool LoanReady { get; private set; }
    public string? LoanReadyReason { get; private set; }

    public DateTimeOffset ComputedAtUtc { get; private set; }

    // IAuditable
    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    /// <summary>Replace this snapshot's content with a freshly computed score. Used by
    /// the upsert path in ReliabilityService so we can keep the same row and let the
    /// AuditInterceptor capture the diff rather than churning new rows.</summary>
    public void Replace(string grade, decimal totalScore, string dimensionsJson, string lapsesJson,
        bool loanReady, string? loanReadyReason, DateTimeOffset computedAtUtc)
    {
        Grade = grade;
        TotalScore = totalScore;
        DimensionsJson = dimensionsJson;
        LapsesJson = lapsesJson;
        LoanReady = loanReady;
        LoanReadyReason = loanReadyReason;
        ComputedAtUtc = computedAtUtc;
    }
}
