using Jamaat.Application.ErrorLogs;
using Jamaat.Contracts.ErrorLogs;
using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;
using Jamaat.Infrastructure.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/error-logs")]
public sealed class ErrorLogsController(IErrorLogService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "admin.errorlogs")]
    public async Task<IActionResult> List([FromQuery] ErrorLogListQuery query, CancellationToken ct)
    {
        var result = await svc.ListAsync(query, ct);
        return Ok(result);
    }

    [HttpGet("stats")]
    [Authorize(Policy = "admin.errorlogs")]
    public async Task<IActionResult> Stats(CancellationToken ct) => Ok(await svc.StatsAsync(ct));

    [HttpGet("{id:long}")]
    [Authorize(Policy = "admin.errorlogs")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var result = await svc.GetAsync(id, ct);
        return result.IsSuccess ? Ok(result.Value) : ProblemFor(result.Error);
    }

    [HttpPost("{id:long}/review")]
    [Authorize(Policy = "admin.errorlogs")]
    public async Task<IActionResult> Review(long id, CancellationToken ct)
    {
        var result = await svc.MarkReviewedAsync(id, ct);
        return result.IsSuccess ? NoContent() : ProblemFor(result.Error);
    }

    [HttpPost("{id:long}/resolve")]
    [Authorize(Policy = "admin.errorlogs")]
    public async Task<IActionResult> Resolve(long id, [FromBody] ResolveErrorLogDto dto, CancellationToken ct)
    {
        var result = await svc.MarkResolvedAsync(id, dto, ct);
        return result.IsSuccess ? NoContent() : ProblemFor(result.Error);
    }

    [HttpPost("{id:long}/ignore")]
    [Authorize(Policy = "admin.errorlogs")]
    public async Task<IActionResult> Ignore(long id, CancellationToken ct)
    {
        var result = await svc.IgnoreAsync(id, ct);
        return result.IsSuccess ? NoContent() : ProblemFor(result.Error);
    }

    /// <summary>Client-side error ingestion — called by the web app and (later) mobile.</summary>
    [HttpPost("report")]
    [AllowAnonymous]   // unauthenticated clients (e.g. login page crash) can still report
    public async Task<IActionResult> Report([FromBody] ReportClientErrorDto dto, [FromServices] ICorrelationContext correlation, CancellationToken ct)
    {
        var id = await svc.RecordAsync(new RecordErrorRequest(
            Source: ErrorSource.Web,
            Severity: dto.Severity,
            Message: dto.Message,
            ExceptionType: dto.ExceptionType,
            StackTrace: dto.StackTrace,
            Endpoint: dto.Endpoint,
            HttpMethod: dto.HttpMethod,
            HttpStatus: dto.HttpStatus,
            CorrelationId: dto.CorrelationId ?? correlation.CorrelationId,
            UserAgent: dto.UserAgent ?? correlation.UserAgent,
            IpAddress: correlation.IpAddress), ct);
        return Accepted(new { id });
    }

    private IActionResult ProblemFor(Error err) => err.Type switch
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
