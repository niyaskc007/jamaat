namespace Jamaat.Contracts.Lookups;

public sealed record LookupDto(
    Guid Id, string Category, string Code, string Name, string? NameArabic,
    int SortOrder, bool IsActive, string? Notes, DateTimeOffset CreatedAtUtc);

public sealed record CreateLookupDto(string Category, string Code, string Name, string? NameArabic = null, int SortOrder = 0, string? Notes = null);
public sealed record UpdateLookupDto(string Name, string? NameArabic, int SortOrder, string? Notes, bool IsActive);

public sealed record LookupListQuery(int Page = 1, int PageSize = 200, string? Category = null, string? Search = null, bool? Active = null);

/// <summary>Known lookup category names - listed here for discoverability.</summary>
public static class LookupCategories
{
    public const string SabilType = "SabilType";
    public const string WajebaatType = "WajebaatType";
    public const string MutafariqType = "MutafariqType";
    public const string NiyazType = "NiyazType";
    public const string QarzanHasanaScheme = "QarzanHasanaScheme";
    public const string Vatan = "Vatan";
    public const string Nationality = "Nationality";
    public const string Qualification = "Qualification";
    public const string Occupation = "Occupation";
    public const string Hunars = "Hunars";
    public const string Language = "Language";
    public const string Idara = "Idara";
    public const string QuranSanad = "QuranSanad";
    /// Event category lookup. Seeded with codes "0".."7" matching the historical EventCategory enum;
    /// admins can add more on the Lookups master-data tab using the next available numeric code.
    public const string EventCategory = "EventCategory";
}
