using Jamaat.Application.Commitments;
using Jamaat.Contracts.Commitments;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/commitment-agreement-templates")]
public sealed class CommitmentAgreementTemplatesController(ICommitmentAgreementTemplateService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> List([FromQuery] CommitmentAgreementTemplateListQuery q, CancellationToken ct)
        => Ok(await svc.ListAsync(q, ct));

    [HttpGet("placeholders")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Placeholders(CancellationToken ct)
        => Ok(await svc.GetPlaceholdersAsync(ct));

    [HttpPost("render")]
    [Authorize(Policy = "admin.masterdata")]
    public IActionResult Render([FromBody] RenderAgreementRequest req)
        => Ok(svc.Render(req));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create([FromBody] CreateCommitmentAgreementTemplateDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess
            ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value)
            : Problem(r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCommitmentAgreementTemplateDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var r = await svc.DeleteAsync(id, ct);
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
