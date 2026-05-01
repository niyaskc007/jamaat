using Jamaat.Application.Common;
using Jamaat.Contracts.Vouchers;
using Jamaat.Domain.Common;

namespace Jamaat.Application.Vouchers;

public interface IVoucherService
{
    Task<PagedResult<VoucherListItemDto>> ListAsync(VoucherListQuery q, CancellationToken ct = default);
    Task<Result<VoucherDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<VoucherDto>> CreateAsync(CreateVoucherDto dto, CancellationToken ct = default);
    Task<Result<VoucherDto>> ApproveAndPayAsync(Guid id, CancellationToken ct = default);
    /// <summary>Finalize a voucher in PendingClearance because a future-dated cheque cleared.
    /// Called by <c>PostDatedChequeService</c>.</summary>
    Task<Result<VoucherDto>> ConfirmPendingAsync(Guid voucherId, DateOnly clearedOn, CancellationToken ct = default);
    /// <summary>Cancel a voucher in PendingClearance because the linked cheque bounced.</summary>
    Task<Result> CancelPendingAsync(Guid voucherId, string reason, CancellationToken ct = default);
    Task<Result<VoucherDto>> CancelAsync(Guid id, CancelVoucherDto dto, CancellationToken ct = default);
    Task<Result<VoucherDto>> ReverseAsync(Guid id, ReverseVoucherDto dto, CancellationToken ct = default);
    Task<Result<byte[]>> RenderPdfAsync(Guid id, CancellationToken ct = default);
    /// <summary>Bulk-import historical vouchers. Each row = one single-line voucher; auto-approved if Mode=Cash, otherwise left in Draft for manual review.</summary>
    Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default);

    /// <summary>Headline counts + amounts for the Vouchers list KPI strip.</summary>
    Task<VoucherSummaryDto> SummaryAsync(CancellationToken ct = default);
}

/// <summary>Aggregated summary for the Vouchers list page header. All amounts in the most-used
/// recent currency; pending and draft are counts only because mixing currencies on a single
/// "amount owed" tile would mislead.</summary>
public sealed record VoucherSummaryDto(
    decimal PaidThisMonth,
    int PaidThisMonthCount,
    int PendingApprovalCount,
    int DraftCount,
    decimal PaidThisYear,
    int PaidThisYearCount,
    string Currency);

public interface IVoucherRepository
{
    Task<Domain.Entities.Voucher?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Domain.Entities.Voucher?> GetWithLinesAsync(Guid id, CancellationToken ct = default);
    Task<PagedResult<VoucherListItemDto>> ListAsync(VoucherListQuery q, CancellationToken ct = default);
    Task AddAsync(Domain.Entities.Voucher e, CancellationToken ct = default);
    void Update(Domain.Entities.Voucher e);
}

public interface IVoucherPdfRenderer
{
    /// <param name="documentTitle">Optional admin-configured TransactionLabel for the voucher's
    /// kind (LoanIssue / ContributionReturn / FundTransfer etc). Falls back to "Payment voucher"
    /// when null.</param>
    byte[] Render(VoucherDto voucher, string? documentTitle = null);
}
