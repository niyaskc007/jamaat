using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class OrganisationConfiguration : IEntityTypeConfiguration<Organisation>
{
    public void Configure(EntityTypeBuilder<Organisation> b)
    {
        b.ToTable("Organisation", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.NameArabic).HasMaxLength(200);
        b.Property(x => x.Category).HasMaxLength(100);
        b.Property(x => x.Notes).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Name });
    }
}

public sealed class MemberOrganisationMembershipConfiguration : IEntityTypeConfiguration<MemberOrganisationMembership>
{
    public void Configure(EntityTypeBuilder<MemberOrganisationMembership> b)
    {
        b.ToTable("MemberOrganisationMembership", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Role).HasMaxLength(100).IsRequired();
        b.Property(x => x.Notes).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.MemberId });
        b.HasIndex(x => new { x.TenantId, x.OrganisationId });
        b.HasIndex(x => new { x.TenantId, x.MemberId, x.OrganisationId, x.Role }).IsUnique();

        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Organisation>().WithMany().HasForeignKey(x => x.OrganisationId).OnDelete(DeleteBehavior.Cascade);
    }
}
