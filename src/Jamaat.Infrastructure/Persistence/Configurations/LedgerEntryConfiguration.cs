using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class LedgerEntryConfiguration : IEntityTypeConfiguration<LedgerEntry>
{
    public void Configure(EntityTypeBuilder<LedgerEntry> b)
    {
        b.ToTable("LedgerEntry", "acc");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedOnAdd();
        b.Property(x => x.SourceType).HasConversion<int>();
        b.Property(x => x.SourceReference).HasMaxLength(64).IsRequired();
        b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        b.Property(x => x.Narration).HasMaxLength(500);
        b.Property(x => x.Debit).HasColumnType("decimal(18,2)");
        b.Property(x => x.Credit).HasColumnType("decimal(18,2)");

        b.HasIndex(x => new { x.TenantId, x.PostingDate });
        b.HasIndex(x => new { x.TenantId, x.AccountId, x.PostingDate });
        b.HasIndex(x => new { x.SourceType, x.SourceId });
        b.HasIndex(x => new { x.TenantId, x.FundTypeId, x.PostingDate });

        b.HasOne<Account>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<FinancialPeriod>().WithMany().HasForeignKey(x => x.FinancialPeriodId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<FundType>().WithMany().HasForeignKey(x => x.FundTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}
