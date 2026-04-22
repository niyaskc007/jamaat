using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class ErrorLogConfiguration : IEntityTypeConfiguration<ErrorLog>
{
    public void Configure(EntityTypeBuilder<ErrorLog> b)
    {
        b.ToTable("ErrorLog", "audit");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedOnAdd();

        b.Property(x => x.Source).HasConversion<int>();
        b.Property(x => x.Severity).HasConversion<int>();
        b.Property(x => x.Status).HasConversion<int>();

        b.Property(x => x.Message).HasMaxLength(2000).IsRequired();
        b.Property(x => x.ExceptionType).HasMaxLength(500);
        b.Property(x => x.StackTrace).HasColumnType("nvarchar(max)");
        b.Property(x => x.Endpoint).HasMaxLength(500);
        b.Property(x => x.HttpMethod).HasMaxLength(16);
        b.Property(x => x.CorrelationId).HasMaxLength(64);
        b.Property(x => x.UserName).HasMaxLength(200);
        b.Property(x => x.UserRole).HasMaxLength(100);
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.Property(x => x.UserAgent).HasMaxLength(500);
        b.Property(x => x.Fingerprint).HasMaxLength(64).IsRequired();
        b.Property(x => x.ReviewedByUserName).HasMaxLength(200);
        b.Property(x => x.ResolvedByUserName).HasMaxLength(200);
        b.Property(x => x.ResolutionNote).HasMaxLength(2000);

        b.HasIndex(x => x.OccurredAtUtc);
        b.HasIndex(x => new { x.TenantId, x.OccurredAtUtc });
        b.HasIndex(x => new { x.Status, x.OccurredAtUtc });
        b.HasIndex(x => new { x.Severity, x.OccurredAtUtc });
        b.HasIndex(x => x.Fingerprint);
        b.HasIndex(x => x.CorrelationId);
    }
}
