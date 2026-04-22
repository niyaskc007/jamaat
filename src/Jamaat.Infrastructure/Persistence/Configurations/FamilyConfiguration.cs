using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class FamilyConfiguration : IEntityTypeConfiguration<Family>
{
    public void Configure(EntityTypeBuilder<Family> b)
    {
        b.ToTable("Family", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.TanzeemFileNo).HasMaxLength(32);
        b.Property(x => x.FamilyItsNumber).HasMaxLength(8);
        b.Property(x => x.FamilyName).HasMaxLength(200).IsRequired();
        b.Property(x => x.HeadItsNumber).HasMaxLength(8);
        b.Property(x => x.ContactPhone).HasMaxLength(32);
        b.Property(x => x.ContactEmail).HasMaxLength(200);
        b.Property(x => x.Address).HasMaxLength(500);
        b.Property(x => x.Notes).HasMaxLength(2000);
        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        // TanzeemFileNo is globally unique across the deployment (per answer to Q8).
        b.HasIndex(x => x.TanzeemFileNo).IsUnique().HasFilter("[TanzeemFileNo] IS NOT NULL");
        b.HasIndex(x => new { x.TenantId, x.FamilyName });
    }
}
