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

    public MeController(UserManager<ApplicationUser> users) => _users = users;

    [HttpGet]
    public async Task<ActionResult<UserInfo>> Get(CancellationToken ct)
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id is null) return Unauthorized();
        var user = await _users.FindByIdAsync(id);
        if (user is null) return NotFound();

        var roles = await _users.GetRolesAsync(user);
        var claims = await _users.GetClaimsAsync(user);
        var perms = claims.Where(c => c.Type == "permission").Select(c => c.Value).ToArray();

        return Ok(new UserInfo(
            user.Id, user.UserName ?? string.Empty, user.FullName, user.Email,
            user.TenantId, roles.ToArray(), perms, user.PreferredLanguage));
    }
}
