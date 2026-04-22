using Jamaat.Application.QarzanHasana;
using Jamaat.Contracts.QarzanHasana;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/qarzan-hasana")]
public sealed class QarzanHasanaController(IQarzanHasanaService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> List([FromQuery] QarzanHasanaListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    { var r = await svc.GetAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> Create([FromBody] CreateQarzanHasanaDto dto, CancellationToken ct)
    { var r = await svc.CreateDraftAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> UpdateDraft(Guid id, [FromBody] UpdateQarzanHasanaDraftDto dto, CancellationToken ct)
    { var r = await svc.UpdateDraftAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/submit")]
    [Authorize(Policy = "qh.create")]
    public async Task<IActionResult> Submit(Guid id, CancellationToken ct)
    { var r = await svc.SubmitAsync(id, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/approve-l1")]
    [Authorize(Policy = "qh.approve_l1")]
    public async Task<IActionResult> ApproveL1(Guid id, [FromBody] ApproveL1Dto dto, CancellationToken ct)
    { var r = await svc.ApproveLevel1Async(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/approve-l2")]
    [Authorize(Policy = "qh.approve_l2")]
    public async Task<IActionResult> ApproveL2(Guid id, [FromBody] ApproveL2Dto dto, CancellationToken ct)
    { var r = await svc.ApproveLevel2Async(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = "qh.approve_l1")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectQhDto dto, CancellationToken ct)
    { var r = await svc.RejectAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "qh.cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelQhDto dto, CancellationToken ct)
    { var r = await svc.CancelAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/disburse")]
    [Authorize(Policy = "qh.disburse")]
    public async Task<IActionResult> Disburse(Guid id, [FromBody] DisburseQhDto dto, CancellationToken ct)
    { var r = await svc.DisburseAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/waive-installment")]
    [Authorize(Policy = "qh.waive")]
    public async Task<IActionResult> Waive(Guid id, [FromBody] WaiveQhInstallmentDto dto, CancellationToken ct)
    { var r = await svc.WaiveInstallmentAsync(id, dto, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }
}
