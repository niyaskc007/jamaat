namespace Jamaat.Domain.Enums;

/// <summary>
/// What kind of transaction an admin-configurable label applies to. Used by
/// <see cref="Entities.TransactionLabel"/> so the same fund type can carry e.g.
/// "Mohammedi Contribution" for receipts and "Mohammedi Refund" for returns.
/// </summary>
public enum TransactionLabelType
{
    Contribution = 1,         // ordinary receipt
    LoanIssue = 2,            // disbursing a loan (e.g. Qarzan Hasana)
    LoanRepayment = 3,        // receipt against a loan installment
    ContributionReturn = 4,   // returning a returnable contribution
    Refund = 5,               // correcting a posted receipt
    Cancellation = 6,         // user-driven cancellation
    Reversal = 7,             // post-confirmation reversal
    FundTransfer = 8,         // moving balance between funds
}
