using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class QarzanHasanaLoanConfiguration : IEntityTypeConfiguration<QarzanHasanaLoan>
{
    public void Configure(EntityTypeBuilder<QarzanHasanaLoan> b)
    {
        b.ToTable("QarzanHasanaLoan", "txn");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Scheme).HasConversion<int>();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.Currency).HasMaxLength(3).IsRequired();

        b.Property(x => x.AmountRequested).HasColumnType("decimal(18,2)");
        b.Property(x => x.AmountApproved).HasColumnType("decimal(18,2)");
        b.Property(x => x.AmountDisbursed).HasColumnType("decimal(18,2)");
        b.Property(x => x.AmountRepaid).HasColumnType("decimal(18,2)");
        b.Property(x => x.GoldAmount).HasColumnType("decimal(18,2)");

        b.Property(x => x.CashflowDocumentUrl).HasMaxLength(500);
        b.Property(x => x.GoldSlipDocumentUrl).HasMaxLength(500);

        b.Property(x => x.Level1ApproverName).HasMaxLength(200);
        b.Property(x => x.Level1Comments).HasMaxLength(1000);
        b.Property(x => x.Level2ApproverName).HasMaxLength(200);
        b.Property(x => x.Level2Comments).HasMaxLength(1000);
        b.Property(x => x.RejectionReason).HasMaxLength(1000);
        b.Property(x => x.CancellationReason).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.MemberId });
        b.HasIndex(x => new { x.TenantId, x.Status });

        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Family>().WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.NoAction);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.Guarantor1MemberId).OnDelete(DeleteBehavior.NoAction);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.Guarantor2MemberId).OnDelete(DeleteBehavior.NoAction);

        b.OwnsMany(x => x.Installments, i =>
        {
            i.ToTable("QarzanHasanaInstallment", "txn");
            i.WithOwner().HasForeignKey(x => x.QarzanHasanaLoanId);
            i.HasKey(x => x.Id);
            i.Property(x => x.ScheduledAmount).HasColumnType("decimal(18,2)");
            i.Property(x => x.PaidAmount).HasColumnType("decimal(18,2)");
            i.Property(x => x.Status).HasConversion<int>();
            i.Property(x => x.WaivedByUserName).HasMaxLength(200);
            i.Property(x => x.WaiverReason).HasMaxLength(500);
            i.HasIndex(x => new { x.QarzanHasanaLoanId, x.InstallmentNo }).IsUnique();
            i.HasIndex(x => x.DueDate);
            i.HasIndex(x => x.Status);
        });
    }
}
