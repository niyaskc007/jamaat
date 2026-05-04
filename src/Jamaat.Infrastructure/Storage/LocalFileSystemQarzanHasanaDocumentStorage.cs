using Jamaat.Application.QarzanHasana;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Storage;

/// <summary>Local-filesystem implementation. Each loan can carry up to two named documents
/// (cashflow + gold-slip); files are named <c>{loanId:N}-{kind}.{ext}</c>. Same shape as
/// <see cref="LocalFileSystemReceiptDocumentStorage"/>; a cloud-blob backend would slot in
/// without controller/service changes.</summary>
public sealed class LocalFileSystemQarzanHasanaDocumentStorage : IQarzanHasanaDocumentStorage
{
    private readonly QarzanHasanaDocumentStorageOptions _options;
    private readonly ILogger<LocalFileSystemQarzanHasanaDocumentStorage> _logger;

    public LocalFileSystemQarzanHasanaDocumentStorage(IOptions<QarzanHasanaDocumentStorageOptions> options, ILogger<LocalFileSystemQarzanHasanaDocumentStorage> logger)
    {
        _options = options.Value;
        _logger = logger;
        try { Directory.CreateDirectory(ResolveRoot()); }
        catch (Exception ex) { _logger.LogWarning(ex, "Could not create qarzan-hasana document storage root {Path}", ResolveRoot()); }
    }

    public async Task<string> StoreAsync(Guid loanId, QhDocumentKind kind, Stream content, string contentType, CancellationToken ct = default)
    {
        var extension = ExtensionFor(contentType);
        var slot = SlotName(kind);
        var fileName = $"{loanId:N}-{slot}{extension}";
        var fullPath = Path.Combine(ResolveRoot(), fileName);

        // One file per (loan, kind). Drop any prior doc for this slot before writing.
        foreach (var existing in Directory.EnumerateFiles(ResolveRoot(), $"{loanId:N}-{slot}.*"))
        {
            try { File.Delete(existing); }
            catch (IOException ex) { _logger.LogWarning(ex, "Could not delete old QH doc {Path}", existing); }
        }

        await using (var write = File.Create(fullPath))
        {
            await content.CopyToAsync(write, ct);
        }
        return $"/api/v1/qarzan-hasana/{loanId}/{UrlSegment(kind)}";
    }

    public Task<(Stream Content, string ContentType)?> OpenAsync(Guid loanId, QhDocumentKind kind, CancellationToken ct = default)
    {
        var slot = SlotName(kind);
        var match = Directory.EnumerateFiles(ResolveRoot(), $"{loanId:N}-{slot}.*").FirstOrDefault();
        if (match is null) return Task.FromResult<(Stream, string)?>(null);
        var contentType = ContentTypeFor(Path.GetExtension(match));
        Stream stream = File.OpenRead(match);
        return Task.FromResult<(Stream, string)?>((stream, contentType));
    }

    public Task DeleteAsync(Guid loanId, QhDocumentKind kind, CancellationToken ct = default)
    {
        var slot = SlotName(kind);
        foreach (var existing in Directory.EnumerateFiles(ResolveRoot(), $"{loanId:N}-{slot}.*"))
        {
            try { File.Delete(existing); }
            catch (IOException ex) { _logger.LogWarning(ex, "Could not delete QH doc {Path}", existing); }
        }
        return Task.CompletedTask;
    }

    private string ResolveRoot()
    {
        var path = _options.RootPath;
        return Path.IsPathRooted(path) ? path : Path.Combine(AppContext.BaseDirectory, path);
    }

    private static string SlotName(QhDocumentKind kind) => kind switch
    {
        QhDocumentKind.Cashflow => "cashflow",
        QhDocumentKind.GoldSlip => "goldslip",
        _ => "other",
    };

    private static string UrlSegment(QhDocumentKind kind) => kind switch
    {
        QhDocumentKind.Cashflow => "cashflow-document",
        QhDocumentKind.GoldSlip => "gold-slip-document",
        _ => "document",
    };

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
