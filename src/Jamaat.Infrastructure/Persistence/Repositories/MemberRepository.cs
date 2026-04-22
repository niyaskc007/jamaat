using Jamaat.Application.Common;
using Jamaat.Application.Members;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Entities;
using Jamaat.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class MemberRepository(JamaatDbContext db) : IMemberRepository
{
    private readonly JamaatDbContext _db = db;

    public Task<Member?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.Members.FirstOrDefaultAsync(m => m.Id == id && !m.IsDeleted, ct);

    public async Task<bool> ItsExistsAsync(ItsNumber its, Guid? excludeId, CancellationToken ct = default) =>
        await _db.Members.AnyAsync(m => m.ItsNumber == its && (excludeId == null || m.Id != excludeId.Value), ct);

    public async Task<PagedResult<MemberDto>> ListAsync(MemberPageRequest query, CancellationToken ct = default)
    {
        IQueryable<Member> q = _db.Members.AsNoTracking().Where(m => !m.IsDeleted);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var s = query.Search.Trim();
            q = q.Where(m => EF.Functions.Like(m.FullName, $"%{s}%")
                          || EF.Functions.Like(((string)(object)m.ItsNumber), $"%{s}%")
                          || (m.Phone != null && EF.Functions.Like(m.Phone, $"%{s}%"))
                          || (m.Email != null && EF.Functions.Like(m.Email, $"%{s}%")));
        }
        if (query.Status is not null) q = q.Where(m => m.Status == query.Status);
        if (query.DataVerificationStatus is not null) q = q.Where(m => m.DataVerificationStatus == query.DataVerificationStatus);

        var total = await q.CountAsync(ct);

        // Sort — whitelist to avoid EF surprises with the ItsNumber value-object conversion
        q = (query.SortBy?.ToLowerInvariant(), query.SortDir) switch
        {
            ("fullname", SortDirection.Desc) => q.OrderByDescending(m => m.FullName),
            ("fullname", _) => q.OrderBy(m => m.FullName),
            ("itsnumber", SortDirection.Desc) => q.OrderByDescending(m => m.ItsNumber),
            ("itsnumber", _) => q.OrderBy(m => m.ItsNumber),
            ("status", SortDirection.Desc) => q.OrderByDescending(m => m.Status),
            ("status", _) => q.OrderBy(m => m.Status),
            ("createdatutc", SortDirection.Desc) => q.OrderByDescending(m => m.CreatedAtUtc),
            (_, _) => q.OrderByDescending(m => m.CreatedAtUtc),
        };

        var items = await q.Skip(query.Skip).Take(query.Take)
            .Select(m => new MemberDto(
                m.Id,
                m.ItsNumber.Value,
                m.FullName,
                m.FullNameArabic,
                m.FullNameHindi,
                m.FullNameUrdu,
                m.FamilyId,
                m.Phone,
                m.Email,
                m.AddressLine,
                m.Status,
                m.ExternalUserId,
                m.LastSyncedAtUtc,
                m.CreatedAtUtc,
                m.UpdatedAtUtc,
                m.DataVerificationStatus,
                m.DataVerifiedOn))
            .ToListAsync(ct);

        return new PagedResult<MemberDto>(items, total, query.Page, query.PageSize);
    }

    public Task AddAsync(Member member, CancellationToken ct = default) =>
        _db.Members.AddAsync(member, ct).AsTask();

    public void Update(Member member) => _db.Members.Update(member);
}
