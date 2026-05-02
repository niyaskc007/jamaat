using Jamaat.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class LoginAttemptConfiguration : IEntityTypeConfiguration<LoginAttempt>
{
    public void Configure(EntityTypeBuilder<LoginAttempt> b)
    {
        b.ToTable("LoginAttempts");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Identifier).IsRequired().HasMaxLength(256);
        b.Property(x => x.AttemptedAtUtc).IsRequired();
        b.Property(x => x.Success).IsRequired();
        b.Property(x => x.FailureReason).HasMaxLength(128);
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.Property(x => x.UserAgent).HasMaxLength(512);
        b.Property(x => x.GeoCountry).HasMaxLength(64);
        b.Property(x => x.GeoCity).HasMaxLength(128);
        b.HasIndex(x => new { x.TenantId, x.AttemptedAtUtc });
        b.HasIndex(x => new { x.TenantId, x.UserId, x.AttemptedAtUtc });
    }
}
