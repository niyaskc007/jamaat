using Jamaat.Application.Admin;
using Jamaat.Contracts.Admin;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// SuperAdmin two-person deletion workflow for posted financial documents.
///
/// Three actors involved:
///   - Requester: an `admin.delete.transaction` holder who initiates by creating a
///     <see cref="TransactionDeletionRequestDto"/>. The doc is untouched at this point.
///   - Approver: a DIFFERENT `admin.delete.approve` holder who confirms. On approval the
///     service calls IReceiptService.ReverseAsync / IVoucherService.ReverseAsync, then
///     stamps the doc soft-deleted with retention. The two-person rule is enforced inside
///     the domain entity, not just here.
///   - Either party can Reject; the doc is left alone and the request transitions to Rejected.
///
/// The inbox endpoint (`GET /api/v1/admin/transaction-deletion-requests`) is what powers the
/// "Pending Approvals" page so the approver knows what to act on.
[ApiController]
[Authorize]
[Route("api/v1/admin/transaction-deletion-requests")]
public sealed class TransactionDeletionController(ITransactionDeletionService svc) : ControllerBase
{
    /// Step 1: SuperAdmin A requests deletion. Returns the persisted request with status=Pending.
    [HttpPost]
    [Authorize(Policy = "admin.delete.transaction")]
    public async Task<IActionResult> CreateRequest([FromBody] RequestTransactionDeletionDto dto, CancellationToken ct)
    {
        var r = await svc.RequestAsync(dto, ct);
        return r.IsSuccess ? Ok(r.Value) : Map(r.Error);
    }

    /// Step 2: SuperAdmin B (must be different from A) approves. The service runs the
    /// reversal and stamps the doc soft-deleted; if reversal fails the request is rolled
    /// back to a Rejected-with-retry state.
    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "admin.delete.approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveTransactionDeletionDto dto, CancellationToken ct)
    {
        var r = await svc.ApproveAsync(id, dto ?? new ApproveTransactionDeletionDto(null), ct);
        return r.IsSuccess ? Ok(r.Value) : Map(r.Error);
    }

    /// Reject (second SuperAdmin says no) or withdraw (requester changes their mind).
    /// Note is required (min 10 chars).
    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = "admin.delete.transaction")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectTransactionDeletionDto dto, CancellationToken ct)
    {
        var r = await svc.RejectAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : Map(r.Error);
    }

    /// Inbox. Filter by `?status=Pending` (or Approved/Rejected/Expired) to narrow. Sorted
    /// by RequestedAtUtc descending.
    [HttpGet]
    [Authorize(Policy = "admin.delete.transaction")]
    public async Task<IActionResult> List([FromQuery] string? status, CancellationToken ct)
    {
        var r = await svc.ListAsync(status, ct);
        return r.IsSuccess ? Ok(r.Value) : Map(r.Error);
    }

    /// One row by id.
    [HttpGet("{id:guid}")]
    [Authorize(Policy = "admin.delete.transaction")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : Map(r.Error);
    }

    private IActionResult Map(Error err) => err.Type switch
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
