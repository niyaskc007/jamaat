using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;

namespace Jamaat.Application.Accounting;

public interface IPostingService
{
    /// Posts balanced ledger entries for a Receipt. Raises if lines don't balance or accounts are missing.
    Task PostReceiptAsync(Receipt receipt, CancellationToken ct = default);

    /// Posts balanced ledger entries for a Voucher.
    Task PostVoucherAsync(Voucher voucher, IReadOnlyList<ExpenseType> expenseTypes, CancellationToken ct = default);

    /// Creates reversal entries by negating every original entry for (sourceType, sourceId).
    Task PostReversalAsync(LedgerSourceType sourceType, Guid sourceId, string reason, CancellationToken ct = default);
}
