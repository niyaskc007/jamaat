using System.Globalization;
using Jamaat.Application.Vouchers;
using Jamaat.Contracts.Vouchers;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Jamaat.Infrastructure.Pdf;

public sealed class VoucherPdfRenderer : IVoucherPdfRenderer
{
    static VoucherPdfRenderer() { QuestPDF.Settings.License = LicenseType.Community; }

    public byte[] Render(VoucherDto v, string? documentTitle = null)
    {
        var fxApplied = v.Currency != v.BaseCurrency && v.FxRate != 1m;
        // documentTitle (when provided) lets an admin override "Payment voucher" with the
        // configured TransactionLabel, e.g. "QH Loan Issue" for a disbursement voucher or
        // "Returnable Contribution Refund" for a return voucher.
        var headerSubtitle = documentTitle ?? "Payment voucher";

        return Document.Create(doc =>
        {
            doc.Page(p =>
            {
                p.Size(PageSizes.A5);
                p.Margin(22);
                p.DefaultTextStyle(t => t.FontSize(10).FontColor("#1E293B"));

                p.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("JAMAAT").FontSize(22).Bold().FontColor("#0B6E63");
                            c.Item().PaddingTop(2).Text(headerSubtitle).FontSize(9).FontColor("#64748B");
                        });
                        row.ConstantItem(170).AlignRight().Column(c =>
                        {
                            c.Item().AlignRight().Text("PAYMENT VOUCHER").FontSize(11).Bold().FontColor("#64748B");
                            c.Item().AlignRight().PaddingTop(2).Text(v.VoucherNumber ?? "-")
                                .FontSize(14).Bold().FontFamily("Consolas").FontColor("#0B6E63");
                            c.Item().AlignRight().Text(v.VoucherDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture))
                                .FontSize(10).FontColor("#475569");
                        });
                    });
                    col.Item().PaddingVertical(10).LineHorizontal(1).LineColor("#E5E9EF");
                });

                p.Content().Column(col =>
                {
                    col.Spacing(14);

                    col.Item().Background("#F8FAFC").Border(1).BorderColor("#E5E9EF").Padding(14).Row(row =>
                    {
                        row.RelativeItem().Column(cc =>
                        {
                            cc.Item().Text("Pay to").FontSize(9).FontColor("#64748B");
                            cc.Item().PaddingTop(3).Text(v.PayTo).Bold().FontSize(13).FontColor("#0F172A");
                            if (!string.IsNullOrEmpty(v.PayeeItsNumber))
                                cc.Item().Text($"ITS  {v.PayeeItsNumber}").FontSize(10).FontColor("#475569").FontFamily("Consolas");
                            if (!string.IsNullOrWhiteSpace(v.Purpose))
                                cc.Item().PaddingTop(8).Text(v.Purpose).FontSize(10).FontColor("#334155");
                        });
                        row.ConstantItem(160).AlignRight().Column(cc =>
                        {
                            cc.Item().AlignRight().Text("AMOUNT").FontSize(9).FontColor("#64748B").LetterSpacing(0.05f);
                            cc.Item().AlignRight().PaddingTop(2).Text(PdfFormatting.Money(v.AmountTotal, v.Currency))
                                .Bold().FontSize(18).FontColor("#0B6E63");
                            if (fxApplied)
                            {
                                cc.Item().AlignRight().PaddingTop(4).Text(
                                    $"≈ {PdfFormatting.Money(v.BaseAmountTotal, v.BaseCurrency)}  @ {v.FxRate.ToString("G6", CultureInfo.InvariantCulture)}")
                                    .FontSize(9).FontColor("#64748B");
                            }
                        });
                    });

                    col.Item().Table(t =>
                    {
                        t.ColumnsDefinition(cd =>
                        {
                            cd.ConstantColumn(26);
                            cd.RelativeColumn(3);
                            cd.RelativeColumn(3);
                            cd.ConstantColumn(100);
                        });
                        t.Header(h =>
                        {
                            h.Cell().Background("#F1F4F7").Padding(7).Text("#").Bold().FontSize(9).FontColor("#475569");
                            h.Cell().Background("#F1F4F7").Padding(7).Text("Expense").Bold().FontSize(9).FontColor("#475569");
                            h.Cell().Background("#F1F4F7").Padding(7).Text("Narration").Bold().FontSize(9).FontColor("#475569");
                            h.Cell().Background("#F1F4F7").Padding(7).AlignRight().Text("Amount").Bold().FontSize(9).FontColor("#475569");
                        });
                        foreach (var ln in v.Lines)
                        {
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7)
                                .Text(ln.LineNo.ToString(CultureInfo.InvariantCulture));
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7).Column(c =>
                            {
                                c.Item().Text(ln.ExpenseTypeName).Bold().FontSize(10);
                                c.Item().Text(ln.ExpenseTypeCode).FontSize(8).FontColor("#64748B").FontFamily("Consolas");
                            });
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7).Text(ln.Narration ?? "").FontSize(10);
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7).AlignRight()
                                .Text(PdfFormatting.Money(ln.Amount, v.Currency)).FontSize(10);
                        }
                        t.Cell().ColumnSpan(3).Padding(10).AlignRight().Text("Total").Bold().FontSize(11);
                        t.Cell().Padding(10).AlignRight().Text(PdfFormatting.Money(v.AmountTotal, v.Currency))
                            .Bold().FontSize(13).FontColor("#0B6E63");
                    });

                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("PAYMENT").FontSize(9).FontColor("#64748B").Bold().LetterSpacing(0.05f);
                            c.Item().PaddingTop(3).Text($"Mode  {v.PaymentMode}").FontSize(10);
                            if (!string.IsNullOrEmpty(v.ChequeNumber))
                                c.Item().Text($"Cheque  {v.ChequeNumber}{(v.ChequeDate is null ? "" : $"  dated  {v.ChequeDate:dd MMM yyyy}")}").FontSize(10);
                            if (!string.IsNullOrEmpty(v.DrawnOnBank))
                                c.Item().Text($"Drawn on  {v.DrawnOnBank}").FontSize(10);
                            if (!string.IsNullOrEmpty(v.BankAccountName))
                                c.Item().Text($"From  {v.BankAccountName}").FontSize(10);
                        });
                        row.RelativeItem().Column(c =>
                        {
                            if (!string.IsNullOrWhiteSpace(v.Remarks))
                            {
                                c.Item().Text("REMARKS").FontSize(9).FontColor("#64748B").Bold().LetterSpacing(0.05f);
                                c.Item().PaddingTop(3).Text(v.Remarks).FontSize(10);
                            }
                        });
                    });

                    col.Item().PaddingTop(32).Row(row =>
                    {
                        SignatureBlock(row.RelativeItem(), "Prepared by", v.ApprovedByUserName);
                        row.ConstantItem(20);
                        SignatureBlock(row.RelativeItem(), "Approved by", null);
                        row.ConstantItem(20);
                        SignatureBlock(row.RelativeItem(), "Received by", null);
                    });
                });

                p.Footer().AlignCenter().Text(t => t.Span("System-generated voucher").FontSize(8).FontColor("#94A1B2"));
            });
        }).GeneratePdf();
    }

    private static void SignatureBlock(IContainer item, string label, string? name)
    {
        item.Column(c =>
        {
            c.Item().PaddingTop(16).LineHorizontal(0.5f).LineColor("#94A1B2");
            c.Item().PaddingTop(4).Text(label).FontSize(9).FontColor("#64748B");
            if (!string.IsNullOrEmpty(name))
                c.Item().Text(name).FontSize(9).FontColor("#334155");
        });
    }
}
