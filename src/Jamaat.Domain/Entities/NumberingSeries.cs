using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// Generates sequential numbers for Receipts / Vouchers / Journals.
/// When assigning a number, the generator must take a SQL UPDLOCK on the row in
/// the same transaction to avoid gaps or dupes under concurrency.
public sealed class NumberingSeries : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private NumberingSeries() { }

    public NumberingSeries(
        Guid id, Guid tenantId, NumberingScope scope, string name, string prefix, int padLength, bool yearReset,
        Guid? fundTypeId = null)
    {
        Id = id;
        TenantId = tenantId;
        Scope = scope;
        Name = name;
        Prefix = prefix;
        PadLength = padLength;
        YearReset = yearReset;
        FundTypeId = fundTypeId;
        CurrentValue = 0;
        CurrentYear = DateTime.UtcNow.Year;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public NumberingScope Scope { get; private set; }
    public string Name { get; private set; } = default!;
    public Guid? FundTypeId { get; private set; }
    public string Prefix { get; private set; } = default!;
    public int PadLength { get; private set; }
    public bool YearReset { get; private set; }
    public long CurrentValue { get; private set; }
    public int CurrentYear { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string prefix, int padLength, bool yearReset, bool isActive)
    {
        Name = name;
        Prefix = prefix;
        PadLength = padLength;
        YearReset = yearReset;
        IsActive = isActive;
    }
}
