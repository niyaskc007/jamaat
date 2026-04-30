using Jamaat.Domain.Common;

namespace Jamaat.Application.Members.Reliability;

/// <summary>
/// Computes and serves "Reliability Profile" snapshots for members. Lazy compute:
/// reads return cached snapshots when fresh (less than 24h old); recomputed on
/// demand or when a source aggregate (commitment, loan, receipt) is mutated.
/// </summary>
/// <remarks>
/// Why advisory: scoring people in a religious community context is sensitive.
/// This service exposes a number and the *reasons* behind it. UI must always
/// display "Advisory only - approvers decide" alongside the grade. We do NOT
/// gate any approve/disburse path on this score - it's a hint to the human.
/// </remarks>
public interface IReliabilityService
{
    /// <summary>Get a member's reliability profile, recomputing if stale.</summary>
    Task<Result<ReliabilityProfileDto>> GetAsync(Guid memberId, CancellationToken ct = default);

    /// <summary>Force a fresh recompute and return it. Permission-gated to admins.</summary>
    Task<Result<ReliabilityProfileDto>> RecomputeAsync(Guid memberId, CancellationToken ct = default);

    /// <summary>Mark a member's snapshot as stale so the next read triggers recompute.
    /// Called from receipt/commitment/loan write paths to invalidate the cache.</summary>
    Task InvalidateAsync(Guid memberId, CancellationToken ct = default);

    /// <summary>Aggregate distribution across the tenant for the admin dashboard.</summary>
    Task<Result<ReliabilityDistributionDto>> GetDistributionAsync(CancellationToken ct = default);
}
