using Jamaat.Application.Receipts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Storage;

/// <summary>Local-filesystem implementation. One file per receipt; extension derived from the
/// uploaded ContentType. Returns a URL that the API can stream back to the browser. Same shape
/// as <see cref="LocalFileSystemPhotoStorage"/> but with a different root and PDF support.</summary>
public sealed class LocalFileSystemReceiptDocumentStorage : IReceiptDocumentStorage
{
    private readonly ReceiptDocumentStorageOptions _options;
    private readonly ILogger<LocalFileSystemReceiptDocumentStorage> _logger;

    public LocalFileSystemReceiptDocumentStorage(IOptions<ReceiptDocumentStorageOptions> options, ILogger<LocalFileSystemReceiptDocumentStorage> logger)
    {
        _options = options.Value;
        _logger = logger;
        Directory.CreateDirectory(ResolveRoot());
    }

    public async Task<string> StoreAsync(Guid receiptId, Stream content, string contentType, CancellationToken ct = default)
    {
        var extension = ExtensionFor(contentType);
        var fileName = $"{receiptId:N}{extension}";
        var fullPath = Path.Combine(ResolveRoot(), fileName);

        // Drop any prior doc for this receipt before writing the new one - one-doc-per-receipt
        // keeps the URL stable and the file system tidy.
        foreach (var existing in Directory.EnumerateFiles(ResolveRoot(), $"{receiptId:N}.*"))
        {
            try { File.Delete(existing); } catch (IOException ex) { _logger.LogWarning(ex, "Could not delete old receipt doc {Path}", existing); }
        }

        await using (var write = File.Create(fullPath))
        {
            await content.CopyToAsync(write, ct);
        }
        return $"/api/v1/receipts/{receiptId}/agreement-document";
    }

    public Task<(Stream Content, string ContentType)?> OpenAsync(Guid receiptId, CancellationToken ct = default)
    {
        var match = Directory.EnumerateFiles(ResolveRoot(), $"{receiptId:N}.*").FirstOrDefault();
        if (match is null) return Task.FromResult<(Stream, string)?>(null);
        var contentType = ContentTypeFor(Path.GetExtension(match));
        Stream stream = File.OpenRead(match);
        return Task.FromResult<(Stream, string)?>((stream, contentType));
    }

    public Task DeleteAsync(Guid receiptId, CancellationToken ct = default)
    {
        foreach (var existing in Directory.EnumerateFiles(ResolveRoot(), $"{receiptId:N}.*"))
        {
            try { File.Delete(existing); } catch (IOException ex) { _logger.LogWarning(ex, "Could not delete receipt doc {Path}", existing); }
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
        "application/pdf" => ".pdf",
        "image/jpeg" or "image/jpg" => ".jpg",
        "image/png" => ".png",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        _ => ".bin",
    };

    private static string ContentTypeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        _ => "application/octet-stream",
    };
}
