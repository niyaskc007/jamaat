using System.Security.Claims;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Persistence.Seed;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Roles + permissions admin. Surface: list roles, list permissions on a role, add/remove
/// claims on a role, add/remove claims on an individual user (cross-functional grants), and
/// list every known permission so the matrix UI can render.
/// </summary>
/// <remarks>
/// Effective permissions for a user = (claims on every role they're in) ∪ (claims on the user
/// directly). The JWT token enrichment already handles this, so adding either kind of claim
/// takes effect on the next login. Auth-claim mutations are gated by <c>admin.roles</c>.
/// </remarks>
[ApiController]
[Authorize]
[Route("api/v1/roles")]
public sealed class RolesController(
    UserManager<ApplicationUser> users,
    RoleManager<ApplicationRole> roles) : ControllerBase
{
    /// <summary>List every permission the system understands. Drives the matrix UI.</summary>
    [HttpGet("/api/v1/permissions")]
    [Authorize(Policy = "admin.roles")]
    public IActionResult Permissions() => Ok(DatabaseSeeder.AllPermissions);

    /// <summary>List every role with the permissions assigned to it.</summary>
    [HttpGet]
    [Authorize(Policy = "admin.roles")]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var allRoles = await roles.Roles.AsNoTracking().ToListAsync(ct);
        var result = new List<object>();
        foreach (var r in allRoles)
        {
            var claims = await roles.GetClaimsAsync(r);
            result.Add(new
            {
                id = r.Id,
                name = r.Name,
                description = r.Description,
                permissions = claims.Where(c => c.Type == "permission").Select(c => c.Value).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s).ToList(),
            });
        }
        return Ok(result);
    }

    [HttpPost("{name}/permissions")]
    [Authorize(Policy = "admin.roles")]
    public async Task<IActionResult> AddPermissionToRole(string name, [FromBody] PermissionPayload body)
    {
        if (string.IsNullOrWhiteSpace(body.Permission)) return BadRequest(new { error = "permission_required" });
        var role = await roles.FindByNameAsync(name);
        if (role is null) return NotFound(new { error = "role_not_found" });

        var claims = await roles.GetClaimsAsync(role);
        var alreadyOnRole = claims.Any(c => c.Type == "permission" && string.Equals(c.Value, body.Permission, StringComparison.OrdinalIgnoreCase));
        if (!alreadyOnRole)
        {
            var result = await roles.AddClaimAsync(role, new Claim("permission", body.Permission));
            if (!result.Succeeded) return BadRequest(new { error = "add_failed", details = result.Errors.Select(e => e.Description) });
        }

        // Propagate to every user currently in this role so JWT issuance picks it up at next login.
        var inRole = await users.GetUsersInRoleAsync(role.Name!);
        foreach (var u in inRole)
        {
            var userClaims = await users.GetClaimsAsync(u);
            if (!userClaims.Any(c => c.Type == "permission" && string.Equals(c.Value, body.Permission, StringComparison.OrdinalIgnoreCase)))
                await users.AddClaimAsync(u, new Claim("permission", body.Permission));
        }

        return Ok(new { ok = true });
    }

    [HttpDelete("{name}/permissions/{permission}")]
    [Authorize(Policy = "admin.roles")]
    public async Task<IActionResult> RemovePermissionFromRole(string name, string permission)
    {
        var role = await roles.FindByNameAsync(name);
        if (role is null) return NotFound(new { error = "role_not_found" });

        var claims = await roles.GetClaimsAsync(role);
        var match = claims.FirstOrDefault(c => c.Type == "permission" && string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase));
        if (match is not null)
        {
            var result = await roles.RemoveClaimAsync(role, match);
            if (!result.Succeeded) return BadRequest(new { error = "remove_failed" });
        }

        // Strip the user-claim copy on every member of this role - but only if no *other* role
        // they're in still grants the same permission. Direct grants (added via UserPermissions)
        // are indistinguishable from copies, so we err on the side of removing copies; admins can
        // re-add a direct grant via the Users tab if needed.
        var inRole = await users.GetUsersInRoleAsync(role.Name!);
        foreach (var u in inRole)
        {
            var userRoles = await users.GetRolesAsync(u);
            var grantedByOtherRole = false;
            foreach (var rn in userRoles)
            {
                if (string.Equals(rn, role.Name, StringComparison.OrdinalIgnoreCase)) continue;
                var other = await roles.FindByNameAsync(rn);
                if (other is null) continue;
                if ((await roles.GetClaimsAsync(other)).Any(c => c.Type == "permission" && string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase)))
                { grantedByOtherRole = true; break; }
            }
            if (grantedByOtherRole) continue;

            var userClaims = await users.GetClaimsAsync(u);
            var dupes = userClaims.Where(c => c.Type == "permission" && string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase)).ToList();
            foreach (var c in dupes) await users.RemoveClaimAsync(u, c);
        }

        return NoContent();
    }
}

/// <summary>User-scoped permission management. Lets an admin grant "cross-functional" permissions
/// to a single user without changing their role - e.g. give a Counter user voucher.approve once.</summary>
[ApiController]
[Authorize]
[Route("api/v1/users")]
public sealed class UserPermissionsController(UserManager<ApplicationUser> users) : ControllerBase
{
    [HttpGet("{id:guid}/permissions")]
    [Authorize(Policy = "admin.roles")]
    public async Task<IActionResult> List(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound(new { error = "user_not_found" });

        var direct = (await users.GetClaimsAsync(user)).Where(c => c.Type == "permission").Select(c => c.Value).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s).ToList();
        var roleNames = await users.GetRolesAsync(user);
        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            email = user.Email,
            fullName = user.FullName,
            isActive = user.IsActive,
            roles = roleNames,
            directPermissions = direct,
        });
    }

    [HttpPost("{id:guid}/permissions")]
    [Authorize(Policy = "admin.roles")]
    public async Task<IActionResult> Add(Guid id, [FromBody] PermissionPayload body)
    {
        if (string.IsNullOrWhiteSpace(body.Permission)) return BadRequest(new { error = "permission_required" });
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound(new { error = "user_not_found" });

        var existing = (await users.GetClaimsAsync(user)).Any(c => c.Type == "permission" && string.Equals(c.Value, body.Permission, StringComparison.OrdinalIgnoreCase));
        if (existing) return Ok(new { ok = true });

        var result = await users.AddClaimAsync(user, new Claim("permission", body.Permission));
        return result.Succeeded ? Ok(new { ok = true }) : BadRequest(new { error = "add_failed", details = result.Errors.Select(e => e.Description) });
    }

    [HttpDelete("{id:guid}/permissions/{permission}")]
    [Authorize(Policy = "admin.roles")]
    public async Task<IActionResult> Remove(Guid id, string permission)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound(new { error = "user_not_found" });

        var match = (await users.GetClaimsAsync(user)).FirstOrDefault(c => c.Type == "permission" && string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase));
        if (match is null) return NoContent();
        var result = await users.RemoveClaimAsync(user, match);
        return result.Succeeded ? NoContent() : BadRequest(new { error = "remove_failed" });
    }
}

public sealed record PermissionPayload(string Permission);
