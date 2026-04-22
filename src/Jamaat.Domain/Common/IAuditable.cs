namespace Jamaat.Domain.Common;

public interface IAuditable
{
    DateTimeOffset CreatedAtUtc { get; }
    Guid? CreatedByUserId { get; }
    DateTimeOffset? UpdatedAtUtc { get; }
    Guid? UpdatedByUserId { get; }
}

public interface ISoftDeletable
{
    bool IsDeleted { get; }
    DateTimeOffset? DeletedAtUtc { get; }
    Guid? DeletedByUserId { get; }
}
