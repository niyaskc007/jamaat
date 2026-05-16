using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class TransactionDeletionRequestConfiguration : IEntityTypeConfiguration<TransactionDeletionRequest>
{
    public void Configure(EntityTypeBuilder<TransactionDeletionRequest> b)
    {
        b.ToTable("TransactionDeletionRequest", "admin");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();

        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.TargetType).IsRequired();
        b.Property(x => x.TargetId).IsRequired();
        b.Property(x => x.TargetCode).HasMaxLength(64).IsRequired();
        b.Property(x => x.Reason).HasMaxLength(1000).IsRequired();
        b.Property(x => x.Status).IsRequired();

        b.Property(x => x.RequesterUserName).HasMaxLength(200).IsRequired();
        b.Property(x => x.ApproverUserName).HasMaxLength(200);
        b.Property(x => x.DecisionNote).HasMaxLength(1000);

        // Used by the inbox queries (list pending for tenant) and the "is there already a pending
        // request for this target?" guard at request-creation time.
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.TargetType, x.TargetId, x.Status });
        b.HasIndex(x => x.ExpiresAtUtc);
    }
}
