namespace Jamaat.Application.Receipts;

public sealed class ReceiptDocumentStorageOptions
{
    public const string SectionName = "ReceiptDocumentStorage";
    /// <summary>Absolute or relative root directory for receipt agreement docs.</summary>
    public string RootPath { get; set; } = System.IO.Path.Combine("App_Data", "documents", "receipt-agreements");
    /// <summary>Maximum allowed file size in bytes (default 10 MB - bigger than photos to fit scanned PDFs).</summary>
    public long MaxBytes { get; set; } = 10 * 1024 * 1024;
}

/// <summary>
/// Storage for the agreement document attached to a returnable Receipt. Mirrors IPhotoStorage
/// but accepts PDFs alongside images, since the typical artefact is a scanned/signed PDF rather
/// than just a photo. Default implementation lives on the local filesystem; a cloud-blob backend
/// could swap in without any controller/service changes.
/// </summary>
public interface IReceiptDocumentStorage
{
    /// <summary>Persists the document and returns a stable URL pointer. Existing doc for the
    /// same receipt (any extension) is replaced atomically.</summary>
    Task<string> StoreAsync(Guid receiptId, Stream content, string contentType, CancellationToken ct = default);

    /// <summary>Open a previously stored document. Returns null if none exists.</summary>
    Task<(Stream Content, string ContentType)?> OpenAsync(Guid receiptId, CancellationToken ct = default);

    /// <summary>Idempotent delete. Removes any document for the given receipt.</summary>
    Task DeleteAsync(Guid receiptId, CancellationToken ct = default);
}
