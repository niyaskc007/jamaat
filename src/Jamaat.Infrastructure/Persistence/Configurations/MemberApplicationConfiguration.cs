using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class MemberApplicationConfiguration : IEntityTypeConfiguration<MemberApplication>
{
    public void Configure(EntityTypeBuilder<MemberApplication> b)
    {
        b.ToTable("MemberApplication", "audit");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.FullName).HasMaxLength(200).IsRequired();
        b.Property(x => x.ItsNumber).HasMaxLength(8).IsRequired();
        b.Property(x => x.Email).HasMaxLength(200);
        b.Property(x => x.PhoneE164).HasMaxLength(32);
        b.Property(x => x.Notes).HasMaxLength(2000);
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.Property(x => x.UserAgent).HasMaxLength(500);
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.ReviewedByUserName).HasMaxLength(200);
        b.Property(x => x.ReviewerNote).HasMaxLength(2000);
        // One pending application per ITS at a time; resubmits after rejection are fine because
        // the unique filter excludes Rejected/Approved rows.
        b.HasIndex(x => new { x.TenantId, x.ItsNumber, x.Status })
            .HasFilter("[Status] = 1")
            .IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Status, x.CreatedAtUtc });
    }
}
