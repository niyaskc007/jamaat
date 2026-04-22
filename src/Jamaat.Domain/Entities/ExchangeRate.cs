using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// Effective-dated exchange rate from FromCurrency → ToCurrency.
/// Typical use: look up the rate active on a given transaction date.
/// </summary>
public sealed class ExchangeRate : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private ExchangeRate() { }

    public ExchangeRate(
        Guid id,
        Guid tenantId,
        string fromCurrency,
        string toCurrency,
        decimal rate,
        DateOnly effectiveFrom,
        DateOnly? effectiveTo,
        string? source)
    {
        if (rate <= 0) throw new ArgumentException("Rate must be greater than zero.", nameof(rate));
        Id = id;
        TenantId = tenantId;
        FromCurrency = fromCurrency.ToUpperInvariant();
        ToCurrency = toCurrency.ToUpperInvariant();
        Rate = rate;
        EffectiveFrom = effectiveFrom;
        EffectiveTo = effectiveTo;
        Source = source;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string FromCurrency { get; private set; } = default!;
    public string ToCurrency { get; private set; } = default!;
    public decimal Rate { get; private set; }
    public DateOnly EffectiveFrom { get; private set; }
    public DateOnly? EffectiveTo { get; private set; }
    public string? Source { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public bool CoversDate(DateOnly date) =>
        date >= EffectiveFrom && (EffectiveTo is null || date <= EffectiveTo);

    public void Update(decimal rate, DateOnly effectiveFrom, DateOnly? effectiveTo, string? source, bool isActive)
    {
        if (rate <= 0) throw new ArgumentException("Rate must be greater than zero.", nameof(rate));
        Rate = rate;
        EffectiveFrom = effectiveFrom;
        EffectiveTo = effectiveTo;
        Source = source;
        IsActive = isActive;
    }
}
