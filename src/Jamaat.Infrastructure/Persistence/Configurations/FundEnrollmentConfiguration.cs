using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class FundEnrollmentConfiguration : IEntityTypeConfiguration<FundEnrollment>
{
    public void Configure(EntityTypeBuilder<FundEnrollment> b)
    {
        b.ToTable("FundEnrollment", "txn");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.SubType).HasMaxLength(64);
        b.Property(x => x.Recurrence).HasConversion<int>();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.ApprovedByUserName).HasMaxLength(200);
        b.Property(x => x.Notes).HasMaxLength(2000);

        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.MemberId, x.FundTypeId });
        b.HasIndex(x => new { x.TenantId, x.Status });

        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<FundType>().WithMany().HasForeignKey(x => x.FundTypeId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Family>().WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.NoAction);
    }
}
