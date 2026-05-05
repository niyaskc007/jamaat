using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class PushSubscriptionConfiguration : IEntityTypeConfiguration<PushSubscription>
{
    public void Configure(EntityTypeBuilder<PushSubscription> b)
    {
        b.ToTable("PushSubscription", "audit");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.UserId).IsRequired();
        // Endpoints from FCM/Mozilla/Apple can be quite long; keep the column generous.
        b.Property(x => x.Endpoint).HasMaxLength(2000).IsRequired();
        b.Property(x => x.P256dh).HasMaxLength(200).IsRequired();
        b.Property(x => x.Auth).HasMaxLength(200).IsRequired();
        b.Property(x => x.UserAgent).HasMaxLength(500);
        // Endpoint is unique - if a user re-subscribes the same browser, replace not duplicate.
        b.HasIndex(x => x.Endpoint).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.UserId });
        b.HasIndex(x => new { x.TenantId, x.MemberId });
    }
}
