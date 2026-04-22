namespace Jamaat.Application.Members;

public sealed class PhotoStorageOptions
{
    public const string SectionName = "PhotoStorage";
    /// <summary>Absolute or relative root directory for member photos. Default: App_Data/photos/members.</summary>
    public string RootPath { get; set; } = System.IO.Path.Combine("App_Data", "photos", "members");
    /// <summary>Maximum allowed file size in bytes (default 5 MB).</summary>
    public long MaxBytes { get; set; } = 5 * 1024 * 1024;
}

/// <summary>
/// Abstraction over where member photos are stored. Default implementation is a local file-system
/// store; future cloud backends (Azure Blob, S3) can swap in without callers changing.
/// </summary>
public interface IPhotoStorage
{
    /// <summary>
    /// Persists the given photo bytes and returns a stable URL pointer that's saved onto <see cref="Jamaat.Domain.Entities.Member.PhotoUrl"/>.
    /// The URL is relative to the API (e.g., "/api/v1/members/{id}/profile/photo/file") so it's portable across environments.
    /// </summary>
    Task<string> StoreAsync(Guid memberId, Stream content, string contentType, CancellationToken ct = default);

    /// <summary>Opens a readable stream for a previously stored photo.</summary>
    Task<(Stream Content, string ContentType)?> OpenAsync(Guid memberId, CancellationToken ct = default);

    /// <summary>Deletes a previously stored photo (idempotent).</summary>
    Task DeleteAsync(Guid memberId, CancellationToken ct = default);
}
