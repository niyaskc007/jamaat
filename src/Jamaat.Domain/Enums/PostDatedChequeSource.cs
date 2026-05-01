namespace Jamaat.Domain.Enums;

/// <summary>
/// What kind of document a <see cref="Entities.PostDatedCheque"/> is tracking. The source
/// determines what happens when the cheque clears or bounces:
/// <list type="bullet">
///   <item><term>Commitment</term> — clearing creates a brand-new Receipt against the linked
///   <see cref="Entities.CommitmentInstallment"/> (legacy behaviour).</item>
///   <item><term>Receipt</term> — clearing confirms the already-drafted Receipt and posts to the
///   ledger; bouncing cancels the Receipt with no GL impact (because none was made yet).</item>
///   <item><term>Voucher</term> — clearing approves and pays the Voucher and posts to the ledger;
///   bouncing cancels the Voucher.</item>
/// </list>
/// Exactly one of the three source-id fields on <c>PostDatedCheque</c> is non-null, matching this enum.
/// </summary>
public enum PostDatedChequeSource
{
    Commitment = 1,
    Receipt = 2,
    Voucher = 3,
}
