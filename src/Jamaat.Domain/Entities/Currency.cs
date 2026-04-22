using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

public sealed class Currency : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private Currency() { }

    public Currency(Guid id, Guid tenantId, string code, string name, string symbol, int decimalPlaces)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length != 3)
            throw new ArgumentException("Currency code must be a 3-letter ISO code.", nameof(code));
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        Name = name;
        Symbol = symbol;
        DecimalPlaces = decimalPlaces;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public string Symbol { get; private set; } = default!;
    public int DecimalPlaces { get; private set; } = 2;
    public bool IsActive { get; private set; }
    public bool IsBase { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string symbol, int decimalPlaces, bool isActive)
    {
        Name = name;
        Symbol = symbol;
        DecimalPlaces = decimalPlaces;
        IsActive = isActive;
    }

    public void MarkBase() => IsBase = true;
    public void UnmarkBase() => IsBase = false;
}
