using Jamaat.Application.Organisations;
using Jamaat.Contracts.Organisations;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/organisations")]
public sealed class OrganisationsController(IOrganisationService svc, IMembershipService memSvc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> List([FromQuery] OrganisationListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    { var r = await svc.GetAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create([FromBody] CreateOrganisationDto dto, CancellationToken ct)
    { var r = await svc.CreateAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateOrganisationDto dto, CancellationToken ct)
    { var r = await svc.UpdateAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    { var r = await svc.DeleteAsync(id, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpGet("memberships")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> ListMemberships([FromQuery] MembershipListQuery q, CancellationToken ct) => Ok(await memSvc.ListAsync(q, ct));

    [HttpPost("memberships")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> CreateMembership([FromBody] CreateMembershipDto dto, CancellationToken ct)
    { var r = await memSvc.CreateAsync(dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("memberships/{id:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> UpdateMembership(Guid id, [FromBody] UpdateMembershipDto dto, CancellationToken ct)
    { var r = await memSvc.UpdateAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("memberships/{id:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> DeleteMembership(Guid id, CancellationToken ct)
    { var r = await memSvc.DeleteAsync(id, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }
}
