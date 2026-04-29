using System.Globalization;
using Jamaat.Application.Receipts;
using Jamaat.Contracts.Receipts;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Jamaat.Infrastructure.Pdf;

public sealed class ReceiptPdfRenderer : IReceiptPdfRenderer
{
    static ReceiptPdfRenderer() { QuestPDF.Settings.License = LicenseType.Community; }

    public byte[] Render(ReceiptDto r, bool reprint)
    {
        var fxApplied = r.Currency != r.BaseCurrency && r.FxRate != 1m;

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
                            c.Item().PaddingTop(2).Text("Donation receipt").FontSize(9).FontColor("#64748B");
                        });
                        row.ConstantItem(170).AlignRight().Column(c =>
                        {
                            if (reprint)
                                c.Item().AlignRight().Text("DUPLICATE").FontSize(10).Bold().FontColor("#DC2626").Underline();
                            c.Item().AlignRight().Text("RECEIPT").FontSize(12).Bold().FontColor("#64748B");
                            c.Item().AlignRight().PaddingTop(2).Text(r.ReceiptNumber ?? "-")
                                .FontSize(14).Bold().FontFamily("Consolas").FontColor("#0B6E63");
                            c.Item().AlignRight().Text(r.ReceiptDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture))
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
                            cc.Item().Text("Received with thanks from").FontSize(9).FontColor("#64748B");
                            cc.Item().PaddingTop(3).Text(r.MemberNameSnapshot).Bold().FontSize(13).FontColor("#0F172A");
                            cc.Item().Text($"ITS  {r.ItsNumberSnapshot}").FontSize(10).FontColor("#475569").FontFamily("Consolas");
                        });
                        row.ConstantItem(160).AlignRight().Column(cc =>
                        {
                            cc.Item().AlignRight().Text("AMOUNT").FontSize(9).FontColor("#64748B").LetterSpacing(0.05f);
                            cc.Item().AlignRight().PaddingTop(2).Text(PdfFormatting.Money(r.AmountTotal, r.Currency))
                                .Bold().FontSize(18).FontColor("#0B6E63");
                            if (fxApplied)
                            {
                                cc.Item().AlignRight().PaddingTop(4).Text(
                                    $"≈ {PdfFormatting.Money(r.BaseAmountTotal, r.BaseCurrency)}  @ {r.FxRate.ToString("G6", CultureInfo.InvariantCulture)}")
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
                            h.Cell().Background("#F1F4F7").Padding(7).Text("Fund").Bold().FontSize(9).FontColor("#475569");
                            h.Cell().Background("#F1F4F7").Padding(7).Text("Purpose / Period").Bold().FontSize(9).FontColor("#475569");
                            h.Cell().Background("#F1F4F7").Padding(7).AlignRight().Text("Amount").Bold().FontSize(9).FontColor("#475569");
                        });
                        foreach (var ln in r.Lines)
                        {
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7)
                                .Text(ln.LineNo.ToString(CultureInfo.InvariantCulture));
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7).Column(c =>
                            {
                                c.Item().Text(ln.FundTypeName).Bold().FontSize(10);
                                c.Item().Text(ln.FundTypeCode).FontSize(8).FontColor("#64748B").FontFamily("Consolas");
                            });
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7)
                                .Text(string.Join(" · ", new[] { ln.Purpose, ln.PeriodReference }.Where(x => !string.IsNullOrWhiteSpace(x)))!)
                                .FontSize(10);
                            t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(7).AlignRight()
                                .Text(PdfFormatting.Money(ln.Amount, r.Currency)).FontSize(10);
                        }
                        t.Cell().ColumnSpan(3).Padding(10).AlignRight().Text("Total").Bold().FontSize(11);
                        t.Cell().Padding(10).AlignRight().Text(PdfFormatting.Money(r.AmountTotal, r.Currency))
                            .Bold().FontSize(13).FontColor("#0B6E63");
                    });

                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("PAYMENT").FontSize(9).FontColor("#64748B").Bold().LetterSpacing(0.05f);
                            c.Item().PaddingTop(3).Text($"Mode  {r.PaymentMode}").FontSize(10);
                            if (!string.IsNullOrEmpty(r.ChequeNumber))
                                c.Item().Text($"Cheque  {r.ChequeNumber}  dated  {r.ChequeDate?.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)}").FontSize(10);
                            if (!string.IsNullOrEmpty(r.BankAccountName))
                                c.Item().Text($"Bank  {r.BankAccountName}").FontSize(10);
                            if (!string.IsNullOrEmpty(r.PaymentReference))
                                c.Item().Text($"Ref  {r.PaymentReference}").FontSize(10);
                        });
                        row.RelativeItem().Column(c =>
                        {
                            if (!string.IsNullOrWhiteSpace(r.Remarks))
                            {
                                c.Item().Text("REMARKS").FontSize(9).FontColor("#64748B").Bold().LetterSpacing(0.05f);
                                c.Item().PaddingTop(3).Text(r.Remarks).FontSize(10);
                            }
                        });
                    });

                    col.Item().PaddingTop(28).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text($"Status  {r.Status}").FontSize(9).FontColor("#64748B");
                            if (r.ConfirmedByUserName is not null)
                                c.Item().Text($"Confirmed by  {r.ConfirmedByUserName}").FontSize(9).FontColor("#64748B");
                        });
                        row.RelativeItem().AlignRight().Column(c =>
                        {
                            c.Item().AlignRight().LineHorizontal(0.5f).LineColor("#94A1B2");
                            c.Item().AlignRight().PaddingTop(4).Text("Authorised signatory").FontSize(9).FontColor("#64748B");
                        });
                    });
                });

                p.Footer().AlignCenter().Text(t => t.Span("System-generated receipt").FontSize(8).FontColor("#94A1B2"));
            });
        }).GeneratePdf();
    }
}
