using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class UsageEventConfiguration : IEntityTypeConfiguration<UsageEvent>
{
    public void Configure(EntityTypeBuilder<UsageEvent> b)
    {
        b.ToTable("UsageEvents");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Kind).IsRequired().HasMaxLength(16);
        b.Property(x => x.Path).IsRequired().HasMaxLength(256);
        b.Property(x => x.Module).IsRequired().HasMaxLength(64);
        b.Property(x => x.Action).HasMaxLength(128);
        b.Property(x => x.HttpMethod).HasMaxLength(8);
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.Property(x => x.UserAgent).HasMaxLength(512);
        b.Property(x => x.OccurredAtUtc).IsRequired();

        // Two indexes:
        //  - (TenantId, OccurredAtUtc DESC) for the "recent activity" / per-tenant aggregations.
        //  - (Kind, Module, OccurredAtUtc) for top-pages-by-module-in-window queries.
        // Path is hot, but it's a varchar(256) so we don't index it directly; the analytics
        // service's GROUP BY Path on a 60-day window over an indexed (Module, OccurredAtUtc)
        // range scan is fast enough for the small row counts this app sees.
        b.HasIndex(x => new { x.TenantId, x.OccurredAtUtc });
        b.HasIndex(x => new { x.Kind, x.Module, x.OccurredAtUtc });
        b.HasIndex(x => new { x.UserId, x.OccurredAtUtc });
    }
}
