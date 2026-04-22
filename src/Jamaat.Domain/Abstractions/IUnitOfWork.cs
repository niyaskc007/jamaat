namespace Jamaat.Domain.Abstractions;

public interface IUnitOfWork
{
    /// Commits pending changes, dispatches domain events, writes audit log, all in one transaction.
    Task<int> SaveChangesAsync(CancellationToken ct = default);

    /// Starts an explicit transaction for multi-step operations (e.g. receipt + ledger posting).
    Task<IAsyncDisposable> BeginTransactionAsync(CancellationToken ct = default);
}
