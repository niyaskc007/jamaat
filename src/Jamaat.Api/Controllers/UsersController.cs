using System.Security.Claims;
using Jamaat.Application.Common;
using Jamaat.Contracts.Users;
using Jamaat.Domain.Abstractions;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize(Policy = "admin.users")]
[Route("api/v1/users")]
public sealed class UsersController(
    UserManager<ApplicationUser> userMgr,
    RoleManager<ApplicationRole> roleMgr,
    ITenantContext tenant) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] UserListQuery q, CancellationToken ct)
    {
        IQueryable<ApplicationUser> query = userMgr.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(u => EF.Functions.Like(u.UserName!, $"%{s}%") || EF.Functions.Like(u.FullName, $"%{s}%") || (u.Email != null && EF.Functions.Like(u.Email, $"%{s}%")));
        }
        if (q.Active is not null) query = query.Where(u => u.IsActive == q.Active);

        var total = await query.CountAsync(ct);
        var users = await query.OrderBy(u => u.UserName).Skip((q.Page - 1) * q.PageSize).Take(q.PageSize).ToListAsync(ct);

        var dtos = new List<UserDto>();
        foreach (var u in users)
        {
            var roles = await userMgr.GetRolesAsync(u);
            dtos.Add(new UserDto(u.Id, u.UserName ?? "", u.FullName, u.Email, u.ItsNumber, roles.ToList(), u.IsActive, u.PreferredLanguage, u.LastLoginAtUtc));
        }
        return Ok(new PagedResult<UserDto>(dtos, total, q.Page, q.PageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var u = await userMgr.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        var roles = await userMgr.GetRolesAsync(u);
        return Ok(new UserDto(u.Id, u.UserName ?? "", u.FullName, u.Email, u.ItsNumber, roles.ToList(), u.IsActive, u.PreferredLanguage, u.LastLoginAtUtc));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserDto dto)
    {
        if (await userMgr.FindByEmailAsync(dto.Email) is not null)
            return Conflict(new { error = "email_duplicate", detail = "A user with this email already exists." });
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(), TenantId = tenant.TenantId,
            UserName = dto.Email, Email = dto.Email, EmailConfirmed = true,
            FullName = dto.FullName, ItsNumber = dto.ItsNumber, IsActive = true,
            PreferredLanguage = dto.PreferredLanguage ?? "en",
        };
        var r = await userMgr.CreateAsync(user, dto.Password);
        if (!r.Succeeded) return BadRequest(new { errors = r.Errors.Select(e => e.Description) });
        foreach (var role in dto.Roles) await userMgr.AddToRoleAsync(user, role);
        // Copy role claims to user for JWT (permissions)
        foreach (var role in dto.Roles)
        {
            var ar = await roleMgr.FindByNameAsync(role);
            if (ar is null) continue;
            var claims = await roleMgr.GetClaimsAsync(ar);
            foreach (var c in claims.Where(x => x.Type == "permission"))
                await userMgr.AddClaimAsync(user, new Claim("permission", c.Value));
        }
        return Ok(user.Id);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserDto dto)
    {
        var u = await userMgr.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        u.FullName = dto.FullName;
        u.ItsNumber = dto.ItsNumber;
        u.IsActive = dto.IsActive;
        u.PreferredLanguage = dto.PreferredLanguage;
        await userMgr.UpdateAsync(u);

        var existing = (await userMgr.GetRolesAsync(u)).ToHashSet();
        var desired = dto.Roles.ToHashSet();
        foreach (var r in existing.Except(desired)) await userMgr.RemoveFromRoleAsync(u, r);
        foreach (var r in desired.Except(existing)) await userMgr.AddToRoleAsync(u, r);
        return NoContent();
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetPasswordDto dto)
    {
        var u = await userMgr.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        var token = await userMgr.GeneratePasswordResetTokenAsync(u);
        var r = await userMgr.ResetPasswordAsync(u, token, dto.NewPassword);
        if (!r.Succeeded) return BadRequest(new { errors = r.Errors.Select(e => e.Description) });
        return NoContent();
    }

    [HttpGet("/api/v1/roles")]
    [Authorize(Policy = "admin.roles")]
    public async Task<IActionResult> Roles(CancellationToken ct)
    {
        var roles = await roleMgr.Roles.AsNoTracking().ToListAsync(ct);
        var result = new List<RoleDto>();
        foreach (var r in roles)
        {
            var claims = await roleMgr.GetClaimsAsync(r);
            result.Add(new RoleDto(r.Id, r.Name ?? "", r.Description, claims.Where(c => c.Type == "permission").Select(c => c.Value).ToList()));
        }
        return Ok(result);
    }
}
