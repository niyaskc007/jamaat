using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

public sealed class FinancialPeriod : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private FinancialPeriod() { }

    public FinancialPeriod(Guid id, Guid tenantId, string name, DateOnly startDate, DateOnly endDate)
    {
        if (endDate < startDate) throw new ArgumentException("End date must be on or after start date.");
        Id = id;
        TenantId = tenantId;
        Name = name;
        StartDate = startDate;
        EndDate = endDate;
        Status = PeriodStatus.Open;
    }

    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = default!;
    public DateOnly StartDate { get; private set; }
    public DateOnly EndDate { get; private set; }
    public PeriodStatus Status { get; private set; }
    public DateTimeOffset? ClosedAtUtc { get; private set; }
    public Guid? ClosedByUserId { get; private set; }
    public string? ClosedByUserName { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public bool Contains(DateOnly date) => date >= StartDate && date <= EndDate;

    public void Close(Guid userId, string userName, DateTimeOffset at)
    {
        if (Status == PeriodStatus.Closed) return;
        Status = PeriodStatus.Closed;
        ClosedAtUtc = at;
        ClosedByUserId = userId;
        ClosedByUserName = userName;
    }

    public void Reopen()
    {
        Status = PeriodStatus.Open;
        ClosedAtUtc = null;
        ClosedByUserId = null;
        ClosedByUserName = null;
    }
}
