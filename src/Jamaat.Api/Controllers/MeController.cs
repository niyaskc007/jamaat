using System.Security.Claims;
using Jamaat.Contracts.Auth;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/me")]
public sealed class MeController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly RoleManager<ApplicationRole> _roles;

    public MeController(UserManager<ApplicationUser> users, RoleManager<ApplicationRole> roles)
    {
        _users = users;
        _roles = roles;
    }

    [HttpGet]
    public async Task<ActionResult<UserInfo>> Get(CancellationToken ct)
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id is null) return Unauthorized();
        var user = await _users.FindByIdAsync(id);
        if (user is null) return NotFound();

        var roles = (await _users.GetRolesAsync(user)).ToArray();
        // Mirror JwtTokenService: permissions are the union of user-claims + role-claims.
        var userClaims = await _users.GetClaimsAsync(user);
        var perms = userClaims.Where(c => c.Type == "permission").Select(c => c.Value)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var roleName in roles)
        {
            var role = await _roles.FindByNameAsync(roleName);
            if (role is null) continue;
            foreach (var c in (await _roles.GetClaimsAsync(role)).Where(c => c.Type == "permission"))
                perms.Add(c.Value);
        }

        return Ok(new UserInfo(
            user.Id, user.UserName ?? string.Empty, user.FullName, user.Email,
            user.TenantId, roles, perms.ToArray(), user.PreferredLanguage));
    }
}
