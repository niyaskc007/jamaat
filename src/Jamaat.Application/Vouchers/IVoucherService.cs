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
    Task<Result<VoucherDto>> CancelAsync(Guid id, CancelVoucherDto dto, CancellationToken ct = default);
    Task<Result<VoucherDto>> ReverseAsync(Guid id, ReverseVoucherDto dto, CancellationToken ct = default);
    Task<Result<byte[]>> RenderPdfAsync(Guid id, CancellationToken ct = default);
    /// <summary>Bulk-import historical vouchers. Each row = one single-line voucher; auto-approved if Mode=Cash, otherwise left in Draft for manual review.</summary>
    Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default);
}

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
