using Jamaat.Application.Common;
using Jamaat.Application.Families;
using Jamaat.Contracts.Families;
using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/families")]
public sealed class FamiliesController(IFamilyService svc, IExcelExporter excel) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "family.view")]
    public async Task<IActionResult> List([FromQuery] FamilyListQuery query, CancellationToken ct)
        => Ok(await svc.ListAsync(query, ct));

    /// <summary>Export the filtered family list as XLSX (capped at 5000 rows).</summary>
    [HttpGet("export.xlsx")]
    [Authorize(Policy = "family.view")]
    public async Task<IActionResult> Export([FromQuery] FamilyListQuery query, CancellationToken ct)
    {
        var capped = query with { Page = 1, PageSize = 5000 };
        var page = await svc.ListAsync(capped, ct);
        var sheet = new ExcelSheet(
            "Families",
            new[]
            {
                new ExcelColumn("Code"),
                new ExcelColumn("Family name"),
                new ExcelColumn("Head ITS"),
                new ExcelColumn("Head name"),
                new ExcelColumn("Phone"),
                new ExcelColumn("Email"),
                new ExcelColumn("Address"),
                new ExcelColumn("Members", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Active"),
                new ExcelColumn("Created", ExcelColumnType.DateTime),
            },
            page.Items.Select(f => (IReadOnlyList<object?>)new object?[]
            {
                f.Code, f.FamilyName, f.HeadItsNumber, f.HeadName,
                f.ContactPhone, f.ContactEmail, f.Address,
                f.MemberCount, f.IsActive ? "Yes" : "No", f.CreatedAtUtc,
            }).ToList());
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, XlsxContentType, $"families_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    [HttpPost("import")]
    [Authorize(Policy = "family.create")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Import(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "no_file" });
        await using var s = file.OpenReadStream();
        var result = await svc.ImportAsync(s, ct);
        return Ok(result);
    }

    [HttpGet("import-template.xlsx")]
    [Authorize(Policy = "family.view")]
    public IActionResult ImportTemplate()
    {
        var sheet = new ExcelSheet(
            "Families template",
            new[]
            {
                new ExcelColumn("Code"),
                new ExcelColumn("Family name"),
                new ExcelColumn("Head ITS"),
                new ExcelColumn("Phone"),
                new ExcelColumn("Email"),
                new ExcelColumn("Address"),
                new ExcelColumn("Notes"),
            },
            new[] { (IReadOnlyList<object?>)new object?[] {
                "F-00001", "Saifuddin family", "40123001",
                "+971501000001", "head@example.com",
                "House 1, Hakimi Compound", "Auto-imported from migration",
            }});
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, XlsxContentType, "families-import-template.xlsx");
    }

    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "family.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await svc.GetAsync(id, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpPost]
    [Authorize(Policy = "family.create")]
    public async Task<IActionResult> Create([FromBody] CreateFamilyDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess
            ? CreatedAtAction(nameof(Get), new { id = r.Value.Id }, r.Value)
            : Problem(r.Error);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFamilyDto dto, CancellationToken ct)
    {
        var r = await svc.UpdateAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : Problem(r.Error);
    }

    [HttpPost("{id:guid}/members")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> AssignMember(Guid id, [FromBody] AssignMemberToFamilyDto dto, CancellationToken ct)
    {
        var r = await svc.AssignMemberAsync(id, dto, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpDelete("{id:guid}/members/{memberId:guid}")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberId, CancellationToken ct)
    {
        var r = await svc.RemoveMemberAsync(id, memberId, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
    }

    [HttpPost("{id:guid}/transfer-headship")]
    [Authorize(Policy = "family.update")]
    public async Task<IActionResult> TransferHeadship(Guid id, [FromBody] TransferHeadshipDto dto, CancellationToken ct)
    {
        var r = await svc.TransferHeadshipAsync(id, dto, ct);
        return r.IsSuccess ? NoContent() : Problem(r.Error);
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
