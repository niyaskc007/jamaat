using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class FundTypeCustomFieldConfiguration : IEntityTypeConfiguration<FundTypeCustomField>
{
    public void Configure(EntityTypeBuilder<FundTypeCustomField> b)
    {
        b.ToTable("FundTypeCustomField", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.FundTypeId).IsRequired();
        b.Property(x => x.FieldKey).HasMaxLength(64).IsRequired();
        b.Property(x => x.Label).HasMaxLength(200).IsRequired();
        b.Property(x => x.HelpText).HasMaxLength(500);
        b.Property(x => x.OptionsCsv).HasMaxLength(2000);
        b.Property(x => x.DefaultValue).HasMaxLength(500);
        b.Property(x => x.FieldType).HasConversion<int>();

        // Field key unique within (tenant, fundType) — different fund types can reuse the same key.
        b.HasIndex(x => new { x.TenantId, x.FundTypeId, x.FieldKey }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.FundTypeId, x.SortOrder });
    }
}
