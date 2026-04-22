using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class CurrencyConfiguration : IEntityTypeConfiguration<Currency>
{
    public void Configure(EntityTypeBuilder<Currency> b)
    {
        b.ToTable("Currency", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Code).HasMaxLength(3).IsRequired();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.Property(x => x.Symbol).HasMaxLength(8).IsRequired();
        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
    }
}

public sealed class ExchangeRateConfiguration : IEntityTypeConfiguration<ExchangeRate>
{
    public void Configure(EntityTypeBuilder<ExchangeRate> b)
    {
        b.ToTable("ExchangeRate", "cfg");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.FromCurrency).HasMaxLength(3).IsRequired();
        b.Property(x => x.ToCurrency).HasMaxLength(3).IsRequired();
        b.Property(x => x.Rate).HasColumnType("decimal(18,8)");
        b.Property(x => x.Source).HasMaxLength(100);
        b.HasIndex(x => new { x.TenantId, x.FromCurrency, x.ToCurrency, x.EffectiveFrom });
    }
}
