using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class CommitmentAgreementTemplateConfiguration : IEntityTypeConfiguration<CommitmentAgreementTemplate>
{
    public void Configure(EntityTypeBuilder<CommitmentAgreementTemplate> b)
    {
        b.ToTable("CommitmentAgreementTemplate", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Language).HasMaxLength(8).IsRequired();
        b.Property(x => x.BodyMarkdown).HasColumnType("nvarchar(max)").IsRequired();
        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.FundTypeId });
        b.HasOne<FundType>().WithMany().HasForeignKey(x => x.FundTypeId).OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class CommitmentConfiguration : IEntityTypeConfiguration<Commitment>
{
    public void Configure(EntityTypeBuilder<Commitment> b)
    {
        b.ToTable("Commitment", "txn");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.PartyType).HasConversion<int>();
        b.Property(x => x.PartyNameSnapshot).HasMaxLength(200).IsRequired();
        b.Property(x => x.FundNameSnapshot).HasMaxLength(200).IsRequired();
        b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        b.Property(x => x.TotalAmount).HasColumnType("decimal(18,2)");
        b.Property(x => x.PaidAmount).HasColumnType("decimal(18,2)");
        b.Property(x => x.Frequency).HasConversion<int>();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.Notes).HasMaxLength(2000);
        b.Property(x => x.Intention).HasConversion<int>().HasDefaultValue(Domain.Enums.ContributionIntention.Permanent);
        b.Property(x => x.AgreementText).HasColumnType("nvarchar(max)");
        b.Property(x => x.AgreementAcceptedByName).HasMaxLength(200);
        b.Property(x => x.AgreementAcceptedIpAddress).HasMaxLength(64);
        b.Property(x => x.AgreementAcceptedUserAgent).HasMaxLength(1024);
        b.Property(x => x.AgreementAcceptanceMethod).HasConversion<int?>();
        b.Property(x => x.CancellationReason).HasMaxLength(500);

        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.MemberId });
        b.HasIndex(x => new { x.TenantId, x.FamilyId });
        b.HasIndex(x => new { x.TenantId, x.FundTypeId });

        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Family>().WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<FundType>().WithMany().HasForeignKey(x => x.FundTypeId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<CommitmentAgreementTemplate>().WithMany().HasForeignKey(x => x.AgreementTemplateId).OnDelete(DeleteBehavior.SetNull);

        b.OwnsMany(x => x.Installments, ln =>
        {
            ln.ToTable("CommitmentInstallment", "txn");
            ln.WithOwner().HasForeignKey(x => x.CommitmentId);
            ln.HasKey(x => x.Id);
            ln.Property<Guid>("CommitmentId");
            ln.Property(x => x.ScheduledAmount).HasColumnType("decimal(18,2)");
            ln.Property(x => x.PaidAmount).HasColumnType("decimal(18,2)");
            ln.Property(x => x.Status).HasConversion<int>();
            ln.Property(x => x.WaivedByUserName).HasMaxLength(200);
            ln.Property(x => x.WaiverReason).HasMaxLength(500);
            ln.Property(x => x.Notes).HasMaxLength(500);
            ln.HasIndex("CommitmentId", nameof(CommitmentInstallment.InstallmentNo));
            ln.HasIndex(x => x.DueDate);
            ln.HasIndex(x => x.Status);
        });
    }
}
