using Jamaat.Application.Accounting;
using Jamaat.Application.Currencies;
using Jamaat.Contracts.Currencies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/currencies")]
public sealed class CurrenciesController(ICurrencyService svc, IFxConverter fx) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> List([FromQuery] bool? active, CancellationToken ct) => Ok(await svc.ListAsync(active, ct));

    [HttpGet("base")]
    public async Task<IActionResult> Base(CancellationToken ct) => Ok(new { baseCurrency = await fx.GetBaseCurrencyAsync(ct) });

    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create([FromBody] CreateCurrencyDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCurrencyDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/set-base")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> SetBase(Guid id, CancellationToken ct)
    {
        var r = await svc.SetBaseAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var r = await svc.DeleteAsync(id, ct);
        return r.IsSuccess ? NoContent() : ControllerResults.Problem(this, r.Error);
    }

    [HttpGet("convert")]
    public async Task<IActionResult> Convert([FromQuery] decimal amount, [FromQuery] string from, [FromQuery] DateOnly? asOf, CancellationToken ct)
    {
        try
        {
            var conv = await fx.ConvertToBaseAsync(amount, from, asOf ?? DateOnly.FromDateTime(DateTime.UtcNow), ct);
            return Ok(new FxConversionDto(conv.OriginalAmount, conv.OriginalCurrency, conv.Rate, conv.BaseAmount, conv.BaseCurrency));
        }
        catch (InvalidOperationException e)
        {
            return BadRequest(new { error = "no_rate", detail = e.Message });
        }
    }
}

[ApiController]
[Authorize]
[Route("api/v1/exchange-rates")]
public sealed class ExchangeRatesController(IExchangeRateService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> List([FromQuery] string? from, [FromQuery] string? to, [FromQuery] DateOnly? asOf, CancellationToken ct)
        => Ok(await svc.ListAsync(from, to, asOf, ct));

    [HttpPost]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Create([FromBody] CreateExchangeRateDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateExchangeRateDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "admin.masterdata")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var r = await svc.DeleteAsync(id, ct);
        return r.IsSuccess ? NoContent() : ControllerResults.Problem(this, r.Error);
    }
}
