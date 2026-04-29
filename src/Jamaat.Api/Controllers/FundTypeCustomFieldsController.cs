using Jamaat.Application.FundTypes;
using Jamaat.Contracts.FundTypes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Admin-managed custom fields per fund type. The receipt form reads the active fields for the
/// chosen fund and renders inputs dynamically - values land in <c>Receipt.CustomFieldsJson</c>.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/fund-types/{fundTypeId:guid}/custom-fields")]
public sealed class FundTypeCustomFieldsController(IFundTypeCustomFieldService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> List(Guid fundTypeId, [FromQuery] bool? activeOnly, CancellationToken ct)
        => Ok(await svc.ListAsync(fundTypeId, activeOnly, ct));

    /// <summary>List endpoint for callers who already know the fund type and want active fields.</summary>
    /// <remarks>
    /// Receipt form uses this - it doesn't have admin.masterdata permission on a normal counter
    /// user. We expose a permissive variant under the receipts hierarchy that requires only
    /// receipt.create. See the <c>ReceiptCustomFieldsController</c> below.
    /// </remarks>
    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create(Guid fundTypeId, [FromBody] CreateFundTypeCustomFieldDto dto, CancellationToken ct)
    {
        // Caller's URL fund-type id wins over the body, to prevent cross-fund injection.
        var safe = dto with { FundTypeId = fundTypeId };
        var r = await svc.CreateAsync(safe, ct);
        return r.IsSuccess ? CreatedAtAction(nameof(List), new { fundTypeId }, r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid fundTypeId, Guid id, [FromBody] UpdateFundTypeCustomFieldDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid fundTypeId, Guid id, CancellationToken ct)
    {
        var r = await svc.DeleteAsync(id, ct);
        return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error);
    }
}

/// <summary>
/// Read-only endpoint the receipt form hits - same data as the admin endpoint but only
/// requires receipt.view so cashiers can render the dynamic fields without admin.masterdata.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/fund-types/{fundTypeId:guid}/active-custom-fields")]
public sealed class FundTypeActiveCustomFieldsController(IFundTypeCustomFieldService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "receipt.view")]
    public async Task<IActionResult> List(Guid fundTypeId, CancellationToken ct)
        => Ok(await svc.ListAsync(fundTypeId, activeOnly: true, ct));
}
