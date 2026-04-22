using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class ReprintLogConfiguration : IEntityTypeConfiguration<ReprintLog>
{
    public void Configure(EntityTypeBuilder<ReprintLog> b)
    {
        b.ToTable("ReprintLog", "audit");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedOnAdd();
        b.Property(x => x.SourceType).HasMaxLength(32).IsRequired();
        b.Property(x => x.SourceReference).HasMaxLength(64).IsRequired();
        b.Property(x => x.UserName).HasMaxLength(200);
        b.Property(x => x.Reason).HasMaxLength(500);
        b.HasIndex(x => new { x.TenantId, x.AtUtc });
        b.HasIndex(x => new { x.SourceType, x.SourceId });
    }
}
