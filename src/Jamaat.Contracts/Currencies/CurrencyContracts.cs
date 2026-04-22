namespace Jamaat.Contracts.Currencies;

public sealed record CurrencyDto(Guid Id, string Code, string Name, string Symbol, int DecimalPlaces, bool IsActive, bool IsBase);

public sealed record CreateCurrencyDto(string Code, string Name, string Symbol, int DecimalPlaces);

public sealed record UpdateCurrencyDto(string Name, string Symbol, int DecimalPlaces, bool IsActive);

public sealed record ExchangeRateDto(
    Guid Id, string FromCurrency, string ToCurrency, decimal Rate,
    DateOnly EffectiveFrom, DateOnly? EffectiveTo, string? Source, bool IsActive);

public sealed record CreateExchangeRateDto(
    string FromCurrency, string ToCurrency, decimal Rate,
    DateOnly EffectiveFrom, DateOnly? EffectiveTo, string? Source);

public sealed record UpdateExchangeRateDto(
    decimal Rate, DateOnly EffectiveFrom, DateOnly? EffectiveTo, string? Source, bool IsActive);

public sealed record FxConversionDto(decimal OriginalAmount, string OriginalCurrency, decimal Rate, decimal BaseAmount, string BaseCurrency);
