using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class VoucherConfiguration : IEntityTypeConfiguration<Voucher>
{
    public void Configure(EntityTypeBuilder<Voucher> b)
    {
        b.ToTable("Voucher", "txn");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.VoucherNumber).HasMaxLength(32);
        b.Property(x => x.PayTo).HasMaxLength(200).IsRequired();
        b.Property(x => x.PayeeItsNumber).HasMaxLength(8);
        b.Property(x => x.Purpose).HasMaxLength(1000);
        b.Property(x => x.AmountTotal).HasColumnType("decimal(18,2)");
        b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        b.Property(x => x.FxRate).HasColumnType("decimal(18,8)");
        b.Property(x => x.BaseCurrency).HasMaxLength(3).IsRequired();
        b.Property(x => x.BaseAmountTotal).HasColumnType("decimal(18,2)");
        b.Property(x => x.PaymentMode).HasConversion<int>();
        b.Property(x => x.ChequeNumber).HasMaxLength(64);
        b.Property(x => x.DrawnOnBank).HasMaxLength(200);
        b.Property(x => x.Remarks).HasMaxLength(1000);
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.ApprovedByUserName).HasMaxLength(200);
        b.Property(x => x.PaidByUserName).HasMaxLength(200);
        b.Property(x => x.CancellationReason).HasMaxLength(500);
        b.Property(x => x.ReversalReason).HasMaxLength(500);

        b.HasIndex(x => new { x.TenantId, x.VoucherNumber }).IsUnique().HasFilter("[VoucherNumber] IS NOT NULL");
        b.HasIndex(x => new { x.TenantId, x.VoucherDate });
        b.HasIndex(x => new { x.TenantId, x.Status });

        b.HasOne<BankAccount>().WithMany().HasForeignKey(x => x.BankAccountId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<FinancialPeriod>().WithMany().HasForeignKey(x => x.FinancialPeriodId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<NumberingSeries>().WithMany().HasForeignKey(x => x.NumberingSeriesId).OnDelete(DeleteBehavior.Restrict);

        b.OwnsMany(x => x.Lines, ln =>
        {
            ln.ToTable("VoucherLine", "txn");
            ln.WithOwner().HasForeignKey(x => x.VoucherId);
            ln.HasKey(x => x.Id);
            ln.Property<Guid>("VoucherId");
            ln.Property(x => x.Narration).HasMaxLength(500);
            ln.Property(x => x.Amount).HasColumnType("decimal(18,2)");
            ln.HasOne<ExpenseType>().WithMany().HasForeignKey(x => x.ExpenseTypeId).OnDelete(DeleteBehavior.Restrict);
            ln.HasIndex("VoucherId", nameof(VoucherLine.LineNo));
        });
    }
}
