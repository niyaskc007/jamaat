using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class FinancialPeriodConfiguration : IEntityTypeConfiguration<FinancialPeriod>
{
    public void Configure(EntityTypeBuilder<FinancialPeriod> b)
    {
        b.ToTable("FinancialPeriod", "acc");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.ClosedByUserName).HasMaxLength(200);
        b.HasIndex(x => new { x.TenantId, x.StartDate, x.EndDate });
        b.HasIndex(x => new { x.TenantId, x.Name }).IsUnique();
    }
}
