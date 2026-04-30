using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class QarzanHasanaGuarantorConsentConfiguration : IEntityTypeConfiguration<QarzanHasanaGuarantorConsent>
{
    public void Configure(EntityTypeBuilder<QarzanHasanaGuarantorConsent> b)
    {
        b.ToTable("QarzanHasanaGuarantorConsent", "txn");
        b.HasKey(x => x.Id);

        b.Property(x => x.Token).HasMaxLength(64).IsRequired();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.ResponderIpAddress).HasMaxLength(64);
        b.Property(x => x.ResponderUserAgent).HasMaxLength(500);

        // Token is the public-facing credential; it must be unique tenant-wide so the portal
        // can resolve a request to exactly one consent row regardless of who's looking it up.
        b.HasIndex(x => x.Token).IsUnique();
        b.HasIndex(x => new { x.LoanId, x.GuarantorMemberId }).IsUnique();
        b.HasIndex(x => x.Status);

        b.HasOne<QarzanHasanaLoan>().WithMany().HasForeignKey(x => x.LoanId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.GuarantorMemberId).OnDelete(DeleteBehavior.NoAction);
    }
}
