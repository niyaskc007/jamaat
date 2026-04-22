using Jamaat.Application.Families;
using Jamaat.Contracts.Families;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/families")]
public sealed class FamiliesController(IFamilyService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "family.view")]
    public async Task<IActionResult> List([FromQuery] FamilyListQuery query, CancellationToken ct)
        => Ok(await svc.ListAsync(query, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "family.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpPost]
    [Authorize(Policy = "family.create")]
    public async Task<IActionResult> Create([FromBody] CreateFamilyDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess
            ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value)
            : Problem(r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFamilyDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpPost("{id:guid}/members")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> AssignMember(Guid id, [FromBody] AssignMemberToFamilyDto dto, CancellationToken ct)
    {
        var r = await svc.AssignMemberAsync(id, dto, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpDelete("{id:guid}/members/{memberId:guid}")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberId, CancellationToken ct)
    {
        var r = await svc.RemoveMemberAsync(id, memberId, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpPost("{id:guid}/transfer-headship")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> TransferHeadship(Guid id, [FromBody] TransferHeadshipDto dto, CancellationToken ct)
    {
        var r = await svc.TransferHeadshipAsync(id, dto, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    private IActionResult Problem(Error err) => err.Type switch
    {
        ErrorType.NotFound     => Problem(detail: err.Message, statusCode: StatusCodes.Status404NotFound, title: err.Code),
        ErrorType.Validation   => Problem(detail: err.Message, statusCode: StatusCodes.Status400BadRequest, title: err.Code),
        ErrorType.Conflict     => Problem(detail: err.Message, statusCode: StatusCodes.Status409Conflict, title: err.Code),
        ErrorType.BusinessRule => Problem(detail: err.Message, statusCode: StatusCodes.Status422UnprocessableEntity, title: err.Code),
        ErrorType.Unauthorized => Problem(detail: err.Message, statusCode: StatusCodes.Status401Unauthorized, title: err.Code),
        ErrorType.Forbidden    => Problem(detail: err.Message, statusCode: StatusCodes.Status403Forbidden, title: err.Code),
        _                      => Problem(detail: err.Message, statusCode: StatusCodes.Status500InternalServerError, title: err.Code),
    };
}
