using Jamaat.Application.Members;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/members/{id:guid}/profile")]
public sealed class MemberProfileController(
    IMemberProfileService svc,
    IPhotoStorage photoStorage,
    IOptions<PhotoStorageOptions> photoOptions) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    { var r = await svc.GetProfileAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("identity")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateIdentity(Guid id, [FromBody] UpdateIdentityDto dto, CancellationToken ct)
    { var r = await svc.UpdateIdentityAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("personal")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdatePersonal(Guid id, [FromBody] UpdatePersonalDto dto, CancellationToken ct)
    { var r = await svc.UpdatePersonalAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("contact")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateContact(Guid id, [FromBody] UpdateContactDto dto, CancellationToken ct)
    { var r = await svc.UpdateContactAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("address")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateAddress(Guid id, [FromBody] UpdateAddressDto dto, CancellationToken ct)
    { var r = await svc.UpdateAddressAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("origin")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateOrigin(Guid id, [FromBody] UpdateOriginDto dto, CancellationToken ct)
    { var r = await svc.UpdateOriginAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("education-work")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateEducationWork(Guid id, [FromBody] UpdateEducationWorkDto dto, CancellationToken ct)
    { var r = await svc.UpdateEducationWorkAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("religious")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateReligiousCredentials(Guid id, [FromBody] UpdateReligiousCredentialsDto dto, CancellationToken ct)
    { var r = await svc.UpdateReligiousCredentialsAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("family-refs")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateFamilyRefs(Guid id, [FromBody] UpdateFamilyRefsDto dto, CancellationToken ct)
    { var r = await svc.UpdateFamilyRefsAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("verify-data")]
    [Authorize(Policy = "member.verify")]
    public async Task<IActionResult> VerifyData(Guid id, [FromBody] VerifyRequestDto dto, CancellationToken ct)
    { var r = await svc.VerifyDataAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("verify-photo")]
    [Authorize(Policy = "member.verify")]
    public async Task<IActionResult> VerifyPhoto(Guid id, [FromBody] VerifyRequestDto dto, CancellationToken ct)
    { var r = await svc.VerifyPhotoAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("photo")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> SetPhoto(Guid id, [FromBody] UploadPhotoDto dto, CancellationToken ct)
    { var r = await svc.SetPhotoUrlAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("photo/upload")]
    [Authorize(Policy = "member.update")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadPhoto(Guid id, [FromForm] IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return ErrorMapper.ToActionResult(this, Error.Validation("photo.empty", "File is required."));
        if (file.Length > photoOptions.Value.MaxBytes)
            return ErrorMapper.ToActionResult(this, Error.Validation("photo.too_large",
                $"Photo exceeds the {photoOptions.Value.MaxBytes / 1024} KB limit."));
        if (!(file.ContentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ?? false))
            return ErrorMapper.ToActionResult(this, Error.Validation("photo.invalid_type",
                "Only image uploads are accepted."));

        await using var stream = file.OpenReadStream();
        var url = await photoStorage.StoreAsync(id, stream, file.ContentType, ct);
        var result = await svc.SetPhotoUrlAsync(id, new UploadPhotoDto(url), ct);
        return result.IsSuccess ? Ok(result.Value) : ErrorMapper.ToActionResult(this, result.Error);
    }

    [HttpGet("photo/file")]
    [AllowAnonymous] // photos themselves are not sensitive; the URL is obscure enough. Tighten later if needed.
    public async Task<IActionResult> GetPhotoFile(Guid id, CancellationToken ct)
    {
        var opened = await photoStorage.OpenAsync(id, ct);
        if (opened is null) return NotFound();
        return File(opened.Value.Content, opened.Value.ContentType);
    }

    [HttpDelete("photo/file")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> DeletePhoto(Guid id, CancellationToken ct)
    {
        await photoStorage.DeleteAsync(id, ct);
        var result = await svc.SetPhotoUrlAsync(id, new UploadPhotoDto(null), ct);
        return result.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, result.Error);
    }

    [HttpGet("/api/v1/members/{id:guid}/contribution-summary")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> ContributionSummary(Guid id, CancellationToken ct)
    { var r = await svc.GetContributionSummaryAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    // --- Multi-education (item 6) -------------------------------------------

    [HttpGet("educations")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> ListEducations(Guid id, CancellationToken ct)
    { var r = await svc.ListEducationsAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("educations")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> AddEducation(Guid id, [FromBody] AddMemberEducationDto dto, CancellationToken ct)
    { var r = await svc.AddEducationAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("educations/{eduId:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateEducation(Guid id, Guid eduId, [FromBody] UpdateMemberEducationDto dto, CancellationToken ct)
    { var r = await svc.UpdateEducationAsync(id, eduId, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("educations/{eduId:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> DeleteEducation(Guid id, Guid eduId, CancellationToken ct)
    { var r = await svc.DeleteEducationAsync(id, eduId, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }

    // --- Wealth declaration (item C) -----------------------------------------
    // Read gated by member.wealth.view; edits use the standard member.update permission
    // (admins manage all members; members editing their own go through the change-request
    // queue, same as other tabs).

    [HttpGet("assets")]
    [Authorize(Policy = "member.wealth.view")]
    public async Task<IActionResult> ListAssets(Guid id, CancellationToken ct)
    { var r = await svc.ListAssetsAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("assets")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> AddAsset(Guid id, [FromBody] AddMemberAssetDto dto, CancellationToken ct)
    { var r = await svc.AddAssetAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("assets/{assetId:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateAsset(Guid id, Guid assetId, [FromBody] UpdateMemberAssetDto dto, CancellationToken ct)
    { var r = await svc.UpdateAssetAsync(id, assetId, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("assets/{assetId:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> DeleteAsset(Guid id, Guid assetId, CancellationToken ct)
    { var r = await svc.DeleteAssetAsync(id, assetId, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }
}
