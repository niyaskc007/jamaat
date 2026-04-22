using Jamaat.Application.Members;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/members")]
public sealed class MembersController(IMemberService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> List([FromQuery] MemberListQuery query, CancellationToken ct)
    {
        var result = await svc.ListAsync(query, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await svc.GetByIdAsync(id, ct);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error);
    }

    [HttpPost]
    [Authorize(Policy = "member.create")]
    public async Task<IActionResult> Create([FromBody] CreateMemberDto dto, CancellationToken ct)
    {
        var result = await svc.CreateAsync(dto, ct);
        return result.IsSuccess
            ? CreatedAtAction(nameof(GetById), new { id = result.Value.Id }, result.Value)
            : Problem(result.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMemberDto dto, CancellationToken ct)
    {
        var result = await svc.UpdateAsync(id, dto, ct);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "member.delete")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var result = await svc.DeleteAsync(id, ct);
        return result.IsSuccess ? NoContent() : Problem(result.Error);
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
