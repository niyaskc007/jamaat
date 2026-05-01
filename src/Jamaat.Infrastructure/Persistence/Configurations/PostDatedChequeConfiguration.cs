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
        b.Property(x => x.Source).HasConversion<int>().IsRequired();
        b.Property(x => x.Notes).HasMaxLength(2000);
        b.Property(x => x.BounceReason).HasMaxLength(500);
        b.Property(x => x.CancellationReason).HasMaxLength(500);
        b.Ignore(x => x.IsTerminal);

        // CommitmentId is now nullable to make room for Receipt/Voucher-source PDCs that have
        // no commitment link. The pre-existing Commitment-source rows still satisfy the FK.
        b.HasOne<Commitment>().WithMany().HasForeignKey(x => x.CommitmentId).OnDelete(DeleteBehavior.Restrict);
        // MemberId likewise - Voucher-source PDCs paid to non-member vendors carry MemberId=null.
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        // New polymorphic source FKs. Restrict on delete: a PDC linked to a receipt or voucher
        // must be cancelled or cleared first, never silently dropped.
        b.HasOne<Receipt>().WithMany().HasForeignKey(x => x.SourceReceiptId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Voucher>().WithMany().HasForeignKey(x => x.SourceVoucherId).OnDelete(DeleteBehavior.Restrict);
        // CommitmentInstallment is owned by Commitment; we deliberately don't enforce a FK here
        // because it'd require a shadow shared link - the value is validated at the service layer.

        b.HasIndex(x => new { x.TenantId, x.CommitmentId });
        b.HasIndex(x => new { x.TenantId, x.SourceReceiptId });
        b.HasIndex(x => new { x.TenantId, x.SourceVoucherId });
        b.HasIndex(x => new { x.TenantId, x.Status, x.ChequeDate });
        b.HasIndex(x => new { x.TenantId, x.MemberId });
        b.HasIndex(x => new { x.TenantId, x.Source });
    }
}
