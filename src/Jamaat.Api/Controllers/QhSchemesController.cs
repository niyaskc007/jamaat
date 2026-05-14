using Jamaat.Application.QarzanHasana;
using Jamaat.Contracts.QarzanHasana;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// CRUD for QH scheme master-data. Reads are open to anyone with qh.view (operators
/// + L1/L2 approvers + read-only viewers - they all need the list to render loan
/// detail pages). Writes are admin-only.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/qh-schemes")]
public sealed class QhSchemesController(IQhSchemeService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, CancellationToken ct = default)
        => Ok(await svc.ListAsync(includeInactive, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create([FromBody] CreateQhSchemeDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateQhSchemeDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var r = await svc.DeleteAsync(id, ct);
        return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error);
    }
}
