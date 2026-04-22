using Jamaat.Application.Persistence;
using Jamaat.Domain.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Accounting;

public sealed class FxConverter(JamaatDbContextFacade db, ITenantContext tenant) : IFxConverter
{
    public async Task<string> GetBaseCurrencyAsync(CancellationToken ct = default)
    {
        // Prefer the Currency marked base; fall back to the tenant's BaseCurrency field
        var baseCur = await db.Currencies.AsNoTracking().FirstOrDefaultAsync(c => c.IsBase, ct);
        if (baseCur is not null) return baseCur.Code;
        var t = await db.Tenants.AsNoTracking().IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == tenant.TenantId, ct);
        return t?.BaseCurrency ?? "AED";
    }

    public async Task<FxConversion> ConvertToBaseAsync(decimal amount, string fromCurrency, DateOnly asOf, CancellationToken ct = default)
    {
        var baseCurrency = await GetBaseCurrencyAsync(ct);
        var from = fromCurrency.ToUpperInvariant();
        var to = baseCurrency.ToUpperInvariant();

        if (from == to) return new FxConversion(amount, from, 1m, amount, to);

        // Direct rate from → to
        var direct = await db.ExchangeRates.AsNoTracking()
            .Where(r => r.IsActive && r.FromCurrency == from && r.ToCurrency == to
                     && r.EffectiveFrom <= asOf && (r.EffectiveTo == null || r.EffectiveTo >= asOf))
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync(ct);
        if (direct is not null)
        {
            var converted = Math.Round(amount * direct.Rate, 2, MidpointRounding.AwayFromZero);
            return new FxConversion(amount, from, direct.Rate, converted, to);
        }

        // Inverse rate to → from: use 1/rate
        var inverse = await db.ExchangeRates.AsNoTracking()
            .Where(r => r.IsActive && r.FromCurrency == to && r.ToCurrency == from
                     && r.EffectiveFrom <= asOf && (r.EffectiveTo == null || r.EffectiveTo >= asOf))
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync(ct);
        if (inverse is not null && inverse.Rate > 0)
        {
            var rate = Math.Round(1m / inverse.Rate, 8, MidpointRounding.AwayFromZero);
            var converted = Math.Round(amount * rate, 2, MidpointRounding.AwayFromZero);
            return new FxConversion(amount, from, rate, converted, to);
        }

        throw new InvalidOperationException($"No active exchange rate found for {from} → {to} on {asOf:yyyy-MM-dd}.");
    }
}
