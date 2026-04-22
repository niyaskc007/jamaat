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
        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.Category });
    }
}
