using Jamaat.Application.Events;
using Jamaat.Contracts.Events;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Public-facing endpoints for the Event Portal. Read endpoints are anonymous; registration submission
/// requires a login unless the event has <c>OpenToNonMembers=true</c>.
/// </summary>
[ApiController]
[Route("api/v1/portal/events")]
public sealed class EventPortalController(IEventPortalService portalSvc, IEventRegistrationService regSvc) : ControllerBase
{
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> ListUpcoming([FromQuery] int max = 50, CancellationToken ct = default)
        => Ok(await portalSvc.ListUpcomingAsync(max, ct));

    [HttpGet("{slug}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetBySlug(string slug, CancellationToken ct)
    { var r = await portalSvc.GetBySlugAsync(slug, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Registers the current member or an external guest for an event.</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] CreateRegistrationDto dto, CancellationToken ct)
    { var r = await regSvc.RegisterAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(LookupByCode), new { code = r.Value.RegistrationCode }, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Public receipt lookup by registration code (for "check your booking" pages).</summary>
    [HttpGet("registration/{code}")]
    [AllowAnonymous]
    public async Task<IActionResult> LookupByCode(string code, CancellationToken ct)
    { var r = await regSvc.GetByCodeAsync(code, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Self-service cancellation - requires the registration code as a weak token.</summary>
    [HttpPost("registration/{code}/cancel")]
    [AllowAnonymous]
    public async Task<IActionResult> CancelByCode(string code, [FromBody] CancelRegistrationDto dto, CancellationToken ct)
    {
        var lookup = await regSvc.GetByCodeAsync(code, ct);
        if (!lookup.IsSuccess) return ErrorMapper.ToActionResult(this, lookup.Error);
        var cancel = await regSvc.CancelAsync(lookup.Value.Id, dto, ct);
        return cancel.IsSuccess ? Ok(cancel.Value) : ErrorMapper.ToActionResult(this, cancel.Error);
    }
}
