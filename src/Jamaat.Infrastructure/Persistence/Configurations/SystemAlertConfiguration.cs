using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class SystemAlertConfiguration : IEntityTypeConfiguration<SystemAlert>
{
    public void Configure(EntityTypeBuilder<SystemAlert> b)
    {
        b.ToTable("SystemAlerts");
        b.HasKey(x => x.Id);
        b.Property(x => x.Fingerprint).IsRequired().HasMaxLength(128);
        b.Property(x => x.Kind).IsRequired().HasMaxLength(64);
        b.Property(x => x.Severity).IsRequired().HasMaxLength(16);
        b.Property(x => x.Title).IsRequired().HasMaxLength(256);
        b.Property(x => x.Detail).IsRequired().HasMaxLength(4000);
        b.Property(x => x.FirstSeenAtUtc).IsRequired();
        b.Property(x => x.LastSeenAtUtc).IsRequired();
        b.Property(x => x.RepeatCount).IsRequired();
        b.Property(x => x.RecipientCount).IsRequired();
        b.Property(x => x.Acknowledged).IsRequired();

        // The evaluator looks up the most-recent alert per fingerprint to decide repeat-vs-new;
        // covering index keeps that read fast even on a long alert history.
        b.HasIndex(x => new { x.Fingerprint, x.LastSeenAtUtc });
        b.HasIndex(x => x.LastSeenAtUtc);
    }
}
