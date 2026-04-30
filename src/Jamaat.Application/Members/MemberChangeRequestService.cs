using System.Text.Json;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Application.Members;

/// <summary>
/// Verification queue for member profile edits. Members with member.self.update (but not
/// member.update) submit changes here; an admin / data validator with member.changes.approve
/// reviews + applies. Section-level granularity - one request per Tab save, the whole DTO
/// frozen as JSON. Approval calls back into IMemberProfileService to apply the change.
/// </summary>
public interface IMemberChangeRequestService
{
    Task<Result<MemberChangeRequestDto>> SubmitAsync(Guid memberId, string section, object payload, CancellationToken ct = default);
    Task<Result<PagedResult<MemberChangeRequestDto>>> ListAsync(MemberChangeRequestListQuery q, CancellationToken ct = default);
    Task<Result<IReadOnlyList<MemberChangeRequestDto>>> ListForMemberAsync(Guid memberId, CancellationToken ct = default);
    Task<Result<MemberChangeRequestDto>> ApproveAsync(Guid id, string? note, CancellationToken ct = default);
    Task<Result<MemberChangeRequestDto>> RejectAsync(Guid id, string note, CancellationToken ct = default);
    Task<Result<int>> PendingCountAsync(CancellationToken ct = default);
}

/// <summary>Sections allowed in a change request - mirror of IMemberProfileService methods.
/// Anything outside this list is rejected at submit time so we don't accept payloads for
/// fields the queue doesn't know how to apply.</summary>
public static class MemberChangeRequestSection
{
    public const string Identity = "Identity";
    public const string Personal = "Personal";
    public const string Contact = "Contact";
    public const string Address = "Address";
    public const string Origin = "Origin";
    public const string EducationWork = "EducationWork";
    public const string Religious = "Religious";
    public const string FamilyRefs = "FamilyRefs";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Identity, Personal, Contact, Address, Origin, EducationWork, Religious, FamilyRefs,
    };
}

public sealed class MemberChangeRequestService(
    JamaatDbContextFacade db, IUnitOfWork uow,
    ITenantContext tenant, ICurrentUser currentUser, IClock clock,
    IMemberProfileService profileSvc,
    ILogger<MemberChangeRequestService> logger) : IMemberChangeRequestService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task<Result<MemberChangeRequestDto>> SubmitAsync(Guid memberId, string section, object payload, CancellationToken ct = default)
    {
        if (!MemberChangeRequestSection.All.Contains(section))
            return Error.Validation("change_request.unknown_section", $"Section '{section}' is not supported.");
        if (!await db.Members.AsNoTracking().AnyAsync(m => m.Id == memberId && !m.IsDeleted, ct))
            return Error.NotFound("member.not_found", "Member not found.");

        var json = JsonSerializer.Serialize(payload, JsonOpts);
        var entity = new MemberChangeRequest(Guid.NewGuid(), tenant.TenantId, memberId,
            section, json,
            currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system",
            clock.UtcNow);
        db.MemberChangeRequests.Add(entity);
        await uow.SaveChangesAsync(ct);
        return Map(entity);
    }

    public async Task<Result<PagedResult<MemberChangeRequestDto>>> ListAsync(MemberChangeRequestListQuery q, CancellationToken ct = default)
    {
        var query = db.MemberChangeRequests.AsNoTracking().AsQueryable();
        if (q.Status.HasValue) query = query.Where(x => x.Status == q.Status.Value);
        if (q.MemberId.HasValue) query = query.Where(x => x.MemberId == q.MemberId.Value);
        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderByDescending(x => x.RequestedAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 200))
            .ToListAsync(ct);
        // Resolve member names in one round-trip; keeps the queue page snappy.
        var memberIds = rows.Select(r => r.MemberId).Distinct().ToList();
        var memberNames = await db.Members.AsNoTracking()
            .Where(m => memberIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.FullName, ct);
        var dtos = rows.Select(r => Map(r, memberNames.GetValueOrDefault(r.MemberId, "(unknown)"))).ToList();
        return new PagedResult<MemberChangeRequestDto>(dtos, total, q.Page, q.PageSize);
    }

    public async Task<Result<IReadOnlyList<MemberChangeRequestDto>>> ListForMemberAsync(Guid memberId, CancellationToken ct = default)
    {
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) return Error.NotFound("member.not_found", "Member not found.");
        var rows = await db.MemberChangeRequests.AsNoTracking()
            .Where(x => x.MemberId == memberId)
            .OrderByDescending(x => x.RequestedAtUtc)
            .Take(50)
            .ToListAsync(ct);
        return rows.Select(r => Map(r, member.FullName)).ToList();
    }

    public async Task<Result<MemberChangeRequestDto>> ApproveAsync(Guid id, string? note, CancellationToken ct = default)
    {
        var req = await db.MemberChangeRequests.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (req is null) return Error.NotFound("change_request.not_found", "Change request not found.");
        if (req.Status != MemberChangeRequestStatus.Pending)
            return Error.Business("change_request.already_reviewed", $"Request already {req.Status}.");

        // Apply through the existing per-section update method. Each section knows how to
        // deserialise its own DTO; failure on any section bubbles up as a Business error so
        // the queue stays consistent (no half-applied state).
        var apply = await ApplyAsync(req, ct);
        if (!apply.IsSuccess) return apply.Error!;

        req.Approve(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow, note);
        db.MemberChangeRequests.Update(req);
        await uow.SaveChangesAsync(ct);
        var memberName = await db.Members.AsNoTracking().Where(m => m.Id == req.MemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct);
        return Map(req, memberName);
    }

    public async Task<Result<MemberChangeRequestDto>> RejectAsync(Guid id, string note, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(note))
            return Error.Validation("change_request.note_required", "A reviewer note is required when rejecting.");
        var req = await db.MemberChangeRequests.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (req is null) return Error.NotFound("change_request.not_found", "Change request not found.");
        if (req.Status != MemberChangeRequestStatus.Pending)
            return Error.Business("change_request.already_reviewed", $"Request already {req.Status}.");
        req.Reject(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow, note);
        db.MemberChangeRequests.Update(req);
        await uow.SaveChangesAsync(ct);
        var memberName = await db.Members.AsNoTracking().Where(m => m.Id == req.MemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct);
        return Map(req, memberName);
    }

    public async Task<Result<int>> PendingCountAsync(CancellationToken ct = default) =>
        await db.MemberChangeRequests.AsNoTracking()
            .CountAsync(x => x.Status == MemberChangeRequestStatus.Pending, ct);

    // -- Apply pipeline ----------------------------------------------------

    private async Task<Result> ApplyAsync(MemberChangeRequest req, CancellationToken ct)
    {
        try
        {
            return req.Section switch
            {
                MemberChangeRequestSection.Identity => Forward(await profileSvc.UpdateIdentityAsync(req.MemberId, Deserialize<UpdateIdentityDto>(req.PayloadJson), ct)),
                MemberChangeRequestSection.Personal => Forward(await profileSvc.UpdatePersonalAsync(req.MemberId, Deserialize<UpdatePersonalDto>(req.PayloadJson), ct)),
                MemberChangeRequestSection.Contact => Forward(await profileSvc.UpdateContactAsync(req.MemberId, Deserialize<UpdateContactDto>(req.PayloadJson), ct)),
                MemberChangeRequestSection.Address => Forward(await profileSvc.UpdateAddressAsync(req.MemberId, Deserialize<UpdateAddressDto>(req.PayloadJson), ct)),
                MemberChangeRequestSection.Origin => Forward(await profileSvc.UpdateOriginAsync(req.MemberId, Deserialize<UpdateOriginDto>(req.PayloadJson), ct)),
                MemberChangeRequestSection.EducationWork => Forward(await profileSvc.UpdateEducationWorkAsync(req.MemberId, Deserialize<UpdateEducationWorkDto>(req.PayloadJson), ct)),
                MemberChangeRequestSection.Religious => Forward(await profileSvc.UpdateReligiousCredentialsAsync(req.MemberId, Deserialize<UpdateReligiousCredentialsDto>(req.PayloadJson), ct)),
                MemberChangeRequestSection.FamilyRefs => Forward(await profileSvc.UpdateFamilyRefsAsync(req.MemberId, Deserialize<UpdateFamilyRefsDto>(req.PayloadJson), ct)),
                _ => Result.Failure(Error.Validation("change_request.unknown_section", $"Section '{req.Section}' is not supported.")),
            };
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not apply change request {Id} for member {MemberId}", req.Id, req.MemberId);
            return Result.Failure(Error.Business("change_request.apply_failed", "Could not apply the change. The payload may be malformed."));
        }
    }

    private static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, JsonOpts)
            ?? throw new InvalidOperationException("Deserialised payload is null.");

    private static Result Forward<T>(Result<T> r) => r.IsSuccess ? Result.Success() : Result.Failure(r.Error!);

    // -- Mapping ------------------------------------------------------------

    private static MemberChangeRequestDto Map(MemberChangeRequest req, string? memberName = null) =>
        new(req.Id, req.MemberId, memberName ?? "",
            req.Section, req.PayloadJson, req.Status,
            req.RequestedByUserId, req.RequestedByUserName, req.RequestedAtUtc,
            req.ReviewedByUserId, req.ReviewedByUserName, req.ReviewedAtUtc, req.ReviewerNote);
}
