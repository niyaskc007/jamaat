using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class SystemAuditLogConfiguration : IEntityTypeConfiguration<SystemAuditLog>
{
    public void Configure(EntityTypeBuilder<SystemAuditLog> b)
    {
        b.ToTable("SystemAuditLog");
        b.HasKey(x => x.Id);
        b.Property(x => x.ActionKey).IsRequired().HasMaxLength(64);
        b.Property(x => x.Summary).IsRequired().HasMaxLength(256);
        b.Property(x => x.TargetRef).HasMaxLength(128);
        b.Property(x => x.DetailJson).HasMaxLength(4000);
        b.Property(x => x.UserName).IsRequired().HasMaxLength(256);
        b.Property(x => x.CorrelationId).HasMaxLength(64);
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.Property(x => x.UserAgent).HasMaxLength(512);
        b.Property(x => x.AtUtc).IsRequired();

        b.HasIndex(x => x.AtUtc);
        b.HasIndex(x => new { x.ActionKey, x.AtUtc });
        b.HasIndex(x => new { x.UserId, x.AtUtc });
    }
}
