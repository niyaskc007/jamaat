using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Commitments;

public sealed record CommitmentDto(
    Guid Id,
    string Code,
    CommitmentPartyType PartyType,
    Guid? MemberId, string? MemberItsNumber,
    Guid? FamilyId, string? FamilyCode,
    string PartyName,
    Guid FundTypeId, string FundTypeCode, string FundTypeName,
    string Currency,
    decimal TotalAmount,
    decimal PaidAmount,
    decimal RemainingAmount,
    decimal ProgressPercent,
    CommitmentFrequency Frequency,
    int NumberOfInstallments,
    DateOnly StartDate,
    DateOnly? EndDate,
    bool AllowPartialPayments,
    bool AllowAutoAdvance,
    CommitmentStatus Status,
    string? Notes,
    bool HasAcceptedAgreement,
    DateTimeOffset? AgreementAcceptedAtUtc,
    string? AgreementAcceptedByName,
    DateTimeOffset CreatedAtUtc);

public sealed record CommitmentInstallmentDto(
    Guid Id,
    int InstallmentNo,
    DateOnly DueDate,
    decimal ScheduledAmount,
    decimal PaidAmount,
    decimal RemainingAmount,
    DateOnly? LastPaymentDate,
    InstallmentStatus Status,
    string? WaiverReason,
    DateTimeOffset? WaivedAtUtc,
    string? WaivedByUserName);

public sealed record CommitmentDetailDto(
    CommitmentDto Commitment,
    IReadOnlyList<CommitmentInstallmentDto> Installments,
    Guid? AgreementTemplateId,
    int? AgreementTemplateVersion,
    string? AgreementText);

/// <summary>One row per receipt-line attributed to a commitment. Covers the entire commitment
/// or, when filtered, a single instalment - exposes everything the cashier needs to audit a
/// payment without leaving the commitment screen.</summary>
public sealed record CommitmentPaymentRowDto(
    Guid ReceiptId,
    string? ReceiptNumber,
    DateOnly ReceiptDate,
    Jamaat.Domain.Enums.ReceiptStatus ReceiptStatus,
    Guid? CommitmentInstallmentId,
    int? InstallmentNo,
    decimal Amount,
    string Currency,
    Jamaat.Domain.Enums.PaymentMode PaymentMode,
    string? ChequeNumber,
    DateOnly? ChequeDate,
    Guid? BankAccountId,
    string? BankAccountName,
    string? PaymentReference,
    string? Remarks,
    DateTimeOffset? ConfirmedAtUtc,
    string? ConfirmedByUserName);

public sealed record CreateCommitmentDto(
    CommitmentPartyType PartyType,
    Guid? MemberId,
    Guid? FamilyId,
    Guid FundTypeId,
    string Currency,
    decimal TotalAmount,
    CommitmentFrequency Frequency,
    int NumberOfInstallments,
    DateOnly StartDate,
    bool AllowPartialPayments = true,
    bool AllowAutoAdvance = true,
    string? Notes = null,
    IReadOnlyList<CreateInstallmentOverrideDto>? CustomSchedule = null);

/// <summary>Optional per-installment override for non-uniform schedules.</summary>
public sealed record CreateInstallmentOverrideDto(int InstallmentNo, DateOnly DueDate, decimal ScheduledAmount);

public sealed record CommitmentScheduleLineDto(int InstallmentNo, DateOnly DueDate, decimal ScheduledAmount);

public sealed record PreviewScheduleRequest(
    CommitmentFrequency Frequency, int NumberOfInstallments, DateOnly StartDate, decimal TotalAmount);

public sealed record AcceptAgreementDto(
    Guid? TemplateId,
    string RenderedText);

public sealed record WaiveInstallmentDto(Guid InstallmentId, string Reason);

public sealed record CancelCommitmentDto(string Reason);

public sealed record CommitmentListQuery(
    int Page = 1, int PageSize = 25,
    string? Search = null,
    CommitmentStatus? Status = null,
    CommitmentPartyType? PartyType = null,
    Guid? MemberId = null,
    Guid? FamilyId = null,
    Guid? FundTypeId = null,
    DateOnly? DueFrom = null,
    DateOnly? DueTo = null);
