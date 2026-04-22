using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b)
    {
        b.ToTable("AuditLog", "audit");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedOnAdd();
        b.Property(x => x.UserName).HasMaxLength(200).IsRequired();
        b.Property(x => x.CorrelationId).HasMaxLength(64).IsRequired();
        b.Property(x => x.Action).HasMaxLength(32).IsRequired();
        b.Property(x => x.EntityName).HasMaxLength(200).IsRequired();
        b.Property(x => x.EntityId).HasMaxLength(100).IsRequired();
        b.Property(x => x.Screen).HasMaxLength(100);
        b.Property(x => x.BeforeJson).HasColumnType("nvarchar(max)");
        b.Property(x => x.AfterJson).HasColumnType("nvarchar(max)");
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.Property(x => x.UserAgent).HasMaxLength(500);
        b.HasIndex(x => x.AtUtc);
        b.HasIndex(x => new { x.TenantId, x.AtUtc });
        b.HasIndex(x => new { x.EntityName, x.EntityId });
        b.HasIndex(x => x.CorrelationId);
    }
}
