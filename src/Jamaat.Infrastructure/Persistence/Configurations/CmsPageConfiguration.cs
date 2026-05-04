using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class CmsPageConfiguration : IEntityTypeConfiguration<CmsPage>
{
    public void Configure(EntityTypeBuilder<CmsPage> b)
    {
        b.ToTable("CmsPage", "cms");
        b.HasKey(x => x.Id);
        b.Property(x => x.Slug).HasMaxLength(128).IsRequired();
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.Body).IsRequired();
        b.Property(x => x.Section).HasConversion<int>();
        b.HasIndex(x => x.Slug).IsUnique();
        b.HasIndex(x => new { x.Section, x.IsPublished });
    }
}
