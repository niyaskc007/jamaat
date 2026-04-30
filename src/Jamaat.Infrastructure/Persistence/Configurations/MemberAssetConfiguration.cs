using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class MemberAssetConfiguration : IEntityTypeConfiguration<MemberAsset>
{
    public void Configure(EntityTypeBuilder<MemberAsset> b)
    {
        b.ToTable("MemberAsset");
        b.HasKey(x => x.Id);
        b.Property(x => x.Kind).HasConversion<int>();
        b.Property(x => x.Description).HasMaxLength(500).IsRequired();
        b.Property(x => x.EstimatedValue).HasColumnType("decimal(18,2)");
        b.Property(x => x.Currency).HasMaxLength(3);
        b.Property(x => x.Notes).HasMaxLength(1000);
        b.Property(x => x.DocumentUrl).HasMaxLength(500);

        b.HasIndex(x => new { x.TenantId, x.MemberId });
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Cascade);
    }
}
