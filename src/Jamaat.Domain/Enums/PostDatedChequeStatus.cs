namespace Jamaat.Domain.Enums;

/// <summary>
/// Lifecycle of a post-dated cheque held against a commitment installment.
/// The cheque does <em>not</em> apply payment until it transitions to <see cref="Cleared"/> -
/// at that point the system issues a normal Receipt against the linked installment.
/// </summary>
public enum PostDatedChequeStatus
{
    /// <summary>Received from the contributor but not yet deposited.</summary>
    Pledged = 1,
    /// <summary>Submitted to the bank for clearing.</summary>
    Deposited = 2,
    /// <summary>Bank confirmed funds; a Receipt has been issued and the linked installment is paid.</summary>
    Cleared = 3,
    /// <summary>Bank rejected the cheque. A replacement may be linked via ReplacedByChequeId.</summary>
    Bounced = 4,
    /// <summary>Operator-cancelled (e.g., contributor requested the cheque back). Final state.</summary>
    Cancelled = 5,
}
