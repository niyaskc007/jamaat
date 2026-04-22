namespace Jamaat.Application.Accounting;

public interface IFxConverter
{
    /// <summary>
    /// Converts an amount from <paramref name="fromCurrency"/> to the tenant's base currency,
    /// using the exchange rate active on <paramref name="asOf"/>. Returns the rate used so it
    /// can be stored on the source document for traceability.
    /// </summary>
    Task<FxConversion> ConvertToBaseAsync(decimal amount, string fromCurrency, DateOnly asOf, CancellationToken ct = default);

    /// <summary>Looks up the tenant's base currency code (e.g. "AED").</summary>
    Task<string> GetBaseCurrencyAsync(CancellationToken ct = default);
}

public sealed record FxConversion(decimal OriginalAmount, string OriginalCurrency, decimal Rate, decimal BaseAmount, string BaseCurrency);
