using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class FundTypeConfiguration : IEntityTypeConfiguration<FundType>
{
    public void Configure(EntityTypeBuilder<FundType> b)
    {
        b.ToTable("FundType", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.NameEnglish).HasMaxLength(200).IsRequired();
        b.Property(x => x.NameArabic).HasMaxLength(200);
        b.Property(x => x.NameHindi).HasMaxLength(200);
        b.Property(x => x.NameUrdu).HasMaxLength(200);
        b.Property(x => x.Description).HasMaxLength(1000);
        b.Property(x => x.AllowedPaymentModes).HasConversion<int>();
        b.Property(x => x.Category).HasConversion<int>();
        b.Ignore(x => x.IsLoan); // computed from Category
        b.Property(x => x.RulesJson).HasColumnType("nvarchar(max)");

        // New batch-1 fund-management fields. FundCategoryId is nullable now; the migration backfills
        // it for every existing row, and a follow-up migration will tighten the constraint.
        b.Property(x => x.FundCategoryId);
        b.Property(x => x.FundSubCategoryId);
        b.Property(x => x.IsReturnable).HasDefaultValue(false);
        b.Property(x => x.RequiresAgreement).HasDefaultValue(false);
        b.Property(x => x.RequiresMaturityTracking).HasDefaultValue(false);
        b.Property(x => x.RequiresNiyyath).HasDefaultValue(false);
        // Batch-6: function-based funds attach to a specific Event.
        b.Property(x => x.EventId);
        b.HasIndex(x => new { x.TenantId, x.EventId });

        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Category });
        b.HasIndex(x => new { x.TenantId, x.FundCategoryId });
    }
}

public sealed class FundCategoryEntityConfiguration : IEntityTypeConfiguration<FundCategoryEntity>
{
    public void Configure(EntityTypeBuilder<FundCategoryEntity> b)
    {
        b.ToTable("FundCategory", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.Property(x => x.Kind).HasConversion<int>();
        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Kind });
    }
}

public sealed class FundSubCategoryConfiguration : IEntityTypeConfiguration<FundSubCategory>
{
    public void Configure(EntityTypeBuilder<FundSubCategory> b)
    {
        b.ToTable("FundSubCategory", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.FundCategoryId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(32).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        // Code unique within (tenant, parent category) - distinct categories can reuse the same code.
        b.HasIndex(x => new { x.TenantId, x.FundCategoryId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.FundCategoryId });
    }
}
