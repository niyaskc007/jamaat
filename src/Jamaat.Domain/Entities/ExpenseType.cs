using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

public sealed class ExpenseType : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private ExpenseType() { }

    public ExpenseType(Guid id, Guid tenantId, string code, string name)
    {
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        Name = name;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public string? Description { get; private set; }
    public Guid? DebitAccountId { get; private set; }
    public bool RequiresApproval { get; private set; }
    public decimal? ApprovalThreshold { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string? description, Guid? debitAccountId, bool requiresApproval, decimal? approvalThreshold, bool isActive)
    {
        Name = name;
        Description = description;
        DebitAccountId = debitAccountId;
        RequiresApproval = requiresApproval;
        ApprovalThreshold = approvalThreshold;
        IsActive = isActive;
    }
}
