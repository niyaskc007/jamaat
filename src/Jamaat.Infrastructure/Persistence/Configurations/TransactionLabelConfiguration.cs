using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class TransactionLabelConfiguration : IEntityTypeConfiguration<TransactionLabel>
{
    public void Configure(EntityTypeBuilder<TransactionLabel> b)
    {
        b.ToTable("TransactionLabel", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.LabelType).HasConversion<int>();
        b.Property(x => x.Label).HasMaxLength(200).IsRequired();
        b.Property(x => x.Notes).HasMaxLength(1000);
        // Unique on the lookup key so the resolver can use a single hit.
        b.HasIndex(x => new { x.TenantId, x.FundTypeId, x.LabelType }).IsUnique();
    }
}
