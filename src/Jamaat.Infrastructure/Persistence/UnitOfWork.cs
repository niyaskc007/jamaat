using Jamaat.Domain.Abstractions;
using Microsoft.EntityFrameworkCore.Storage;

namespace Jamaat.Infrastructure.Persistence;

public sealed class UnitOfWork : IUnitOfWork
{
    private readonly JamaatDbContext _db;

    public UnitOfWork(JamaatDbContext db) => _db = db;

    public Task<int> SaveChangesAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);

    public async Task<IAsyncDisposable> BeginTransactionAsync(CancellationToken ct = default)
    {
        var tx = await _db.Database.BeginTransactionAsync(ct);
        return new TransactionScope(tx);
    }

    private sealed class TransactionScope : IAsyncDisposable
    {
        private readonly IDbContextTransaction _tx;
        private bool _committed;
        public TransactionScope(IDbContextTransaction tx) => _tx = tx;

        public async Task CommitAsync(CancellationToken ct = default)
        {
            await _tx.CommitAsync(ct);
            _committed = true;
        }

        public async ValueTask DisposeAsync()
        {
            if (!_committed) await _tx.RollbackAsync();
            await _tx.DisposeAsync();
        }
    }
}
