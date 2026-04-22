using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class SectorConfiguration : IEntityTypeConfiguration<Sector>
{
    public void Configure(EntityTypeBuilder<Sector> b)
    {
        b.ToTable("Sector", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Notes).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Name });

        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MaleInchargeMemberId).OnDelete(DeleteBehavior.NoAction);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.FemaleInchargeMemberId).OnDelete(DeleteBehavior.NoAction);
    }
}

public sealed class SubSectorConfiguration : IEntityTypeConfiguration<SubSector>
{
    public void Configure(EntityTypeBuilder<SubSector> b)
    {
        b.ToTable("SubSector", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Notes).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.SectorId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.SectorId });

        b.HasOne<Sector>().WithMany().HasForeignKey(x => x.SectorId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MaleInchargeMemberId).OnDelete(DeleteBehavior.NoAction);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.FemaleInchargeMemberId).OnDelete(DeleteBehavior.NoAction);
    }
}
