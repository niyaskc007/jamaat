using Jamaat.Application.Common;
using Jamaat.Application.Members;
using Jamaat.Contracts.Members;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Verification queue for member profile edits. Members with member.self.update submit a
/// change request per Tab save (one section per request); admins / data-validators with
/// member.changes.approve review and apply or reject. The approve path delegates back to
/// IMemberProfileService so the existing per-section behaviour stays the source of truth.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1")]
public sealed class MemberChangeRequestController(IMemberChangeRequestService svc) : ControllerBase
{
    // -- Submission (member.self.update) ---------------------------------

    [HttpPost("members/{id:guid}/profile/identity/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitIdentity(Guid id, [FromBody] UpdateIdentityDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.Identity, dto, ct);

    [HttpPost("members/{id:guid}/profile/personal/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitPersonal(Guid id, [FromBody] UpdatePersonalDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.Personal, dto, ct);

    [HttpPost("members/{id:guid}/profile/contact/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitContact(Guid id, [FromBody] UpdateContactDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.Contact, dto, ct);

    [HttpPost("members/{id:guid}/profile/address/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitAddress(Guid id, [FromBody] UpdateAddressDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.Address, dto, ct);

    [HttpPost("members/{id:guid}/profile/origin/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitOrigin(Guid id, [FromBody] UpdateOriginDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.Origin, dto, ct);

    [HttpPost("members/{id:guid}/profile/education-work/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitEducationWork(Guid id, [FromBody] UpdateEducationWorkDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.EducationWork, dto, ct);

    [HttpPost("members/{id:guid}/profile/religious/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitReligious(Guid id, [FromBody] UpdateReligiousCredentialsDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.Religious, dto, ct);

    [HttpPost("members/{id:guid}/profile/family-refs/request-update")]
    [Authorize(Policy = "member.self.update")]
    public Task<IActionResult> SubmitFamilyRefs(Guid id, [FromBody] UpdateFamilyRefsDto dto, CancellationToken ct)
        => Submit(id, MemberChangeRequestSection.FamilyRefs, dto, ct);

    [HttpGet("members/{id:guid}/profile/change-requests")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> ListForMember(Guid id, CancellationToken ct)
    {
        var r = await svc.ListForMemberAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    private async Task<IActionResult> Submit(Guid id, string section, object dto, CancellationToken ct)
    {
        var r = await svc.SubmitAsync(id, section, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    // -- Admin queue (member.changes.approve) ----------------------------

    [HttpGet("admin/member-change-requests")]
    [Authorize(Policy = "member.changes.approve")]
    public async Task<IActionResult> List([FromQuery] MemberChangeRequestListQuery q, CancellationToken ct)
    {
        var r = await svc.ListAsync(q, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpGet("admin/member-change-requests/pending-count")]
    [Authorize(Policy = "member.changes.approve")]
    public async Task<IActionResult> PendingCount(CancellationToken ct)
    {
        var r = await svc.PendingCountAsync(ct);
        return r.IsSuccess ? Ok(new { count = r.Value }) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("admin/member-change-requests/{id:guid}/approve")]
    [Authorize(Policy = "member.changes.approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ReviewChangeRequestDto dto, CancellationToken ct)
    {
        var r = await svc.ApproveAsync(id, dto?.Note, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("admin/member-change-requests/{id:guid}/reject")]
    [Authorize(Policy = "member.changes.approve")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ReviewChangeRequestDto dto, CancellationToken ct)
    {
        var r = await svc.RejectAsync(id, dto?.Note ?? "", ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }
}
