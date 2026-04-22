using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class LookupConfiguration : IEntityTypeConfiguration<Lookup>
{
    public void Configure(EntityTypeBuilder<Lookup> b)
    {
        b.ToTable("Lookup", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Category).HasMaxLength(64).IsRequired();
        b.Property(x => x.Code).HasMaxLength(64).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.NameArabic).HasMaxLength(200);
        b.Property(x => x.Notes).HasMaxLength(500);

        b.HasIndex(x => new { x.TenantId, x.Category, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Category });
    }
}
