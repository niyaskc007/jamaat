using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// Chart-of-accounts entry. Parent/child tree; leaves only are used for postings.
public sealed class Account : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private Account() { }

    public Account(Guid id, Guid tenantId, string code, string name, AccountType type, Guid? parentId = null)
    {
        Id = id;
        TenantId = tenantId;
        Code = code;
        Name = name;
        Type = type;
        ParentId = parentId;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public AccountType Type { get; private set; }
    public Guid? ParentId { get; private set; }
    public bool IsControl { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void MarkControl() => IsControl = true;
    public void Deactivate() => IsActive = false;
}
