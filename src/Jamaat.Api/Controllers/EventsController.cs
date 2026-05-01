using Jamaat.Application.Events;
using Jamaat.Application.Members;
using Jamaat.Contracts.Events;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/events")]
public sealed class EventsController(IEventService svc, IEventRegistrationService regSvc, IPhotoStorage photoStorage, IEventAssetStorage assetStorage) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> List([FromQuery] EventListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    { var r = await svc.GetAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpGet("slug/{slug}")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> GetBySlug(string slug, CancellationToken ct)
    { var r = await svc.GetBySlugAsync(slug, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Create([FromBody] CreateEventDto dto, CancellationToken ct)
    { var r = await svc.CreateAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateEventDto dto, CancellationToken ct)
    { var r = await svc.UpdateAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}/branding")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> UpdateBranding(Guid id, [FromBody] UpdateEventBrandingDto dto, CancellationToken ct)
    { var r = await svc.UpdateBrandingAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}/share")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> UpdateShare(Guid id, [FromBody] UpdateEventShareDto dto, CancellationToken ct)
    { var r = await svc.UpdateShareAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}/registration-settings")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> UpdateRegistrationSettings(Guid id, [FromBody] UpdateRegistrationSettingsDto dto, CancellationToken ct)
    { var r = await svc.UpdateRegistrationSettingsAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}/agenda")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> ReplaceAgenda(Guid id, [FromBody] ReplaceAgendaDto dto, CancellationToken ct)
    { var r = await svc.ReplaceAgendaAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    { var r = await svc.DeleteAsync(id, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }

    // Cover image upload reuses the shared IPhotoStorage adapter. Files live under App_Data/photos/members by
    // default but we namespace event cover images by prefixing with "evt-" in the Guid mapping.
    [HttpPost("{id:guid}/cover-upload")]
    [Authorize(Policy = "event.manage")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadCover(Guid id, [FromForm] IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return ErrorMapper.ToActionResult(this, Error.Validation("cover.empty", "File is required."));
        if (!(file.ContentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ?? false))
            return ErrorMapper.ToActionResult(this, Error.Validation("cover.invalid_type", "Only image uploads are accepted."));

        // Store under a derived "event" key (reuse member photo storage by xor-ing an event marker)
        var key = Guid.Parse(id.ToString("N")[..8] + Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee").ToString("N")[8..]);
        await using var stream = file.OpenReadStream();
        await photoStorage.StoreAsync(key, stream, file.ContentType, ct);
        // Append a cache-buster so the browser refetches when the same URL is reused after a re-upload.
        var publicUrl = $"/api/v1/events/{id}/cover/file?v={DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
        // SetCoverImageAsync only touches CoverImageUrl - prevents the prior bug where uploading a
        // cover wiped the user's logo, primary colour, and accent colour.
        var r = await svc.SetCoverImageAsync(id, publicUrl, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpGet("{id:guid}/cover/file")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCoverFile(Guid id, CancellationToken ct)
    {
        var key = Guid.Parse(id.ToString("N")[..8] + Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee").ToString("N")[8..]);
        var opened = await photoStorage.OpenAsync(key, ct);
        if (opened is null) return NotFound();
        return File(opened.Value.Content, opened.Value.ContentType);
    }

    // Generic asset upload - returns a stable URL the caller can save into any image/logo/photo field on a section.
    // Each upload gets its own asset Guid so a single event can host many uploads (logo, hero bg, gallery, sponsor logos…).
    [HttpPost("{id:guid}/assets/upload")]
    [Authorize(Policy = "event.manage")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadAsset(Guid id, [FromForm] IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return ErrorMapper.ToActionResult(this, Error.Validation("asset.empty", "File is required."));
        if (!(file.ContentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ?? false))
            return ErrorMapper.ToActionResult(this, Error.Validation("asset.invalid_type", "Only image uploads are accepted."));

        var assetId = Guid.NewGuid();
        await using var stream = file.OpenReadStream();
        var url = await assetStorage.StoreAsync(id, assetId, stream, file.ContentType, ct);
        return Ok(new { assetId, url });
    }

    [HttpGet("{id:guid}/assets/{assetId:guid}/file")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAssetFile(Guid id, Guid assetId, CancellationToken ct)
    {
        var opened = await assetStorage.OpenAsync(id, assetId, ct);
        if (opened is null) return NotFound();
        return File(opened.Value.Content, opened.Value.ContentType);
    }

    // ---- Scans (existing) ------------------------------------------------

    [HttpGet("scans")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> ListScans([FromQuery] ScanListQuery q, CancellationToken ct) => Ok(await svc.ListScansAsync(q, ct));

    [HttpPost("scans")]
    [Authorize(Policy = "event.scan")]
    public async Task<IActionResult> Scan([FromBody] ScanRequestDto dto, CancellationToken ct)
    { var r = await svc.ScanAsync(dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("scans/{id:guid}")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> RemoveScan(Guid id, CancellationToken ct)
    { var r = await svc.RemoveScanAsync(id, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }

    // ---- Registrations (admin-side under the event) ----------------------

    [HttpGet("{id:guid}/registrations")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> ListRegistrations(Guid id, [FromQuery] RegistrationListQuery q, CancellationToken ct)
    { q = q with { EventId = id }; return Ok(await regSvc.ListAsync(q, ct)); }
}
