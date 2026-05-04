using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class CmsBlockConfiguration : IEntityTypeConfiguration<CmsBlock>
{
    public void Configure(EntityTypeBuilder<CmsBlock> b)
    {
        b.ToTable("CmsBlock", "cms");
        b.HasKey(x => x.Id);
        b.Property(x => x.Key).HasMaxLength(128).IsRequired();
        b.Property(x => x.Value).IsRequired();
        b.HasIndex(x => x.Key).IsUnique();
    }
}
