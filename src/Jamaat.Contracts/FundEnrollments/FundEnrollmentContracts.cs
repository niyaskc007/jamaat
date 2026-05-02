using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.FundEnrollments;

public sealed record FundEnrollmentDto(
    Guid Id, string Code,
    Guid MemberId, string MemberItsNumber, string MemberName,
    Guid FundTypeId, string FundTypeCode, string FundTypeName,
    Guid? FamilyId, string? FamilyCode,
    string? SubType, FundEnrollmentRecurrence Recurrence,
    DateOnly StartDate, DateOnly? EndDate,
    FundEnrollmentStatus Status,
    Guid? ApprovedByUserId, string? ApprovedByUserName, DateTimeOffset? ApprovedAtUtc,
    string? Notes,
    decimal TotalCollected, int ReceiptCount,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateFundEnrollmentDto(
    Guid MemberId,
    Guid FundTypeId,
    string? SubType,
    FundEnrollmentRecurrence Recurrence,
    DateOnly StartDate,
    DateOnly? EndDate = null,
    Guid? FamilyId = null,
    string? Notes = null);

public sealed record UpdateFundEnrollmentDto(
    string? SubType, FundEnrollmentRecurrence Recurrence,
    DateOnly StartDate, DateOnly? EndDate,
    string? Notes, Guid? FamilyId);

public sealed record FundEnrollmentListQuery(
    int Page = 1, int PageSize = 25,
    string? Search = null,
    FundEnrollmentStatus? Status = null,
    Guid? MemberId = null,
    Guid? FundTypeId = null,
    string? SubType = null);
