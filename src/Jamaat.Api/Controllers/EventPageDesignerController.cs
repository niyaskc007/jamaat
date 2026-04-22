using Jamaat.Application.Events;
using Jamaat.Contracts.Events;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/events/{eventId:guid}/page")]
public sealed class EventPageDesignerController(IEventPageDesignerService svc) : ControllerBase
{
    [HttpGet("sections")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> List(Guid eventId, CancellationToken ct)
        => Ok(await svc.ListAsync(eventId, ct));

    [HttpPost("sections")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Add(Guid eventId, [FromBody] AddSectionDto dto, CancellationToken ct)
    { var r = await svc.AddAsync(eventId, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("sections/{sectionId:guid}")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Update(Guid eventId, Guid sectionId, [FromBody] UpdateSectionDto dto, CancellationToken ct)
    { var r = await svc.UpdateAsync(sectionId, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("sections/{sectionId:guid}")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Remove(Guid eventId, Guid sectionId, CancellationToken ct)
    { var r = await svc.RemoveAsync(sectionId, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("sections/reorder")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Reorder(Guid eventId, [FromBody] ReorderSectionsDto dto, CancellationToken ct)
    { var r = await svc.ReorderAsync(eventId, dto, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpGet("presets")]
    [Authorize(Policy = "event.view")]
    public IActionResult ListPresets() => Ok(svc.ListPresets());

    [HttpPost("apply-preset")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> ApplyPreset(Guid eventId, [FromBody] ApplyPresetDto dto, CancellationToken ct)
    { var r = await svc.ApplyPresetAsync(eventId, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }
}
