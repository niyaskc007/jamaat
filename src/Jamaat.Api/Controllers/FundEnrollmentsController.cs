using Jamaat.Application.FundEnrollments;
using Jamaat.Contracts.FundEnrollments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/fund-enrollments")]
public sealed class FundEnrollmentsController(IFundEnrollmentService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "enrollment.view")]
    public async Task<IActionResult> List([FromQuery] FundEnrollmentListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "enrollment.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    { var r = await svc.GetAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost]
    [Authorize(Policy = "enrollment.create")]
    public async Task<IActionResult> Create([FromBody] CreateFundEnrollmentDto dto, CancellationToken ct)
    { var r = await svc.CreateAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "enrollment.update")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFundEnrollmentDto dto, CancellationToken ct)
    { var r = await svc.UpdateAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "enrollment.approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    { var r = await svc.ApproveAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Approve many enrollments in one go (each goes through ApproveAsync individually).</summary>
    /// <remarks>
    /// Caps at 500 ids. Returns counts of approved vs. failed so the caller can reconcile.
    /// We loop rather than build a batch SQL update because ApproveAsync runs domain logic
    /// (snapshots, audit interceptor) that we want to keep consistent with the per-id call.
    /// </remarks>
    [HttpPost("bulk/approve")]
    [Authorize(Policy = "enrollment.approve")]
    public async Task<IActionResult> ApproveBulk([FromBody] BulkEnrollmentRequest req, CancellationToken ct)
    {
        var ids = req.Ids.Distinct().Take(500).ToArray();
        if (ids.Length == 0) return BadRequest(new { error = "no_ids" });
        var ok = 0; var failed = new List<Guid>();
        foreach (var id in ids)
        {
            var r = await svc.ApproveAsync(id, ct);
            if (r.IsSuccess) ok++; else failed.Add(id);
        }
        return Ok(new { approvedCount = ok, failedCount = failed.Count, failedIds = failed });
    }

    [HttpPost("{id:guid}/pause")]
    [Authorize(Policy = "enrollment.update")]
    public async Task<IActionResult> Pause(Guid id, CancellationToken ct)
    { var r = await svc.PauseAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/resume")]
    [Authorize(Policy = "enrollment.update")]
    public async Task<IActionResult> Resume(Guid id, CancellationToken ct)
    { var r = await svc.ResumeAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "enrollment.update")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    { var r = await svc.CancelAsync(id, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }
}

public sealed record BulkEnrollmentRequest(IReadOnlyCollection<Guid> Ids);
