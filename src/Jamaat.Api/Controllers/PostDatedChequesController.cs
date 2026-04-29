using Jamaat.Application.PostDatedCheques;
using Jamaat.Contracts.PostDatedCheques;
using Jamaat.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Track post-dated cheques pledged against commitment installments. The cheque sits in
/// state until the bank clears it — only then does the system issue a real Receipt that
/// posts to the ledger and pays down the installment.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/post-dated-cheques")]
public sealed class PostDatedChequesController(IPostDatedChequeService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> List([FromQuery] PostDatedChequeStatus? status, CancellationToken ct)
        => Ok(await svc.ListAsync(status, ct));

    [HttpGet("commitment/{commitmentId:guid}")]
    [Authorize(Policy = "commitment.view")]
    public async Task<IActionResult> ListByCommitment(Guid commitmentId, CancellationToken ct)
        => Ok(await svc.ListByCommitmentAsync(commitmentId, ct));

    [HttpPost]
    [Authorize(Policy = "commitment.update")]
    public async Task<IActionResult> Add([FromBody] CreatePostDatedChequeDto dto, CancellationToken ct)
    { var r = await svc.AddAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(List), null, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/deposit")]
    [Authorize(Policy = "commitment.update")]
    public async Task<IActionResult> MarkDeposited(Guid id, [FromBody] DepositPostDatedChequeDto dto, CancellationToken ct)
    { var r = await svc.MarkDepositedAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    /// <summary>Mark a cheque cleared. Issues a real Receipt against the linked installment.</summary>
    [HttpPost("{id:guid}/clear")]
    [Authorize(Policy = "receipt.create")]
    public async Task<IActionResult> MarkCleared(Guid id, [FromBody] ClearPostDatedChequeDto dto, CancellationToken ct)
    { var r = await svc.MarkClearedAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/bounce")]
    [Authorize(Policy = "commitment.update")]
    public async Task<IActionResult> MarkBounced(Guid id, [FromBody] BouncePostDatedChequeDto dto, CancellationToken ct)
    { var r = await svc.MarkBouncedAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "commitment.update")]
    public async Task<IActionResult> MarkCancelled(Guid id, [FromBody] CancelPostDatedChequeDto dto, CancellationToken ct)
    { var r = await svc.MarkCancelledAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }
}
