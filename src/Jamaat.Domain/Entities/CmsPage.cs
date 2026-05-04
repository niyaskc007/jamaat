using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// Standalone CMS page (Terms, Privacy, FAQ, etc). Global - not tenant-scoped - because
/// the login screen and public legal pages need to render before any auth/tenant context.
public sealed class CmsPage : AggregateRoot<Guid>, IAuditable
{
    private CmsPage() { }

    public CmsPage(Guid id, string slug, string title, string body, CmsPageSection section)
    {
        Id = id;
        Slug = slug.Trim().ToLowerInvariant();
        Title = title;
        Body = body;
        Section = section;
        IsPublished = false;
    }

    public string Slug { get; private set; } = default!;
    public string Title { get; private set; } = default!;
    public string Body { get; private set; } = default!;
    public CmsPageSection Section { get; private set; }
    public bool IsPublished { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string title, string body, CmsPageSection section, bool isPublished)
    {
        Title = title;
        Body = body;
        Section = section;
        IsPublished = isPublished;
    }
}

public enum CmsPageSection
{
    Legal = 0,
    Help = 1,
    Marketing = 2,
}
