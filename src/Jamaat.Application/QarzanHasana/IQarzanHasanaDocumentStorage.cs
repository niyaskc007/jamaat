namespace Jamaat.Application.QarzanHasana;

public sealed class QarzanHasanaDocumentStorageOptions
{
    public const string SectionName = "QarzanHasanaDocumentStorage";
    /// <summary>Absolute or relative root directory for QH cashflow + gold-slip docs.</summary>
    public string RootPath { get; set; } = System.IO.Path.Combine("App_Data", "documents", "qarzan-hasana");
    /// <summary>Maximum allowed file size in bytes (default 10 MB - same as receipt docs).</summary>
    public long MaxBytes { get; set; } = 10 * 1024 * 1024;
}

/// <summary>Identifies which document slot we're storing under a given loan.</summary>
public enum QhDocumentKind
{
    Cashflow = 1,
    GoldSlip = 2,
}

/// <summary>
/// Storage for documents attached to a Qarzan Hasana loan. Each loan can carry up to two
/// documents (cashflow + gold-slip), addressed by <see cref="QhDocumentKind"/>. Mirrors
/// <see cref="Receipts.IReceiptDocumentStorage"/> but supports two named slots per aggregate.
/// </summary>
public interface IQarzanHasanaDocumentStorage
{
    /// <summary>Persist a document for the given loan + kind. Returns a stable URL.</summary>
    Task<string> StoreAsync(Guid loanId, QhDocumentKind kind, Stream content, string contentType, CancellationToken ct = default);

    /// <summary>Open a previously stored document; null when absent.</summary>
    Task<(Stream Content, string ContentType)?> OpenAsync(Guid loanId, QhDocumentKind kind, CancellationToken ct = default);

    /// <summary>Idempotent delete - removes any document of this kind for the loan.</summary>
    Task DeleteAsync(Guid loanId, QhDocumentKind kind, CancellationToken ct = default);
}
