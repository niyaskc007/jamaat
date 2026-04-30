using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class MemberEducationConfiguration : IEntityTypeConfiguration<MemberEducation>
{
    public void Configure(EntityTypeBuilder<MemberEducation> b)
    {
        b.ToTable("MemberEducation");
        b.HasKey(x => x.Id);
        b.Property(x => x.Level).HasConversion<int>();
        b.Property(x => x.Degree).HasMaxLength(200);
        b.Property(x => x.Institution).HasMaxLength(200);
        b.Property(x => x.Specialization).HasMaxLength(200);

        b.HasIndex(x => new { x.TenantId, x.MemberId });
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Cascade);
    }
}
