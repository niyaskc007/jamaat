using Jamaat.Application.Commitments;
using Jamaat.Application.Common;
using Jamaat.Contracts.Commitments;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/commitments")]
public sealed class CommitmentsController(ICommitmentService svc, IExcelExporter excel) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> List([FromQuery] CommitmentListQuery q, CancellationToken ct)
        => Ok(await svc.ListAsync(q, ct));

    [HttpGet("export.xlsx")]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> Export([FromQuery] CommitmentListQuery q, CancellationToken ct)
    {
        var capped = q with { Page = 1, PageSize = 5000 };
        var page = await svc.ListAsync(capped, ct);
        var sheet = new ExcelSheet(
            "Commitments",
            new[]
            {
                new ExcelColumn("Code"),
                new ExcelColumn("Party"),
                new ExcelColumn("Party type"),
                new ExcelColumn("Fund"),
                new ExcelColumn("Total", ExcelColumnType.Currency),
                new ExcelColumn("Paid", ExcelColumnType.Currency),
                new ExcelColumn("Remaining", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Instalments", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Frequency"),
                new ExcelColumn("Start", ExcelColumnType.Date),
                new ExcelColumn("Status"),
            },
            page.Items.Select(c => (IReadOnlyList<object?>)new object?[]
            {
                c.Code, c.PartyName, c.PartyType.ToString(), $"{c.FundTypeCode} — {c.FundTypeName}",
                c.TotalAmount, c.PaidAmount, c.RemainingAmount, c.Currency,
                c.NumberOfInstallments, c.Frequency.ToString(), c.StartDate, c.Status.ToString(),
            }).ToList());
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"commitments_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpGet("{id:guid}/payments")]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> Payments(Guid id, CancellationToken ct)
    {
        var r = await svc.ListPaymentsAsync(id, ct);
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
