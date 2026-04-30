namespace Jamaat.Application.Members.Reliability;

/// <summary>
/// Member reliability profile DTO surfaced over the API. Advisory only - approvers
/// and admins make final decisions; this is decision-support data, not a gate.
/// </summary>
public sealed record ReliabilityProfileDto(
    Guid MemberId,
    string Grade,                  // A | B | C | D | Unrated
    decimal? TotalScore,           // 0-100, null when Unrated
    IReadOnlyList<DimensionDto> Dimensions,
    IReadOnlyList<LapseDto> Lapses,
    bool LoanReady,
    string? LoanReadyReason,
    DateTimeOffset ComputedAtUtc);

public sealed record DimensionDto(
    string Key,                    // commitment | loan | returnable | donation
    string Name,
    decimal Weight,                // 0-1
    decimal? Score,                // 0-100, null when Excluded
    bool Excluded,                 // true when there's no source data for this dimension
    string Raw,                    // human-readable summary like "12 of 15 installments on time"
    string? Tip);                  // suggestion to improve, null if score is already excellent or excluded

public sealed record LapseDto(
    string Kind,                   // commitment | loan | returnable
    string Reference,              // the doc number (CMT-1234, QH-2025-007)
    string Description,
    DateOnly OccurredOn);

/// <summary>Cross-member distribution for the admin reliability dashboard.</summary>
public sealed record ReliabilityDistributionDto(
    int TotalMembers,
    int Rated,
    int Unrated,
    IReadOnlyDictionary<string, int> ByGrade,           // grade -> count
    IReadOnlyList<MemberRankDto> TopReliable,
    IReadOnlyList<MemberRankDto> NeedsAttention);

public sealed record MemberRankDto(
    Guid MemberId,
    string ItsNumber,
    string FullName,
    string Grade,
    decimal? TotalScore,
    bool LoanReady);
