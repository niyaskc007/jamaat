using Jamaat.Contracts.QarzanHasana;

namespace Jamaat.Application.QarzanHasana;

/// <summary>
/// Renders a printable Qarzan Hasana agreement PDF: borrower + guarantor identities, principal,
/// instalment schedule, and the standard interest-free terms block. The output is the document
/// that gets handed over for signature at disbursement; archived alongside the loan record.
/// </summary>
/// <remarks>
/// Why an interface (not the renderer directly): the implementation lives in Infrastructure
/// (uses QuestPDF) but the controller and tests in Api/Application reference only this contract.
/// Mirrors the existing IReceiptPdfRenderer / IVoucherPdfRenderer pattern.
/// </remarks>
public interface IQhAgreementPdfRenderer
{
    byte[] Render(QarzanHasanaLoanDetailDto detail);
}
