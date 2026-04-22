using Jamaat.Application.Vouchers;
using Jamaat.Contracts.Vouchers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/vouchers")]
public sealed class VouchersController(IVoucherService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> List([FromQuery] VoucherListQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost]
    [Authorize(Policy = "voucher.create")]
    public async Task<IActionResult> Create([FromBody] CreateVoucherDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "voucher.approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        var r = await svc.ApproveAndPayAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "voucher.cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelVoucherDto dto, CancellationToken ct)
    {
        var r = await svc.CancelAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/reverse")]
    [Authorize(Policy = "voucher.reverse")]
    public async Task<IActionResult> Reverse(Guid id, [FromBody] ReverseVoucherDto dto, CancellationToken ct)
    {
        var r = await svc.ReverseAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpGet("{id:guid}/pdf")]
    [Authorize(Policy = "voucher.view")]
    public async Task<IActionResult> Pdf(Guid id, CancellationToken ct)
    {
        var r = await svc.RenderPdfAsync(id, ct);
        return r.IsSuccess ? File(r.Value, "application/pdf", $"voucher-{id}.pdf") : ControllerResults.Problem(this, r.Error);
    }
}
