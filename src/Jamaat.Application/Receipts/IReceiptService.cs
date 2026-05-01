using Jamaat.Application.Common;
using Jamaat.Contracts.Receipts;
using Jamaat.Domain.Common;

namespace Jamaat.Application.Receipts;

public interface IReceiptService
{
    Task<PagedResult<ReceiptListItemDto>> ListAsync(ReceiptListQuery q, CancellationToken ct = default);
    Task<Result<ReceiptDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<ReceiptDto>> CreateAndConfirmAsync(CreateReceiptDto dto, CancellationToken ct = default);
    Task<Result<ReceiptDto>> CancelAsync(Guid id, CancelReceiptDto dto, CancellationToken ct = default);
    Task<Result<ReceiptDto>> ReverseAsync(Guid id, ReverseReceiptDto dto, CancellationToken ct = default);
    /// <summary>Approve a Draft receipt that was waiting for sign-off (because at least one
    /// of its funds had RequiresApproval set). Re-validates current state, applies
    /// commitment/QH allocations, allocates a number, posts the GL, and marks Confirmed.</summary>
    Task<Result<ReceiptDto>> ApproveAsync(Guid id, CancellationToken ct = default);
    /// <summary>Finalize a receipt sitting in PendingClearance because a future-dated cheque was
    /// received. Replays the deferred allocation + numbering + GL posting that
    /// <see cref="CreateAndConfirmAsync"/> skipped on the future-cheque path. Called by
    /// <c>PostDatedChequeService</c> when the cheque clears.</summary>
    Task<Result<ReceiptDto>> ConfirmPendingAsync(Guid receiptId, DateOnly clearedOn, CancellationToken ct = default);
    /// <summary>Cancel a receipt sitting in PendingClearance because the linked cheque bounced.
    /// No GL impact since none was made. Called by <c>PostDatedChequeService</c>.</summary>
    Task<Result> CancelPendingAsync(Guid receiptId, string reason, CancellationToken ct = default);
    /// <summary>Process a return-to-contributor against a confirmed Returnable receipt. Issues a
    /// linked voucher (with a dedicated number), debits the receipt's liability account, credits
    /// the chosen bank/cash account, and increments the receipt's running AmountReturned.</summary>
    Task<Result<ReceiptDto>> ReturnContributionAsync(Guid receiptId, ReturnContributionDto dto, bool maturityOverride, CancellationToken ct = default);
    /// <summary>Persist a stored agreement-document URL on the receipt. The actual file bytes
    /// are written by the controller via IReceiptDocumentStorage; this just records the pointer.</summary>
    Task<Result<ReceiptDto>> SetAgreementDocumentUrlAsync(Guid receiptId, string? url, CancellationToken ct = default);
    Task<Result> LogReprintAsync(Guid id, ReprintReceiptDto dto, CancellationToken ct = default);
    Task<Result<byte[]>> RenderPdfAsync(Guid id, bool reprint, CancellationToken ct = default);
    /// <summary>Bulk-import historical receipts. Each row = one single-line confirmed receipt.</summary>
    /// <remarks>
    /// Routes through <see cref="CreateAndConfirmAsync"/> so numbering, ledger posting, FX
    /// and the audit trail are consistent with the real Counter flow.
    /// </remarks>
    Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default);
}

public interface IReceiptRepository
{
    Task<Domain.Entities.Receipt?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Domain.Entities.Receipt?> GetWithLinesAsync(Guid id, CancellationToken ct = default);
    Task<PagedResult<ReceiptListItemDto>> ListAsync(ReceiptListQuery q, CancellationToken ct = default);
    Task AddAsync(Domain.Entities.Receipt e, CancellationToken ct = default);
    void Update(Domain.Entities.Receipt e);
}
