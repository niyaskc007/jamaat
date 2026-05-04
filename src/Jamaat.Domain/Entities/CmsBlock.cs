using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// Short named content snippet (e.g. "login.hero.title", "login.feature.1"). Used for
/// targeted text overrides within hardcoded layouts - the login page renders an unchanging
/// React structure but pulls its strings from CmsBlocks. Global, no tenant.
public sealed class CmsBlock : AggregateRoot<Guid>, IAuditable
{
    private CmsBlock() { }

    public CmsBlock(Guid id, string key, string value)
    {
        Id = id;
        Key = key.Trim().ToLowerInvariant();
        Value = value;
    }

    public string Key { get; private set; } = default!;
    public string Value { get; private set; } = default!;

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string value) => Value = value;
}
