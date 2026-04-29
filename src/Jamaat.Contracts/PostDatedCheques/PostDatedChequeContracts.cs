using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.PostDatedCheques;

public sealed record PostDatedChequeDto(
    Guid Id,
    Guid CommitmentId, string CommitmentCode, string PartyName,
    Guid? CommitmentInstallmentId, int? InstallmentNo, DateOnly? InstallmentDueDate,
    Guid MemberId, string MemberItsNumber, string MemberName,
    string ChequeNumber, DateOnly ChequeDate, string DrawnOnBank,
    decimal Amount, string Currency,
    PostDatedChequeStatus Status,
    DateOnly? DepositedOn, DateOnly? ClearedOn, Guid? ClearedReceiptId, string? ClearedReceiptNumber,
    DateOnly? BouncedOn, string? BounceReason,
    DateOnly? CancelledOn, string? CancellationReason,
    Guid? ReplacedByChequeId,
    string? Notes,
    DateTimeOffset CreatedAtUtc);

public sealed record CreatePostDatedChequeDto(
    Guid CommitmentId,
    Guid? CommitmentInstallmentId,
    string ChequeNumber,
    DateOnly ChequeDate,
    string DrawnOnBank,
    decimal Amount,
    string? Currency = null,
    string? Notes = null);

public sealed record DepositPostDatedChequeDto(DateOnly DepositedOn);

/// <summary>Mark a deposited cheque as cleared. The service issues a Receipt - caller supplies
/// the bank account funds landed in. ClearedOn defaults to today on the controller side.</summary>
public sealed record ClearPostDatedChequeDto(DateOnly ClearedOn, Guid BankAccountId);

public sealed record BouncePostDatedChequeDto(DateOnly BouncedOn, string Reason);

public sealed record CancelPostDatedChequeDto(DateOnly CancelledOn, string Reason);
