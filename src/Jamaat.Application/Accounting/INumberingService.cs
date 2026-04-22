using Jamaat.Domain.Enums;

namespace Jamaat.Application.Accounting;

public interface INumberingService
{
    /// Gets the next number for the given scope (+ optional fund type) using a transactional
    /// UPDLOCK so numbers are contiguous and never duplicated under concurrency.
    /// Must be called within an open DB transaction.
    Task<(Guid SeriesId, string Number)> NextAsync(
        NumberingScope scope, Guid? fundTypeId, int year, CancellationToken ct = default);
}
