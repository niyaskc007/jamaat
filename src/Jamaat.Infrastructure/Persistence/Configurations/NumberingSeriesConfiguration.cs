using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class NumberingSeriesConfiguration : IEntityTypeConfiguration<NumberingSeries>
{
    public void Configure(EntityTypeBuilder<NumberingSeries> b)
    {
        b.ToTable("NumberingSeries", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Scope).HasConversion<int>();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.Property(x => x.Prefix).HasMaxLength(32).IsRequired();
        b.HasIndex(x => new { x.TenantId, x.Scope, x.FundTypeId, x.Name }).IsUnique();
        b.HasOne<FundType>().WithMany().HasForeignKey(x => x.FundTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}
