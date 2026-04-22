using Jamaat.Application.FundTypes;
using Jamaat.Contracts.FundTypes;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/fund-types")]
public sealed class FundTypesController(IFundTypeService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> List([FromQuery] FundTypeListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create([FromBody] CreateFundTypeDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFundTypeDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var r = await svc.DeleteAsync(id, ct);
        return r.IsSuccess ? NoContent() : ControllerResults.Problem(this, r.Error);
    }
}

internal static class ControllerResults
{
    public static IActionResult Problem(ControllerBase ctrl, Error err) => err.Type switch
    {
        ErrorType.NotFound     => ctrl.Problem(detail: err.Message, statusCode: StatusCodes.Status404NotFound, title: err.Code),
        ErrorType.Validation   => ctrl.Problem(detail: err.Message, statusCode: StatusCodes.Status400BadRequest, title: err.Code),
        ErrorType.Conflict     => ctrl.Problem(detail: err.Message, statusCode: StatusCodes.Status409Conflict, title: err.Code),
        ErrorType.BusinessRule => ctrl.Problem(detail: err.Message, statusCode: StatusCodes.Status422UnprocessableEntity, title: err.Code),
        ErrorType.Unauthorized => ctrl.Problem(detail: err.Message, statusCode: StatusCodes.Status401Unauthorized, title: err.Code),
        ErrorType.Forbidden    => ctrl.Problem(detail: err.Message, statusCode: StatusCodes.Status403Forbidden, title: err.Code),
        _                      => ctrl.Problem(detail: err.Message, statusCode: StatusCodes.Status500InternalServerError, title: err.Code),
    };
}
