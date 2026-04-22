using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class BankAccountConfiguration : IEntityTypeConfiguration<BankAccount>
{
    public void Configure(EntityTypeBuilder<BankAccount> b)
    {
        b.ToTable("BankAccount", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.BankName).HasMaxLength(200).IsRequired();
        b.Property(x => x.AccountNumber).HasMaxLength(64).IsRequired();
        b.Property(x => x.Branch).HasMaxLength(200);
        b.Property(x => x.Ifsc).HasMaxLength(32);
        b.Property(x => x.SwiftCode).HasMaxLength(32);
        b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        b.HasIndex(x => new { x.TenantId, x.AccountNumber }).IsUnique();
        b.HasOne<Account>().WithMany().HasForeignKey(x => x.AccountingAccountId).OnDelete(DeleteBehavior.Restrict);
    }
}
