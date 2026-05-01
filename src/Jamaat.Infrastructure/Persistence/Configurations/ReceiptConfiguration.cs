using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class ReceiptConfiguration : IEntityTypeConfiguration<Receipt>
{
    public void Configure(EntityTypeBuilder<Receipt> b)
    {
        b.ToTable("Receipt", "txn");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.ReceiptNumber).HasMaxLength(32);
        b.Property(x => x.ItsNumberSnapshot).HasMaxLength(8);
        b.Property(x => x.MemberNameSnapshot).HasMaxLength(200).IsRequired();
        b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        b.Property(x => x.AmountTotal).HasColumnType("decimal(18,2)");
        b.Property(x => x.FxRate).HasColumnType("decimal(18,8)");
        b.Property(x => x.BaseCurrency).HasMaxLength(3).IsRequired();
        b.Property(x => x.BaseAmountTotal).HasColumnType("decimal(18,2)");
        b.Property(x => x.PaymentMode).HasConversion<int>();
        b.Property(x => x.ChequeNumber).HasMaxLength(64);
        b.Property(x => x.DrawnOnBank).HasMaxLength(200);
        b.Property(x => x.PaymentReference).HasMaxLength(200);
        b.Property(x => x.Remarks).HasMaxLength(1000);
        b.Property(x => x.FamilyNameSnapshot).HasMaxLength(200);
        b.Property(x => x.OnBehalfOfMemberIdsJson).HasColumnType("nvarchar(max)");
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.ConfirmedByUserName).HasMaxLength(200);
        b.Property(x => x.CancellationReason).HasMaxLength(500);
        b.Property(x => x.ReversalReason).HasMaxLength(500);

        // Returnable contribution fields (batch 2 of fund-management uplift)
        b.Property(x => x.Intention).HasConversion<int>().HasDefaultValue(Domain.Enums.ContributionIntention.Permanent);
        b.Property(x => x.NiyyathNote).HasMaxLength(2000);
        b.Property(x => x.AgreementReference).HasMaxLength(500);
        b.Property(x => x.AgreementDocumentUrl).HasMaxLength(500);
        b.Property(x => x.AmountReturned).HasColumnType("decimal(18,2)").HasDefaultValue(0m);
        b.Property(x => x.MaturityState).HasConversion<int>().HasDefaultValue(Domain.Enums.ReturnableMaturityState.NotApplicable);
        b.HasIndex(x => new { x.TenantId, x.MaturityState });
        b.Ignore(x => x.IsReturnable);     // computed
        b.Ignore(x => x.AmountReturnable); // computed
        // Custom fields blob (batch 3) - JSON map of admin-defined keys → values.
        b.Property(x => x.CustomFieldsJson).HasColumnType("nvarchar(max)");

        b.HasIndex(x => new { x.TenantId, x.ReceiptNumber }).IsUnique().HasFilter("[ReceiptNumber] IS NOT NULL");
        b.HasIndex(x => new { x.TenantId, x.ReceiptDate });
        b.HasIndex(x => new { x.TenantId, x.MemberId, x.ReceiptDate });
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.FamilyId });
        b.HasIndex(x => new { x.TenantId, x.Intention });
        // Filtered index on the PDC link - matters for the "still awaiting clearance" worklist
        // that the cheques workbench cross-references.
        b.HasIndex(x => x.PendingPostDatedChequeId).HasFilter("[PendingPostDatedChequeId] IS NOT NULL");

        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<BankAccount>().WithMany().HasForeignKey(x => x.BankAccountId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<FinancialPeriod>().WithMany().HasForeignKey(x => x.FinancialPeriodId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<NumberingSeries>().WithMany().HasForeignKey(x => x.NumberingSeriesId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Family>().WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.Restrict);

        b.OwnsMany(x => x.Lines, ln =>
        {
            ln.ToTable("ReceiptLine", "txn");
            ln.WithOwner().HasForeignKey(x => x.ReceiptId);
            ln.HasKey(x => x.Id);
            ln.Property<Guid>("ReceiptId");
            ln.Property(x => x.Purpose).HasMaxLength(500);
            ln.Property(x => x.PeriodReference).HasMaxLength(50);
            ln.Property(x => x.Amount).HasColumnType("decimal(18,2)");
            ln.HasOne<FundType>().WithMany().HasForeignKey(x => x.FundTypeId).OnDelete(DeleteBehavior.Restrict);
            ln.HasOne<Commitment>().WithMany().HasForeignKey(x => x.CommitmentId).OnDelete(DeleteBehavior.Restrict);
            ln.HasOne<FundEnrollment>().WithMany().HasForeignKey(x => x.FundEnrollmentId).OnDelete(DeleteBehavior.Restrict);
            ln.HasOne<QarzanHasanaLoan>().WithMany().HasForeignKey(x => x.QarzanHasanaLoanId).OnDelete(DeleteBehavior.Restrict);
            ln.HasIndex("ReceiptId", nameof(ReceiptLine.LineNo));
            ln.HasIndex(x => x.CommitmentInstallmentId);
            ln.HasIndex(x => x.FundEnrollmentId);
            ln.HasIndex(x => x.QarzanHasanaInstallmentId);
        });
    }
}
