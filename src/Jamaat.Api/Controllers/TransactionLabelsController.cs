using Jamaat.Application.TransactionLabels;
using Jamaat.Contracts.TransactionLabels;
using Jamaat.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Configurable approval / transaction labels per (FundType, LabelType). The lookup
/// hierarchy is per-fund → system-wide (FundTypeId=null) → built-in default.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/transaction-labels")]
public sealed class TransactionLabelsController(ITransactionLabelService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> List([FromQuery] Guid? fundTypeId, [FromQuery] TransactionLabelType? labelType, CancellationToken ct)
        => Ok(await svc.ListAsync(fundTypeId, labelType, ct));

    [HttpGet("resolve")]
    [Authorize]
    public async Task<IActionResult> Resolve([FromQuery] Guid? fundTypeId, [FromQuery] TransactionLabelType labelType, CancellationToken ct)
        => Ok(new { label = await svc.ResolveAsync(fundTypeId, labelType, ct) });

    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create([FromBody] CreateTransactionLabelDto dto, CancellationToken ct)
    { var r = await svc.CreateAsync(dto, ct); return r.IsSuccess ? CreatedAtAction(nameof(List), null, r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTransactionLabelDto dto, CancellationToken ct)
    { var r = await svc.UpdateAsync(id, dto, ct); return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error); }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    { var r = await svc.DeleteAsync(id, ct); return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error); }
}
