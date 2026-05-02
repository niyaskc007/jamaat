using System.Globalization;
using Jamaat.Application.QarzanHasana;
using Jamaat.Contracts.QarzanHasana;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Jamaat.Infrastructure.Pdf;

/// <summary>
/// QuestPDF implementation of the QH agreement document. Generates an A4 page that the
/// borrower, both guarantors, and the Jamaat officer can sign. Mirrors the layout of the
/// existing receipt + voucher PDFs (same colour palette, fonts, footer line) so the documents
/// feel like a coherent set.
/// </summary>
public sealed class QhAgreementPdfRenderer : IQhAgreementPdfRenderer
{
    static QhAgreementPdfRenderer() { QuestPDF.Settings.License = LicenseType.Community; }

    public byte[] Render(QarzanHasanaLoanDetailDto detail)
    {
        var l = detail.Loan;
        var inv = CultureInfo.InvariantCulture;
        var instalmentMonthly = l.InstalmentsApproved > 0
            ? Math.Round(l.AmountApproved / l.InstalmentsApproved, 2)
            : 0m;

        return Document.Create(doc =>
        {
            doc.Page(p =>
            {
                p.Size(PageSizes.A4);
                p.Margin(28);
                p.DefaultTextStyle(t => t.FontSize(10).FontColor("#1E293B"));

                p.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("JAMAAT").FontSize(22).Bold().FontColor("#0B6E63");
                            c.Item().PaddingTop(2).Text("Qarzan Hasana — interest-free loan agreement").FontSize(10).FontColor("#64748B");
                        });
                        row.ConstantItem(180).AlignRight().Column(c =>
                        {
                            c.Item().AlignRight().Text("AGREEMENT").FontSize(12).Bold().FontColor("#64748B");
                            c.Item().AlignRight().PaddingTop(2).Text(l.Code)
                                .FontSize(14).Bold().FontFamily("Consolas").FontColor("#0B6E63");
                            c.Item().AlignRight().Text(l.StartDate.ToString("dd MMM yyyy", inv))
                                .FontSize(10).FontColor("#475569");
                        });
                    });
                    col.Item().PaddingVertical(10).LineHorizontal(1).LineColor("#E5E9EF");
                });

                p.Content().Column(col =>
                {
                    col.Spacing(14);

                    // Parties block: lender (Jamaat) on the left, borrower on the right.
                    col.Item().Background("#F8FAFC").Border(1).BorderColor("#E5E9EF").Padding(14).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Lender").FontSize(9).FontColor("#64748B");
                            c.Item().PaddingTop(3).Text("Jamaat (the Society)").Bold().FontSize(13).FontColor("#0F172A");
                            c.Item().PaddingTop(2).Text("Acting through its Qarzan Hasana committee.").FontSize(9).FontColor("#475569");
                        });
                        row.ConstantItem(20);
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Borrower").FontSize(9).FontColor("#64748B");
                            c.Item().PaddingTop(3).Text(l.MemberName).Bold().FontSize(13).FontColor("#0F172A");
                            c.Item().Text($"ITS  {l.MemberItsNumber}").FontSize(10).FontColor("#475569").FontFamily("Consolas");
                            if (!string.IsNullOrWhiteSpace(l.FamilyCode))
                                c.Item().Text($"Family  {l.FamilyCode}").FontSize(9).FontColor("#64748B");
                        });
                    });

                    // Principal + repayment terms - the figures the parties care about most.
                    col.Item().Background("#FEF3C7").Padding(12).Column(c =>
                    {
                        c.Item().Text("Principal & repayment terms").Bold().FontSize(11).FontColor("#92400E");
                        c.Item().PaddingTop(6).Row(row =>
                        {
                            row.RelativeItem().Column(cc =>
                            {
                                cc.Item().Text("Principal amount").FontSize(9).FontColor("#64748B");
                                cc.Item().Text($"{l.Currency} {l.AmountApproved.ToString("N2", inv)}").Bold().FontSize(14).FontColor("#0F172A");
                            });
                            row.RelativeItem().Column(cc =>
                            {
                                cc.Item().Text("Instalments").FontSize(9).FontColor("#64748B");
                                cc.Item().Text($"{l.InstalmentsApproved} × {l.Currency} {instalmentMonthly.ToString("N2", inv)}").Bold().FontSize(14).FontColor("#0F172A");
                            });
                            row.RelativeItem().Column(cc =>
                            {
                                cc.Item().Text("First instalment").FontSize(9).FontColor("#64748B");
                                cc.Item().Text(detail.Installments.Count > 0
                                    ? detail.Installments[0].DueDate.ToString("dd MMM yyyy", inv)
                                    : l.StartDate.ToString("dd MMM yyyy", inv))
                                    .Bold().FontSize(12).FontColor("#0F172A");
                            });
                        });
                        c.Item().PaddingTop(6).Text("This loan is interest-free (Qarzan Hasana). No riba is charged or payable. " +
                            "The borrower undertakes to return the principal in the agreed instalments below.")
                            .FontSize(9).Italic().FontColor("#92400E");
                    });

                    // Guarantors block.
                    col.Item().Border(1).BorderColor("#E5E9EF").Padding(12).Column(c =>
                    {
                        c.Item().Text("Guarantors (Kafeel)").Bold().FontSize(11).FontColor("#0B6E63");
                        c.Item().PaddingTop(6).Row(row =>
                        {
                            row.RelativeItem().Column(cc =>
                            {
                                cc.Item().Text("Guarantor 1").FontSize(9).FontColor("#64748B");
                                cc.Item().PaddingTop(2).Text(l.Guarantor1Name).Bold().FontSize(11).FontColor("#0F172A");
                            });
                            row.RelativeItem().Column(cc =>
                            {
                                cc.Item().Text("Guarantor 2").FontSize(9).FontColor("#64748B");
                                cc.Item().PaddingTop(2).Text(l.Guarantor2Name).Bold().FontSize(11).FontColor("#0F172A");
                            });
                        });
                        c.Item().PaddingTop(6).Text("Both guarantors jointly and severally undertake to repay any defaulted instalment " +
                            "if the borrower fails to do so, until the principal is fully recovered.")
                            .FontSize(9).Italic().FontColor("#475569");
                    });

                    // Instalment schedule.
                    col.Item().PaddingTop(2).Text("Instalment schedule").Bold().FontSize(11).FontColor("#0B6E63");
                    col.Item().Table(t =>
                    {
                        t.ColumnsDefinition(cd =>
                        {
                            cd.ConstantColumn(34);
                            cd.RelativeColumn(2);
                            cd.RelativeColumn(2);
                            cd.RelativeColumn(2);
                        });
                        t.Header(h =>
                        {
                            h.Cell().Background("#F1F5F9").Padding(4).Text("#").Bold().FontSize(9);
                            h.Cell().Background("#F1F5F9").Padding(4).Text("Due date").Bold().FontSize(9);
                            h.Cell().Background("#F1F5F9").Padding(4).AlignRight().Text("Amount").Bold().FontSize(9);
                            h.Cell().Background("#F1F5F9").Padding(4).Text("Borrower signature").Bold().FontSize(9);
                        });
                        if (detail.Installments.Count == 0)
                        {
                            t.Cell().ColumnSpan(4).Padding(8).AlignCenter()
                                .Text("Schedule will be issued once the loan is approved and disbursed.").FontSize(9).Italic().FontColor("#94A3B8");
                        }
                        else
                        {
                            foreach (var inst in detail.Installments)
                            {
                                t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(4).Text(inst.InstallmentNo.ToString(inv)).FontFamily("Consolas").FontSize(9);
                                t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(4).Text(inst.DueDate.ToString("dd MMM yyyy", inv)).FontSize(9);
                                t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(4).AlignRight().Text($"{l.Currency} {inst.ScheduledAmount.ToString("N2", inv)}").FontFamily("Consolas").FontSize(9);
                                t.Cell().BorderBottom(0.5f).BorderColor("#E5E9EF").Padding(4).Text("").FontSize(9);
                            }
                        }
                    });

                    // Terms block.
                    col.Item().PaddingTop(4).Border(1).BorderColor("#E5E9EF").Padding(12).Column(c =>
                    {
                        c.Item().Text("Terms").Bold().FontSize(11).FontColor("#0B6E63");
                        c.Item().PaddingTop(4).Text("1. The borrower acknowledges receipt of the principal stated above on the disbursement date.").FontSize(9);
                        c.Item().PaddingTop(2).Text("2. The borrower undertakes to repay each instalment on or before its due date.").FontSize(9);
                        c.Item().PaddingTop(2).Text("3. No interest, premium, or fee is payable on this loan; this is a Qarzan Hasana (interest-free benevolent loan).").FontSize(9);
                        c.Item().PaddingTop(2).Text("4. If the borrower defaults on any instalment, the Jamaat may notify the guarantors named above to recover the outstanding balance.").FontSize(9);
                        c.Item().PaddingTop(2).Text("5. The borrower may prepay any portion of the loan at any time without penalty.").FontSize(9);
                        c.Item().PaddingTop(2).Text("6. Any change to the schedule must be agreed in writing by both the borrower and the Jamaat committee.").FontSize(9);
                    });

                    // Signature block.
                    col.Item().PaddingTop(8).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Height(36);
                            c.Item().LineHorizontal(0.6f).LineColor("#94A3B8");
                            c.Item().Text("Borrower signature").FontSize(9).FontColor("#64748B");
                            c.Item().Text(l.MemberName).FontSize(9);
                        });
                        row.ConstantItem(16);
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Height(36);
                            c.Item().LineHorizontal(0.6f).LineColor("#94A3B8");
                            c.Item().Text("Guarantor 1 signature").FontSize(9).FontColor("#64748B");
                            c.Item().Text(l.Guarantor1Name).FontSize(9);
                        });
                        row.ConstantItem(16);
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Height(36);
                            c.Item().LineHorizontal(0.6f).LineColor("#94A3B8");
                            c.Item().Text("Guarantor 2 signature").FontSize(9).FontColor("#64748B");
                            c.Item().Text(l.Guarantor2Name).FontSize(9);
                        });
                    });
                    col.Item().PaddingTop(8).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Height(36);
                            c.Item().LineHorizontal(0.6f).LineColor("#94A3B8");
                            c.Item().Text("Jamaat officer").FontSize(9).FontColor("#64748B");
                            c.Item().Text(l.Level2ApproverName ?? "—").FontSize(9);
                        });
                        row.ConstantItem(16);
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Height(36);
                            c.Item().LineHorizontal(0.6f).LineColor("#94A3B8");
                            c.Item().Text("Witness").FontSize(9).FontColor("#64748B");
                        });
                    });
                });

                p.Footer().AlignCenter().Text(t =>
                {
                    t.Span("Generated ").FontSize(8).FontColor("#94A3B8");
                    t.Span(DateTime.UtcNow.ToString("dd MMM yyyy HH:mm 'UTC'", inv)).FontSize(8).FontColor("#94A3B8");
                    t.Span(" · Loan ").FontSize(8).FontColor("#94A3B8");
                    t.Span(l.Code).FontSize(8).FontFamily("Consolas").FontColor("#94A3B8");
                });
            });
        }).GeneratePdf();
    }
}
