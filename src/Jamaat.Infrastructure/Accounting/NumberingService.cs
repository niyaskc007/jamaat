using System.Globalization;
using Jamaat.Application.Accounting;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Enums;
using Jamaat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Accounting;

/// <summary>
/// Takes a SQL UPDLOCK on the NumberingSeries row, increments the counter,
/// and returns the formatted number. The caller's transaction owns the commit.
/// </summary>
public sealed class NumberingService(JamaatDbContext db, ITenantContext tenant) : INumberingService
{
    public async Task<(Guid SeriesId, string Number)> NextAsync(NumberingScope scope, Guid? fundTypeId, int year, CancellationToken ct = default)
    {
        // Find the series for this (tenant, scope, fundType). Fall back to a generic series for the scope if no fund-specific one.
        var seriesIdAndRow = await db.NumberingSeries
            .FromSqlInterpolated($@"
                SELECT TOP 1 *
                FROM cfg.NumberingSeries WITH (UPDLOCK, ROWLOCK)
                WHERE TenantId = {tenant.TenantId}
                  AND Scope = {(int)scope}
                  AND IsActive = 1
                  AND (FundTypeId = {fundTypeId} OR (FundTypeId IS NULL AND {fundTypeId} IS NULL))
                ORDER BY FundTypeId DESC")
            .FirstOrDefaultAsync(ct);

        if (seriesIdAndRow is null)
        {
            // Fall back to the generic (fund-agnostic) series
            seriesIdAndRow = await db.NumberingSeries
                .FromSqlInterpolated($@"
                    SELECT TOP 1 *
                    FROM cfg.NumberingSeries WITH (UPDLOCK, ROWLOCK)
                    WHERE TenantId = {tenant.TenantId}
                      AND Scope = {(int)scope}
                      AND IsActive = 1
                      AND FundTypeId IS NULL
                    ORDER BY Name")
                .FirstOrDefaultAsync(ct);
        }

        if (seriesIdAndRow is null)
            throw new InvalidOperationException($"No active numbering series configured for scope {scope}.");

        // Reset year if needed
        if (seriesIdAndRow.YearReset && seriesIdAndRow.CurrentYear != year)
        {
            typeof(Domain.Entities.NumberingSeries).GetProperty(nameof(seriesIdAndRow.CurrentYear))!.SetValue(seriesIdAndRow, year);
            typeof(Domain.Entities.NumberingSeries).GetProperty(nameof(seriesIdAndRow.CurrentValue))!.SetValue(seriesIdAndRow, 0L);
        }

        var next = seriesIdAndRow.CurrentValue + 1;
        typeof(Domain.Entities.NumberingSeries).GetProperty(nameof(seriesIdAndRow.CurrentValue))!.SetValue(seriesIdAndRow, next);

        var padded = next.ToString(CultureInfo.InvariantCulture).PadLeft(seriesIdAndRow.PadLength, '0');
        var formatted = seriesIdAndRow.YearReset
            ? $"{seriesIdAndRow.Prefix}{year % 100:D2}-{padded}"
            : $"{seriesIdAndRow.Prefix}{padded}";

        await db.SaveChangesAsync(ct);
        return (seriesIdAndRow.Id, formatted);
    }
}
