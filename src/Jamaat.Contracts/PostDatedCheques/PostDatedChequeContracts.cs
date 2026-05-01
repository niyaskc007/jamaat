using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.PostDatedCheques;

/// <summary>One post-dated cheque on the wire. The source-specific fields are populated based
/// on <see cref="Source"/>: Commitment-source rows fill in the commitment + installment fields,
/// Receipt-source rows fill in <see cref="SourceReceiptId"/> + number, Voucher-source rows fill
/// in <see cref="SourceVoucherId"/> + number + payee. <see cref="MemberId"/> is null for
/// voucher-source PDCs paid to non-member vendors.</summary>
public sealed record PostDatedChequeDto(
    Guid Id,
    PostDatedChequeSource Source,
    // Commitment-source fields - null unless Source == Commitment
    Guid? CommitmentId, string? CommitmentCode, string? PartyName,
    Guid? CommitmentInstallmentId, int? InstallmentNo, DateOnly? InstallmentDueDate,
    // Receipt-source fields - null unless Source == Receipt
    Guid? SourceReceiptId, string? SourceReceiptNumber,
    // Voucher-source fields - null unless Source == Voucher
    Guid? SourceVoucherId, string? SourceVoucherNumber, string? VoucherPayTo,
    // Member info - present for Commitment + Receipt sources, null for Voucher (non-member payees)
    Guid? MemberId, string? MemberItsNumber, string? MemberName,
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
