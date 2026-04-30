using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class MemberBehaviorSnapshotConfiguration : IEntityTypeConfiguration<MemberBehaviorSnapshot>
{
    public void Configure(EntityTypeBuilder<MemberBehaviorSnapshot> b)
    {
        b.ToTable("MemberBehaviorSnapshot", "behavior");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedOnAdd();

        b.Property(x => x.Grade).HasMaxLength(16).IsRequired();
        b.Property(x => x.TotalScore).HasColumnType("decimal(5,2)");
        b.Property(x => x.DimensionsJson).HasColumnType("nvarchar(max)").IsRequired();
        b.Property(x => x.LapsesJson).HasColumnType("nvarchar(max)").IsRequired();
        b.Property(x => x.LoanReadyReason).HasMaxLength(500);

        // One snapshot per (tenant, member). We upsert in place; the AuditInterceptor
        // captures a Modified row each recompute so the history is preserved in AuditLog.
        b.HasIndex(x => new { x.TenantId, x.MemberId }).IsUnique();
        b.HasIndex(x => x.ComputedAtUtc);
        b.HasIndex(x => x.Grade);
    }
}
