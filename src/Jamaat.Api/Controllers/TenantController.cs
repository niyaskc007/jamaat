using Jamaat.Application.Tenants;
using Jamaat.Contracts.Tenants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/tenant")]
public sealed class TenantController(ITenantService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> Get(CancellationToken ct)
    { var r = await svc.GetCurrentAsync(ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update([FromBody] UpdateTenantDto dto, CancellationToken ct)
    { var r = await svc.UpdateCurrentAsync(dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }
}
