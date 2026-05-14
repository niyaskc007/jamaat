using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class QhSchemeConfiguration : IEntityTypeConfiguration<QhScheme>
{
    public void Configure(EntityTypeBuilder<QhScheme> b)
    {
        // Lives in the `cfg` schema next to FundType / FundCategory - it's master-data,
        // not transactional, and the schema split keeps the DB layout readable.
        b.ToTable("QhScheme", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.Property(x => x.RequiresGoldCollateral).HasDefaultValue(false);
        b.Property(x => x.SortOrder).HasDefaultValue(0);
        b.Property(x => x.IsActive).HasDefaultValue(true);
        b.Property(x => x.LegacySchemeValue).HasDefaultValue(0);

        // Code is unique within (TenantId, ParentSchemeId) so parent + each
        // child can use intuitive short codes ("MOH" parent, "MOH-GOLD" child,
        // or just "GOLD" reused under different parents).
        b.HasIndex(x => new { x.TenantId, x.ParentSchemeId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.IsActive, x.SortOrder });

        // Self-referencing FK for parent/child hierarchy. Restrict prevents
        // a category being deleted while subcategories exist - admin must
        // unparent or delete the children first.
        b.HasOne<QhScheme>()
            .WithMany()
            .HasForeignKey(x => x.ParentSchemeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Tenant query filter is applied globally for ITenantScoped entities
        // via JamaatDbContext.ApplyTenantFilter (see DbContext.cs:99).
    }
}
