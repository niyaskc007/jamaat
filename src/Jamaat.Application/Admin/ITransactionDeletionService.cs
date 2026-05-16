using Jamaat.Contracts.Admin;
using Jamaat.Domain.Common;

namespace Jamaat.Application.Admin;

/// SuperAdmin destructive-delete for posted financial documents (Receipt, Voucher).
/// Unlike master-data / Member / Family, which a single SuperAdmin can soft-delete with a
/// reason, transactions are gated by a two-person rule:
///   1. SuperAdmin A calls <see cref="RequestAsync"/> with a reason. Status = Pending.
///   2. A second, different SuperAdmin calls <see cref="ApproveAsync"/>. The service then
///      runs IReceiptService.ReverseAsync / IVoucherService.ReverseAsync (which writes the
///      reversal GL entries and rolls back any commitment / QH allocations) and stamps the
///      document with DeletedAtUtc + retention.
///   3. Either approver or requester can <see cref="RejectAsync"/> a pending request.
/// Expired pending rows (default 14 days) are swept by the auto-purge job.
public interface ITransactionDeletionService
{
    /// First step: a SuperAdmin requests deletion of a Receipt/Voucher. Validates the
    /// target is in a reversible state (Confirmed receipt / Paid voucher), refuses if
    /// there's already a Pending request for the same target, and persists the request.
    Task<Result<TransactionDeletionRequestDto>> RequestAsync(RequestTransactionDeletionDto dto, CancellationToken ct = default);

    /// Second step: a DIFFERENT SuperAdmin approves. Calls ReverseAsync on the underlying
    /// document, stamps DeletedAtUtc + RetentionUntilUtc, transitions the request to Approved.
    /// Two-person rule enforced inside <see cref="Domain.Entities.TransactionDeletionRequest.Approve"/>.
    Task<Result<TransactionDeletionRequestDto>> ApproveAsync(Guid requestId, ApproveTransactionDeletionDto dto, CancellationToken ct = default);

    /// Reject (by a second SuperAdmin) or withdraw (by the original requester). Status -> Rejected.
    /// The underlying document is untouched.
    Task<Result<TransactionDeletionRequestDto>> RejectAsync(Guid requestId, RejectTransactionDeletionDto dto, CancellationToken ct = default);

    /// Inbox: lists pending requests across the tenant. Used by the second-approver UI.
    /// Optional status filter; default returns all.
    Task<Result<IReadOnlyList<TransactionDeletionRequestDto>>> ListAsync(string? status, CancellationToken ct = default);

    /// One row by id. Returns NotFound if missing or in a different tenant.
    Task<Result<TransactionDeletionRequestDto>> GetAsync(Guid requestId, CancellationToken ct = default);
}
