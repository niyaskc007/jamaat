using Jamaat.Application.Admin;
using Jamaat.Contracts.Admin;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// SuperAdmin destructive-delete surface. Every action is gated by an `admin.delete.*` perm
/// (or `admin.restore` / `admin.purge.now`) which the seeder grants to Administrator and
/// SuperAdmin by default. The actual work lives in <see cref="IDeletionService"/>; this
/// controller only handles HTTP framing.
///
/// Endpoints are intentionally generic over entity type: the client passes a string like
/// "FundType" or "Sector" and the service dispatches against its allowlist. Free-form types
/// are rejected with 404.
[ApiController]
[Authorize]
[Route("api/v1/admin")]
public sealed class AdminDeletionController(IDeletionService svc) : ControllerBase
{
    /// Impact preview - no side effects. Frontend renders this in the confirmation modal:
    /// blockers (red), cascades (yellow), redactions (gray). The "Delete" button stays
    /// disabled while any blocker is present.
    [HttpGet("delete-impact/{entityType}/{id:guid}")]
    [Authorize(Policy = "admin.delete.master")]
    public async Task<IActionResult> Impact(string entityType, Guid id, CancellationToken ct)
    {
        var r = await svc.ImpactAsync(entityType, id, ct);
        return r.IsSuccess ? Ok(r.Value) : Map(r.Error);
    }

    /// Soft-delete: stamps the four marker columns + writes an AuditLog row. Reason is
    /// required (min 10 chars). Cascading children move with the parent.
    [HttpPost("soft-delete/{entityType}/{id:guid}")]
    [Authorize(Policy = "admin.delete.master")]
    public async Task<IActionResult> SoftDelete(string entityType, Guid id, [FromBody] SoftDeleteRequestDto dto, CancellationToken ct)
    {
        var r = await svc.SoftDeleteAsync(entityType, id, dto?.Reason ?? string.Empty, ct);
        return r.IsSuccess ? NoContent() : Map(r.Error);
    }

    /// Restore a soft-deleted row before its retention deadline. Cascading children come back too.
    [HttpPost("restore/{entityType}/{id:guid}")]
    [Authorize(Policy = "admin.restore")]
    public async Task<IActionResult> Restore(string entityType, Guid id, CancellationToken ct)
    {
        var r = await svc.RestoreAsync(entityType, id, ct);
        return r.IsSuccess ? NoContent() : Map(r.Error);
    }

    /// Hard-delete NOW, bypassing the 30-day retention window. Requires the row to already
    /// be soft-deleted - you can't purge a live record without confirming the soft-delete first.
    [HttpPost("purge/{entityType}/{id:guid}")]
    [Authorize(Policy = "admin.purge.now")]
    public async Task<IActionResult> Purge(string entityType, Guid id, CancellationToken ct)
    {
        var r = await svc.PurgeAsync(entityType, id, ct);
        return r.IsSuccess ? NoContent() : Map(r.Error);
    }

    /// Trash list: every soft-deleted row across the supported entity types in the
    /// caller's tenant. Optional filter by entityType. Sorted by retention deadline asc.
    [HttpGet("trash")]
    [Authorize(Policy = "admin.delete.master")]
    public async Task<IActionResult> Trash([FromQuery] string? entityType, CancellationToken ct)
    {
        var r = await svc.ListTrashAsync(entityType, ct);
        return r.IsSuccess ? Ok(r.Value) : Map(r.Error);
    }

    /// The static allowlist of entity types this controller understands. Surfaces on the
    /// frontend so the Trash page knows which filter values are valid.
    [HttpGet("delete-supported-types")]
    [Authorize(Policy = "admin.delete.master")]
    public IActionResult SupportedTypes() => Ok(svc.SupportedEntityTypes);

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
