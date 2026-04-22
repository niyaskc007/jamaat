using Jamaat.Application.Commitments;
using Jamaat.Contracts.Commitments;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/commitments")]
public sealed class CommitmentsController(ICommitmentService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> List([FromQuery] CommitmentListQuery q, CancellationToken ct)
        => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpPost("preview-schedule")]
    [Authorize(Policy = "commitment.create")]
    public async Task<IActionResult> PreviewSchedule([FromBody] PreviewScheduleRequest req, CancellationToken ct)
        => Ok(await svc.PreviewScheduleAsync(req, ct));

    [HttpPost]
    [Authorize(Policy = "commitment.create")]
    public async Task<IActionResult> CreateDraft([FromBody] CreateCommitmentDto dto, CancellationToken ct)
    {
        var r = await svc.CreateDraftAsync(dto, ct);
        return r.IsSuccess
            ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value)
            : Problem(r.Error);
    }

    [HttpPost("{id:guid}/accept-agreement")]
    [Authorize(Policy = "commitment.create")]
    public async Task<IActionResult> AcceptAgreement(Guid id, [FromBody] AcceptAgreementDto dto, CancellationToken ct)
    {
        var r = await svc.AcceptAgreementAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpPost("{id:guid}/pause")]
    [Authorize(Policy = "commitment.update")]
    public async Task<IActionResult> Pause(Guid id, CancellationToken ct)
    {
        var r = await svc.PauseAsync(id, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpPost("{id:guid}/resume")]
    [Authorize(Policy = "commitment.update")]
    public async Task<IActionResult> Resume(Guid id, CancellationToken ct)
    {
        var r = await svc.ResumeAsync(id, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "commitment.cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelCommitmentDto dto, CancellationToken ct)
    {
        var r = await svc.CancelAsync(id, dto, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpPost("{id:guid}/waive-installment")]
    [Authorize(Policy = "commitment.waive")]
    public async Task<IActionResult> WaiveInstallment(Guid id, [FromBody] WaiveInstallmentDto dto, CancellationToken ct)
    {
        var r = await svc.WaiveInstallmentAsync(id, dto, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpPost("{id:guid}/refresh-overdue")]
    [Authorize(Policy = "commitment.update")]
    public async Task<IActionResult> RefreshOverdue(Guid id, CancellationToken ct)
    {
        var r = await svc.RefreshOverdueAsync(id, ct);
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
