using Jamaat.Application.Members;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Storage;

public sealed class LocalFileSystemPhotoStorage : IPhotoStorage
{
    private readonly PhotoStorageOptions _options;
    private readonly ILogger<LocalFileSystemPhotoStorage> _logger;

    public LocalFileSystemPhotoStorage(IOptions<PhotoStorageOptions> options, ILogger<LocalFileSystemPhotoStorage> logger)
    {
        _options = options.Value;
        _logger = logger;
        // Don't let a permission failure here poison the singleton (every controller that
        // takes IPhotoStorage as a dep would 500 on every request). Log it; uploads will
        // fail later with a proper exception, listing/reading still works.
        try { Directory.CreateDirectory(ResolveRoot()); }
        catch (Exception ex) { _logger.LogWarning(ex, "Could not create photo storage root {Path}", ResolveRoot()); }
    }

    public async Task<string> StoreAsync(Guid memberId, Stream content, string contentType, CancellationToken ct = default)
    {
        var extension = ExtensionFor(contentType);
        var fileName = $"{memberId:N}{extension}";
        var fullPath = Path.Combine(ResolveRoot(), fileName);

        // Remove any older photo for this member (any extension) before writing the new one.
        foreach (var existing in Directory.EnumerateFiles(ResolveRoot(), $"{memberId:N}.*"))
        {
            try { File.Delete(existing); } catch (IOException ex) { _logger.LogWarning(ex, "Could not delete old photo {Path}", existing); }
        }

        await using (var write = File.Create(fullPath))
        {
            await content.CopyToAsync(write, ct);
        }

        // Return the API URL callers hit to stream the photo; the UI can display it directly.
        return $"/api/v1/members/{memberId}/profile/photo/file";
    }

    public Task<(Stream Content, string ContentType)?> OpenAsync(Guid memberId, CancellationToken ct = default)
    {
        var match = Directory.EnumerateFiles(ResolveRoot(), $"{memberId:N}.*").FirstOrDefault();
        if (match is null) return Task.FromResult<(Stream, string)?>(null);
        var contentType = ContentTypeFor(Path.GetExtension(match));
        Stream stream = File.OpenRead(match);
        return Task.FromResult<(Stream, string)?>((stream, contentType));
    }

    public Task DeleteAsync(Guid memberId, CancellationToken ct = default)
    {
        foreach (var existing in Directory.EnumerateFiles(ResolveRoot(), $"{memberId:N}.*"))
        {
            try { File.Delete(existing); } catch (IOException ex) { _logger.LogWarning(ex, "Could not delete photo {Path}", existing); }
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
        _ => ".bin",
    };

    private static string ContentTypeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        _ => "application/octet-stream",
    };
}
