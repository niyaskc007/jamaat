namespace Jamaat.Contracts.Cms;

public enum CmsPageSectionDto
{
    Legal = 0,
    Help = 1,
    Marketing = 2,
}

public sealed record CmsPageDto(
    Guid Id,
    string Slug,
    string Title,
    string Body,
    CmsPageSectionDto Section,
    bool IsPublished,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? UpdatedAtUtc);

public sealed record CmsPageListItemDto(
    Guid Id,
    string Slug,
    string Title,
    CmsPageSectionDto Section,
    bool IsPublished,
    DateTimeOffset? UpdatedAtUtc);

public sealed record CreateCmsPageDto(
    string Slug,
    string Title,
    string Body,
    CmsPageSectionDto Section,
    bool IsPublished = false);

public sealed record UpdateCmsPageDto(
    string Title,
    string Body,
    CmsPageSectionDto Section,
    bool IsPublished);

public sealed record CmsBlockDto(string Key, string Value);

public sealed record UpsertCmsBlockDto(string Value);

/// Well-known block keys used by the SPA. Listing them here is for discoverability;
/// admins can create any key they like via the CMS admin screen.
public static class CmsBlockKeys
{
    public const string LoginEyebrow         = "login.eyebrow";
    public const string LoginTitle           = "login.title";
    public const string LoginSubtitle        = "login.subtitle";
    public const string LoginFeature1        = "login.feature.1";
    public const string LoginFeature2        = "login.feature.2";
    public const string LoginFeature3        = "login.feature.3";
    public const string FooterTagline        = "footer.tagline";
}

/// Well-known page slugs - the SPA renders /legal/{slug} for Legal section pages and
/// /help/{slug} for Help section pages. Marketing pages have no canonical route.
public static class CmsPageSlugs
{
    public const string Terms        = "terms";
    public const string Privacy      = "privacy";
    public const string Cookies      = "cookies";
    public const string Faq          = "faq";
    public const string AboutProduct = "about";
}
