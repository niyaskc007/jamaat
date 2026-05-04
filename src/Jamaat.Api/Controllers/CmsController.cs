using Jamaat.Application.Cms;
using Jamaat.Contracts.Cms;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// Public + admin CMS endpoints. Read paths are anonymous so the login screen and
/// /legal/{slug} pages render before the user authenticates. Write paths require
/// the cms.manage permission.
[ApiController]
[Route("api/v1/cms")]
public sealed class CmsController(ICmsService svc) : ControllerBase
{
    // ---- Public reads (no auth) -----------------------------------------
    [HttpGet("pages")]
    [AllowAnonymous]
    public async Task<IActionResult> ListPages(CancellationToken ct)
        => Ok(await svc.ListPagesAsync(includeUnpublished: false, ct));

    [HttpGet("pages/{slug}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPageBySlug(string slug, CancellationToken ct)
    {
        var r = await svc.GetPageBySlugAsync(slug, includeUnpublished: false, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpGet("blocks")]
    [AllowAnonymous]
    public async Task<IActionResult> ListBlocks([FromQuery] string? prefix, CancellationToken ct)
        => Ok(await svc.ListBlocksAsync(prefix, ct));

    [HttpGet("blocks/{key}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetBlock(string key, CancellationToken ct)
    {
        var b = await svc.GetBlockAsync(key, ct);
        return b is null ? NotFound() : Ok(b);
    }

    // ---- Admin CRUD (cms.manage) ----------------------------------------
    [HttpGet("admin/pages")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> AdminListPages(CancellationToken ct)
        => Ok(await svc.ListPagesAsync(includeUnpublished: true, ct));

    [HttpGet("admin/pages/{id:guid}")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> AdminGetPage(Guid id, CancellationToken ct)
    {
        var r = await svc.GetPageByIdAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("admin/pages")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> CreatePage([FromBody] CreateCmsPageDto dto, CancellationToken ct)
    {
        var r = await svc.CreatePageAsync(dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPut("admin/pages/{id:guid}")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> UpdatePage(Guid id, [FromBody] UpdateCmsPageDto dto, CancellationToken ct)
    {
        var r = await svc.UpdatePageAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpDelete("admin/pages/{id:guid}")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> DeletePage(Guid id, CancellationToken ct)
    {
        var r = await svc.DeletePageAsync(id, ct);
        return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpGet("admin/blocks")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> AdminListBlocks([FromQuery] string? prefix, CancellationToken ct)
        => Ok(await svc.ListBlocksAsync(prefix, ct));

    [HttpPut("admin/blocks/{key}")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> UpsertBlock(string key, [FromBody] UpsertCmsBlockDto dto, CancellationToken ct)
        => Ok(await svc.UpsertBlockAsync(key, dto, ct));

    [HttpDelete("admin/blocks/{key}")]
    [Authorize(Policy = "cms.manage")]
    public async Task<IActionResult> DeleteBlock(string key, CancellationToken ct)
    {
        var r = await svc.DeleteBlockAsync(key, ct);
        return r.IsSuccess ? NoContent() : ErrorMapper.ToActionResult(this, r.Error);
    }
}
