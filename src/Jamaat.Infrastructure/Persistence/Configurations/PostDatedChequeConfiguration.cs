using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class PostDatedChequeConfiguration : IEntityTypeConfiguration<PostDatedCheque>
{
    public void Configure(EntityTypeBuilder<PostDatedCheque> b)
    {
        b.ToTable("PostDatedCheque", "txn");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.ChequeNumber).HasMaxLength(64).IsRequired();
        b.Property(x => x.DrawnOnBank).HasMaxLength(200).IsRequired();
        b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        b.Property(x => x.Amount).HasColumnType("decimal(18,2)");
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.Notes).HasMaxLength(2000);
        b.Property(x => x.BounceReason).HasMaxLength(500);
        b.Property(x => x.CancellationReason).HasMaxLength(500);
        b.Ignore(x => x.IsTerminal);

        b.HasOne<Commitment>().WithMany().HasForeignKey(x => x.CommitmentId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        // CommitmentInstallment is owned by Commitment; we deliberately don't enforce a FK here
        // because it'd require a shadow shared link — the value is validated at the service layer.

        b.HasIndex(x => new { x.TenantId, x.CommitmentId });
        b.HasIndex(x => new { x.TenantId, x.Status, x.ChequeDate });
        b.HasIndex(x => new { x.TenantId, x.MemberId });
    }
}
