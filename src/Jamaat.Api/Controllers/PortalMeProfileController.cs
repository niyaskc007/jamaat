using System.Security.Claims;
using Jamaat.Application.Members;
using Jamaat.Application.Notifications;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.ValueObjects;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Api.Controllers;

/// Portal Phase B (E2 follow-up) - self-edit profile.
///
/// Wraps the existing member-profile + member-change-request services with portal-scoped
/// routes that resolve the current member from the JWT instead of requiring a memberId in
/// the URL. Members can never address another member's data through this controller.
///
/// Edits to most sections create a MemberChangeRequest (status=Pending) for admin review.
/// Photo upload is immediate because the existing photo storage adapter has no concept of
/// pending state - admins can clear/reject the photo via the existing member admin UI if
/// needed.
[ApiController]
[Authorize(Policy = "portal.access")]
[Route("api/v1/portal/me/profile")]
public sealed class PortalMeProfileController(
    UserManager<ApplicationUser> users,
    JamaatDbContextFacade db,
    IUnitOfWork uow,
    IMemberProfileService profileSvc,
    IMemberChangeRequestService changeReq,
    IPhotoStorage photoStorage) : ControllerBase
{
    /// Full member profile for the signed-in user. Returns 404 if the JWT user doesn't
    /// resolve to a Member record (e.g. an Operator-only account hitting this endpoint).
    [HttpGet]
    public async Task<IActionResult> GetProfile(CancellationToken ct)
    {
        var memberId = await ResolveCurrentMemberIdAsync(ct);
        if (memberId is null) return NotFound(new { error = "no_member_link", detail = "This account is not linked to a member record." });
        var r = await profileSvc.GetProfileAsync(memberId.Value, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// Pending change requests for the signed-in member. Used by the portal to show a
    /// "your changes are awaiting review" banner.
    [HttpGet("pending-changes")]
    public async Task<IActionResult> PendingChanges(CancellationToken ct)
    {
        var memberId = await ResolveCurrentMemberIdAsync(ct);
        if (memberId is null) return Ok(Array.Empty<object>());
        var r = await changeReq.ListForMemberAsync(memberId.Value, ct);
        if (!r.IsSuccess) return ErrorMapper.ToActionResult(this, r.Error);
        // Return only Pending; Approved/Rejected are history (admin Audit page surfaces those).
        const int Pending = 1;
        return Ok(r.Value.Where(x => (int)x.Status == Pending).ToList());
    }

    [HttpPost("contact")]
    public Task<IActionResult> RequestContact([FromBody] UpdateContactDto dto, CancellationToken ct) =>
        SubmitChange(MemberChangeRequestSection.Contact, dto, ct);

    [HttpPost("address")]
    public Task<IActionResult> RequestAddress([FromBody] UpdateAddressDto dto, CancellationToken ct) =>
        SubmitChange(MemberChangeRequestSection.Address, dto, ct);

    [HttpPost("identity")]
    public Task<IActionResult> RequestIdentity([FromBody] UpdateIdentityDto dto, CancellationToken ct) =>
        SubmitChange(MemberChangeRequestSection.Identity, dto, ct);

    [HttpPost("personal")]
    public Task<IActionResult> RequestPersonal([FromBody] UpdatePersonalDto dto, CancellationToken ct) =>
        SubmitChange(MemberChangeRequestSection.Personal, dto, ct);

    [HttpPost("origin")]
    public Task<IActionResult> RequestOrigin([FromBody] UpdateOriginDto dto, CancellationToken ct) =>
        SubmitChange(MemberChangeRequestSection.Origin, dto, ct);

    [HttpPost("education-work")]
    public Task<IActionResult> RequestEducationWork([FromBody] UpdateEducationWorkDto dto, CancellationToken ct) =>
        SubmitChange(MemberChangeRequestSection.EducationWork, dto, ct);

    /// Notification preferences for the signed-in member. Returned shape mirrors
    /// MemberNotificationPreferences. Null channels / unset kinds are treated as defaults.
    [HttpGet("notification-prefs")]
    public async Task<IActionResult> GetNotificationPrefs(CancellationToken ct)
    {
        var memberId = await ResolveCurrentMemberIdAsync(ct);
        if (memberId is null) return NotFound(new { error = "no_member_link" });
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == memberId.Value, ct);
        if (member is null) return NotFound();
        var prefs = MemberNotificationPreferences.FromJson(member.NotificationPreferencesJson);
        return Ok(prefs);
    }

    [HttpPut("notification-prefs")]
    public async Task<IActionResult> SetNotificationPrefs([FromBody] MemberNotificationPreferences dto, CancellationToken ct)
    {
        var memberId = await ResolveCurrentMemberIdAsync(ct);
        if (memberId is null) return NotFound(new { error = "no_member_link" });
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == memberId.Value, ct);
        if (member is null) return NotFound();
        member.SetNotificationPreferencesJson(dto.ToJson());
        db.Members.Update(member);
        await uow.SaveChangesAsync(ct);
        return NoContent();
    }

    /// Upload a new profile photo. Applied immediately (the photo storage layer has no pending
    /// state); admins can clear it via the existing member admin UI if it's inappropriate.
    /// Max 10 MB; image/* MIME only.
    [HttpPost("photo")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadPhoto(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "photo.empty", detail = "File is required." });
        if (!(file.ContentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ?? false))
            return BadRequest(new { error = "photo.invalid_type", detail = "Only image uploads are accepted." });

        var memberId = await ResolveCurrentMemberIdAsync(ct);
        if (memberId is null) return NotFound(new { error = "no_member_link", detail = "This account is not linked to a member record." });

        await using var stream = file.OpenReadStream();
        var url = await photoStorage.StoreAsync(memberId.Value, stream, file.ContentType ?? "image/jpeg", ct);
        var r = await profileSvc.SetPhotoUrlAsync(memberId.Value, new UploadPhotoDto(url), ct);
        return r.IsSuccess ? Ok(new { photoUrl = url }) : ErrorMapper.ToActionResult(this, r.Error);
    }

    private async Task<IActionResult> SubmitChange(string section, object dto, CancellationToken ct)
    {
        var memberId = await ResolveCurrentMemberIdAsync(ct);
        if (memberId is null) return NotFound(new { error = "no_member_link", detail = "This account is not linked to a member record." });
        var r = await changeReq.SubmitAsync(memberId.Value, section, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    private async Task<Guid?> ResolveCurrentMemberIdAsync(CancellationToken ct)
    {
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(sub, out var userId)) return null;
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null || string.IsNullOrWhiteSpace(user.ItsNumber)) return null;
        if (!ItsNumber.TryCreate(user.ItsNumber!, out var its)) return null;
        return await db.Members.AsNoTracking()
            .Where(m => m.ItsNumber == its && !m.IsDeleted)
            .Select(m => (Guid?)m.Id)
            .FirstOrDefaultAsync(ct);
    }
}
