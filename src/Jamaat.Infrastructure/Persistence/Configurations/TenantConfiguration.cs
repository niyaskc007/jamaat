using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> b)
    {
        b.ToTable("Tenant", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.BaseCurrency).HasMaxLength(3);
        b.Property(x => x.Address).HasMaxLength(500);
        b.Property(x => x.Phone).HasMaxLength(32);
        b.Property(x => x.Email).HasMaxLength(200);
        b.Property(x => x.LogoPath).HasMaxLength(500);
        b.Property(x => x.JamiaatCode).HasMaxLength(32);
        b.Property(x => x.JamiaatName).HasMaxLength(200);
        b.HasIndex(x => x.Code).IsUnique();
        b.HasIndex(x => x.JamiaatCode);
    }
}
