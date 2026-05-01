using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class FamilyMemberLinkConfiguration : IEntityTypeConfiguration<FamilyMemberLink>
{
    public void Configure(EntityTypeBuilder<FamilyMemberLink> b)
    {
        b.ToTable("FamilyMemberLink", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Role).HasConversion<int>().IsRequired();

        // Cascade-restrict on both sides: removing a family or member should require the
        // operator to clear the links explicitly. Silent cascade would orphan audit history.
        b.HasOne<Family>().WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);

        // A given (Family, Member) pair only ever has one role at a time - "Saifee is uncle"
        // can't simultaneously be "Saifee is brother" of the same family. ChangeRole() updates
        // the existing row; insert-then-conflict gets a clean unique-violation rather than a
        // dupe row.
        b.HasIndex(x => new { x.TenantId, x.FamilyId, x.MemberId }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.FamilyId });
        b.HasIndex(x => new { x.TenantId, x.MemberId });
    }
}
