using Jamaat.Application.Common;
using Jamaat.Application.Members;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/members")]
public sealed class MembersController(IMemberService svc, IExcelExporter excel) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> List([FromQuery] MemberListQuery query, CancellationToken ct)
    {
        var result = await svc.ListAsync(query, ct);
        return Ok(result);
    }

    /// <summary>Export the filtered member list as XLSX.</summary>
    /// <remarks>Honours the same query params as the list endpoint, capped at 5000 rows.</remarks>
    [HttpGet("export.xlsx")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> Export([FromQuery] MemberListQuery query, CancellationToken ct)
    {
        // Cap at 5000 rows in one shot — anything larger should use a dedicated report.
        var capped = query with { Page = 1, PageSize = 5000 };
        var page = await svc.ListAsync(capped, ct);
        var sheet = new ExcelSheet(
            "Members",
            new[]
            {
                new ExcelColumn("ITS"),
                new ExcelColumn("Full name"),
                new ExcelColumn("Arabic"),
                new ExcelColumn("Phone"),
                new ExcelColumn("Email"),
                new ExcelColumn("Status"),
                new ExcelColumn("Verified"),
                new ExcelColumn("Verified on", ExcelColumnType.Date),
                new ExcelColumn("Created", ExcelColumnType.DateTime),
            },
            page.Items.Select(m => (IReadOnlyList<object?>)new object?[]
            {
                m.ItsNumber, m.FullName, m.FullNameArabic, m.Phone, m.Email,
                m.Status.ToString(),
                m.DataVerificationStatus.ToString(),
                m.DataVerifiedOn,
                m.CreatedAtUtc,
            }).ToList());
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, XlsxContentType, $"members_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    /// <summary>Import members from an XLSX upload (the "ITS sync via Excel" workflow).</summary>
    /// <remarks>Upserts by ITS — existing members get updated, new ones get created. Per-row errors are returned alongside the commit count.</remarks>
    [HttpPost("import")]
    [Authorize(Policy = "member.create")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Import(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "no_file" });
        await using var s = file.OpenReadStream();
        var result = await svc.ImportAsync(s, ct);
        return Ok(result);
    }

    /// <summary>Download an empty XLSX template with the headers the Members import accepts.</summary>
    [HttpGet("import-template.xlsx")]
    [Authorize(Policy = "member.view")]
    public IActionResult ImportTemplate()
    {
        var sheet = new ExcelSheet(
            "Members template",
            new[]
            {
                new ExcelColumn("ITS"),
                new ExcelColumn("Full name"),
                new ExcelColumn("Arabic"),
                new ExcelColumn("Hindi"),
                new ExcelColumn("Urdu"),
                new ExcelColumn("Phone"),
                new ExcelColumn("Email"),
                new ExcelColumn("Address"),
            },
            // One illustrative row so operators see the expected shape; replace before upload.
            new[] { (IReadOnlyList<object?>)new object?[] {
                "40123001", "Mufaddal Saifuddin", "مفضل سيف الدين", null, null,
                "+971501000001", "mufaddal.s@example.com", "House 1, Hakimi Compound",
            }});
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, XlsxContentType, "members-import-template.xlsx");
    }

    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await svc.GetByIdAsync(id, ct);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error);
    }

    [HttpPost]
    [Authorize(Policy = "member.create")]
    public async Task<IActionResult> Create([FromBody] CreateMemberDto dto, CancellationToken ct)
    {
        var result = await svc.CreateAsync(dto, ct);
        return result.IsSuccess
            ? CreatedAtAction(nameof(GetById), new { id = result.Value.Id }, result.Value)
            : Problem(result.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "member.update")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMemberDto dto, CancellationToken ct)
    {
        var result = await svc.UpdateAsync(id, dto, ct);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "member.delete")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var result = await svc.DeleteAsync(id, ct);
        return result.IsSuccess ? NoContent() : Problem(result.Error);
    }

    private IActionResult Problem(Error err) => err.Type switch
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
