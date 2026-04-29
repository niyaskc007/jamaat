using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class NotificationLogConfiguration : IEntityTypeConfiguration<NotificationLog>
{
    public void Configure(EntityTypeBuilder<NotificationLog> b)
    {
        b.ToTable("NotificationLog", "log");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedOnAdd();
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Kind).HasConversion<int>();
        b.Property(x => x.Channel).HasConversion<int>();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.Subject).HasMaxLength(500).IsRequired();
        b.Property(x => x.Body).HasColumnType("nvarchar(max)").IsRequired();
        b.Property(x => x.Recipient).HasMaxLength(320); // longest valid email
        b.Property(x => x.SourceReference).HasMaxLength(64);
        b.Property(x => x.FailureReason).HasMaxLength(2000);

        b.HasIndex(x => new { x.TenantId, x.AttemptedAtUtc });
        b.HasIndex(x => new { x.TenantId, x.Kind, x.Status });
        b.HasIndex(x => x.SourceId).HasFilter("[SourceId] IS NOT NULL");
    }
}
