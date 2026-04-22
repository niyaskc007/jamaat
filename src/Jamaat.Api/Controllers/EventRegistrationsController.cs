using Jamaat.Application.Events;
using Jamaat.Contracts.Events;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/event-registrations")]
public sealed class EventRegistrationsController(IEventRegistrationService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> List([FromQuery] RegistrationListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    { var r = await svc.GetAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpGet("code/{code}")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> GetByCode(string code, CancellationToken ct)
    { var r = await svc.GetByCodeAsync(code, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Admin-side registration (create on behalf of a member or an external guest).</summary>
    [HttpPost]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Create([FromBody] CreateRegistrationDto dto, CancellationToken ct)
    { var r = await svc.RegisterAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRegistrationDto dto, CancellationToken ct)
    { var r = await svc.UpdateAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/confirm")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Confirm(Guid id, CancellationToken ct)
    { var r = await svc.ConfirmAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/check-in")]
    [Authorize(Policy = "event.scan")]
    public async Task<IActionResult> CheckIn(Guid id, CancellationToken ct)
    { var r = await svc.CheckInAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "event.manage")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelRegistrationDto dto, CancellationToken ct)
    { var r = await svc.CancelAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }
}
