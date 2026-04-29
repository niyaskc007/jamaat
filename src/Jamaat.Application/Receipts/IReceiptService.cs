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
