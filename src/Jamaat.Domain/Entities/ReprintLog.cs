using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

public sealed class ReprintLog : Entity<long>, ITenantScoped
{
    private ReprintLog() { }

    public ReprintLog(Guid tenantId, string sourceType, Guid sourceId, string sourceReference, Guid? userId, string? userName, string? reason, DateTimeOffset at)
    {
        TenantId = tenantId;
        SourceType = sourceType;
        SourceId = sourceId;
        SourceReference = sourceReference;
        UserId = userId;
        UserName = userName;
        Reason = reason;
        AtUtc = at;
    }

    public Guid TenantId { get; private set; }
    public string SourceType { get; private set; } = default!;
    public Guid SourceId { get; private set; }
    public string SourceReference { get; private set; } = default!;
    public Guid? UserId { get; private set; }
    public string? UserName { get; private set; }
    public string? Reason { get; private set; }
    public DateTimeOffset AtUtc { get; private set; }
}
