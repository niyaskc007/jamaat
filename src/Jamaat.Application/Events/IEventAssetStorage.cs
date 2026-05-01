namespace Jamaat.Application.Events;

public sealed class EventAssetStorageOptions
{
    public const string SectionName = "EventAssetStorage";
    public string RootPath { get; set; } = System.IO.Path.Combine("App_Data", "event-assets");
    public long MaxBytes { get; set; } = 10 * 1024 * 1024;
}

/// Stores miscellaneous binary assets (logos, hero images, gallery photos, sponsor logos, share previews)
/// uploaded by event admins through the page designer / branding tabs. Each asset gets its own Guid so the
/// same event can have many assets without collisions; the storage URL is opaque to callers.
public interface IEventAssetStorage
{
    Task<string> StoreAsync(Guid eventId, Guid assetId, Stream content, string contentType, CancellationToken ct = default);
    Task<(Stream Content, string ContentType)?> OpenAsync(Guid eventId, Guid assetId, CancellationToken ct = default);
    Task DeleteAsync(Guid eventId, Guid assetId, CancellationToken ct = default);
}
