using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;

namespace Jamaat.Application.Accounting;

public interface IPostingService
{
    /// Posts balanced ledger entries for a Receipt. Raises if lines don't balance or accounts are missing.
    Task PostReceiptAsync(Receipt receipt, CancellationToken ct = default);

    /// Posts balanced ledger entries for a Voucher.
    Task PostVoucherAsync(Voucher voucher, IReadOnlyList<ExpenseType> expenseTypes, CancellationToken ct = default);

    /// Posts balanced ledger entries for a Voucher that represents a return-of-contribution
    /// against a returnable Receipt. Debits the receipt's liability account (where the receipt
    /// originally credited) and credits the voucher's bank/cash account. Distinct from
    /// PostVoucherAsync because the voucher carries no ExpenseType lines for this case.
    Task PostContributionReturnAsync(Voucher voucher, Receipt sourceReceipt, CancellationToken ct = default);

    /// Posts balanced ledger entries for a Voucher representing a Qarzan Hasana loan
    /// disbursement. Debits the QH Receivable asset (so outstanding loans show on the
    /// balance sheet) and credits the voucher's bank/cash account.
    Task PostQhLoanDisbursementAsync(Voucher voucher, QarzanHasanaLoan loan, CancellationToken ct = default);

    /// Creates reversal entries by negating every original entry for (sourceType, sourceId).
    Task PostReversalAsync(LedgerSourceType sourceType, Guid sourceId, string reason, CancellationToken ct = default);
}
