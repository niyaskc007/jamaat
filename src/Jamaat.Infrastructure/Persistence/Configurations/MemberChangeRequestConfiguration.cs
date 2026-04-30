using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class MemberChangeRequestConfiguration : IEntityTypeConfiguration<MemberChangeRequest>
{
    public void Configure(EntityTypeBuilder<MemberChangeRequest> b)
    {
        b.ToTable("MemberChangeRequest", "audit");
        b.HasKey(x => x.Id);
        b.Property(x => x.Section).HasMaxLength(50).IsRequired();
        b.Property(x => x.PayloadJson).HasColumnType("nvarchar(max)").IsRequired();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.RequestedByUserName).HasMaxLength(200).IsRequired();
        b.Property(x => x.ReviewedByUserName).HasMaxLength(200);
        b.Property(x => x.ReviewerNote).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.Status, x.RequestedAtUtc });
        b.HasIndex(x => new { x.TenantId, x.MemberId, x.Status });

        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Cascade);
    }
}
