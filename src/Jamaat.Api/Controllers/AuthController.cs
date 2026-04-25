using Jamaat.Contracts.Auth;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly ITokenService _tokens;

    public AuthController(UserManager<ApplicationUser> users, ITokenService tokens)
    {
        _users = users;
        _tokens = tokens;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        var user = await _users.FindByEmailAsync(req.Email) ?? await _users.FindByNameAsync(req.Email);
        if (user is null || !user.IsActive) return Unauthorized(new { error = "invalid_credentials" });

        var ok = await _users.CheckPasswordAsync(user, req.Password);
        if (!ok) return Unauthorized(new { error = "invalid_credentials" });

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var response = await _tokens.IssueTokensAsync(user, ip, ct);
        return Ok(response);
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshRequest req, CancellationToken ct)
    {
        try
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
            var response = await _tokens.RefreshAsync(req.RefreshToken, ip, ct);
            return Ok(response);
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { error = "invalid_refresh_token" });
        }
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest req, CancellationToken ct)
    {
        await _tokens.RevokeAsync(req.RefreshToken, ct);
        return NoContent();
    }

    /// <summary>Profile of the currently signed-in user.</summary>
    /// <remarks>
    /// Returns the same id / userName / fullName / tenantId / permissions shape the login
    /// response uses, so the client can store it under the same authStore type.
    /// </remarks>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await _users.FindByNameAsync(User.Identity?.Name ?? string.Empty);
        if (user is null) return Unauthorized();
        var permissions = (await _users.GetClaimsAsync(user))
            .Where(c => c.Type == "permission")
            .Select(c => c.Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            email = user.Email,
            fullName = user.FullName,
            tenantId = user.TenantId,
            preferredLanguage = user.PreferredLanguage,
            permissions,
        });
    }

    /// <summary>Change the signed-in user's password (requires current password).</summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest(new { error = "new_password_required" });

        var user = await _users.FindByNameAsync(User.Identity?.Name ?? string.Empty);
        if (user is null) return Unauthorized();

        var result = await _users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new { error = "change_failed", details = result.Errors.Select(e => e.Description) });

        return NoContent();
    }
}

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
