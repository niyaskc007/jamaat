using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class ExpenseTypeConfiguration : IEntityTypeConfiguration<ExpenseType>
{
    public void Configure(EntityTypeBuilder<ExpenseType> b)
    {
        b.ToTable("ExpenseType", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.Property(x => x.ApprovalThreshold).HasColumnType("decimal(18,2)");
        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasOne<Account>().WithMany().HasForeignKey(x => x.DebitAccountId).OnDelete(DeleteBehavior.Restrict);
    }
}
