using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

public sealed class BankAccount : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private BankAccount() { }

    public BankAccount(Guid id, Guid tenantId, string name, string bankName, string accountNumber, Guid? accountingAccountId = null)
    {
        Id = id;
        TenantId = tenantId;
        Name = name;
        BankName = bankName;
        AccountNumber = accountNumber;
        AccountingAccountId = accountingAccountId;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = default!;
    public string BankName { get; private set; } = default!;
    public string AccountNumber { get; private set; } = default!;
    public string? Branch { get; private set; }
    public string? Ifsc { get; private set; }
    public string? SwiftCode { get; private set; }
    public string Currency { get; private set; } = "INR";
    public Guid? AccountingAccountId { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string bankName, string accountNumber, string? branch, string? ifsc, string? swift, string currency, Guid? accountingAccountId, bool isActive)
    {
        Name = name;
        BankName = bankName;
        AccountNumber = accountNumber;
        Branch = branch;
        Ifsc = ifsc;
        SwiftCode = swift;
        Currency = currency;
        AccountingAccountId = accountingAccountId;
        IsActive = isActive;
    }
}
