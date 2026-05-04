using Jamaat.Application.Events;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Storage;

public sealed class LocalFileSystemEventAssetStorage : IEventAssetStorage
{
    private readonly EventAssetStorageOptions _options;
    private readonly ILogger<LocalFileSystemEventAssetStorage> _logger;

    public LocalFileSystemEventAssetStorage(IOptions<EventAssetStorageOptions> options, ILogger<LocalFileSystemEventAssetStorage> logger)
    {
        _options = options.Value;
        _logger = logger;
        try { Directory.CreateDirectory(ResolveRoot()); }
        catch (Exception ex) { _logger.LogWarning(ex, "Could not create event asset storage root {Path}", ResolveRoot()); }
    }

    public async Task<string> StoreAsync(Guid eventId, Guid assetId, Stream content, string contentType, CancellationToken ct = default)
    {
        var dir = Path.Combine(ResolveRoot(), eventId.ToString("N"));
        Directory.CreateDirectory(dir);
        var ext = ExtensionFor(contentType);
        var filePath = Path.Combine(dir, $"{assetId:N}{ext}");

        // Wipe any previous version of this asset id (any extension).
        foreach (var existing in Directory.EnumerateFiles(dir, $"{assetId:N}.*"))
        {
            try { File.Delete(existing); } catch (IOException ex) { _logger.LogWarning(ex, "Could not delete old asset {Path}", existing); }
        }

        await using var write = File.Create(filePath);
        await content.CopyToAsync(write, ct);
        return $"/api/v1/events/{eventId}/assets/{assetId}/file";
    }

    public Task<(Stream Content, string ContentType)?> OpenAsync(Guid eventId, Guid assetId, CancellationToken ct = default)
    {
        var dir = Path.Combine(ResolveRoot(), eventId.ToString("N"));
        if (!Directory.Exists(dir)) return Task.FromResult<(Stream, string)?>(null);
        var match = Directory.EnumerateFiles(dir, $"{assetId:N}.*").FirstOrDefault();
        if (match is null) return Task.FromResult<(Stream, string)?>(null);
        Stream stream = File.OpenRead(match);
        return Task.FromResult<(Stream, string)?>((stream, ContentTypeFor(Path.GetExtension(match))));
    }

    public Task DeleteAsync(Guid eventId, Guid assetId, CancellationToken ct = default)
    {
        var dir = Path.Combine(ResolveRoot(), eventId.ToString("N"));
        if (!Directory.Exists(dir)) return Task.CompletedTask;
        foreach (var existing in Directory.EnumerateFiles(dir, $"{assetId:N}.*"))
        {
            try { File.Delete(existing); } catch (IOException ex) { _logger.LogWarning(ex, "Could not delete asset {Path}", existing); }
        }
        return Task.CompletedTask;
    }

    private string ResolveRoot()
    {
        var path = _options.RootPath;
        return Path.IsPathRooted(path) ? path : Path.Combine(AppContext.BaseDirectory, path);
    }

    private static string ExtensionFor(string contentType) => contentType?.ToLowerInvariant() switch
    {
        "image/jpeg" or "image/jpg" => ".jpg",
        "image/png" => ".png",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        "image/svg+xml" => ".svg",
        _ => ".bin",
    };

    private static string ContentTypeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };
}
