using Jamaat.Contracts.Auth;
using Jamaat.Domain.Abstractions;
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
    private readonly RoleManager<ApplicationRole> _roleMgr;
    private readonly ITokenService _tokens;
    private readonly ILoginAuditService _audit;
    private readonly ITemporaryPasswordService _tempPw;
    private readonly IClock _clock;

    public AuthController(UserManager<ApplicationUser> users, RoleManager<ApplicationRole> roleMgr, ITokenService tokens,
        ILoginAuditService audit, ITemporaryPasswordService tempPw, IClock clock)
    {
        _users = users;
        _roleMgr = roleMgr;
        _tokens = tokens;
        _audit = audit;
        _tempPw = tempPw;
        _clock = clock;
    }

    /// <summary>
    /// Logs the user in. Identifier may be email, username, or ITS number - whichever the user
    /// has on file. Enforces:
    ///   - IsActive (directory-active)
    ///   - IsLoginAllowed (admin gate, separate from IsActive)
    ///   - Password match (Identity's PasswordHasher)
    ///   - Temp-password expiry (if MustChangePassword and the temp window has elapsed, reject)
    /// Every attempt - success or failure - is recorded via ILoginAuditService.
    ///
    /// On success with MustChangePassword=true, returns 200 with PasswordChangeRequiredResponse
    /// and NO JWT. The client redirects to the change-password screen and posts to
    /// /auth/complete-first-login with the new password to receive a real AuthResponse.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers.UserAgent.ToString();

        var user = await ResolveUserAsync(req.Email);
        if (user is null)
        {
            await _audit.RecordAsync(null, req.Email, success: false, "user_not_found", ip, ua, ct);
            return Unauthorized(new { error = "invalid_credentials" });
        }

        if (!user.IsActive)
        {
            await _audit.RecordAsync(user.Id, req.Email, success: false, "user_inactive", ip, ua, ct);
            return Unauthorized(new { error = "invalid_credentials" });
        }

        if (!user.IsLoginAllowed)
        {
            await _audit.RecordAsync(user.Id, req.Email, success: false, "login_not_allowed", ip, ua, ct);
            return Unauthorized(new { error = "login_not_allowed", message = "Your account is not enabled for self-service login. Please contact an administrator." });
        }

        var passwordOk = await _users.CheckPasswordAsync(user, req.Password);
        if (!passwordOk)
        {
            await _audit.RecordAsync(user.Id, req.Email, success: false, "bad_password", ip, ua, ct);
            return Unauthorized(new { error = "invalid_credentials" });
        }

        // Temp-password expiry: if a temp window was set and it has elapsed, the supplied password
        // (even if correct) is treated as expired - admin must re-issue.
        if (user.MustChangePassword && user.TemporaryPasswordExpiresAtUtc is { } expiry && expiry < _clock.UtcNow)
        {
            await _audit.RecordAsync(user.Id, req.Email, success: false, "temp_password_expired", ip, ua, ct);
            return Unauthorized(new { error = "temp_password_expired", message = "Your temporary password has expired. Please contact an administrator to issue a new one." });
        }

        // Force first-login change: no JWT yet.
        if (user.MustChangePassword)
        {
            await _audit.RecordAsync(user.Id, req.Email, success: true, "password_change_required", ip, ua, ct);
            return Ok(new PasswordChangeRequiredResponse(
                user.Id, user.UserName ?? string.Empty, true,
                user.TemporaryPasswordExpiresAtUtc,
                "You must change your password before you can use the app."));
        }

        await _audit.RecordAsync(user.Id, req.Email, success: true, null, ip, ua, ct);
        var response = await _tokens.IssueTokensAsync(user, ip, ct);
        return Ok(response);
    }

    /// <summary>
    /// Used right after a successful login that returned PasswordChangeRequiredResponse: the user
    /// re-supplies their identifier + temp password and a new permanent password. We verify the
    /// temp pw, rotate it, clear MustChangePassword + TemporaryPasswordPlaintext, stamp
    /// LastPasswordChangedAtUtc, and return a real AuthResponse so the client can move on.
    /// </summary>
    [HttpPost("complete-first-login")]
    [AllowAnonymous]
    public async Task<IActionResult> CompleteFirstLogin([FromBody] CompleteFirstLoginRequest req, CancellationToken ct)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers.UserAgent.ToString();

        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { error = "weak_password", message = "New password must be at least 8 characters." });

        var user = await ResolveUserAsync(req.Identifier);
        if (user is null) return Unauthorized(new { error = "invalid_credentials" });
        if (!user.IsActive || !user.IsLoginAllowed) return Unauthorized(new { error = "invalid_credentials" });

        var ok = await _users.CheckPasswordAsync(user, req.CurrentPassword);
        if (!ok)
        {
            await _audit.RecordAsync(user.Id, req.Identifier, false, "complete_first_login_bad_temp", ip, ua, ct);
            return Unauthorized(new { error = "invalid_credentials" });
        }

        if (user.TemporaryPasswordExpiresAtUtc is { } expiry && expiry < _clock.UtcNow)
            return Unauthorized(new { error = "temp_password_expired" });

        // Set the new permanent password via the same reset-token dance UserManager exposes.
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var reset = await _users.ResetPasswordAsync(user, token, req.NewPassword);
        if (!reset.Succeeded)
            return BadRequest(new { error = "change_failed", details = reset.Errors.Select(e => e.Description) });

        user.MustChangePassword = false;
        user.TemporaryPasswordPlaintext = null;
        user.TemporaryPasswordExpiresAtUtc = null;
        user.LastPasswordChangedAtUtc = _clock.UtcNow;
        await _users.UpdateAsync(user);

        await _audit.RecordAsync(user.Id, req.Identifier, true, "first_login_completed", ip, ua, ct);
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
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await _users.FindByNameAsync(User.Identity?.Name ?? string.Empty);
        if (user is null) return Unauthorized();
        // Mirror JwtTokenService: union user-claim permissions with claims attached to every
        // role the user belongs to, so a permission granted at the role layer flows to /auth/me
        // immediately - no per-user reconciliation required.
        var permSet = (await _users.GetClaimsAsync(user))
            .Where(c => c.Type == "permission")
            .Select(c => c.Value)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var roleName in await _users.GetRolesAsync(user))
        {
            var role = await _roleMgr.FindByNameAsync(roleName);
            if (role is null) continue;
            foreach (var c in (await _roleMgr.GetClaimsAsync(role)).Where(c => c.Type == "permission"))
                permSet.Add(c.Value);
        }
        var permissions = permSet.ToArray();
        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            email = user.Email,
            fullName = user.FullName,
            tenantId = user.TenantId,
            preferredLanguage = user.PreferredLanguage,
            mustChangePassword = user.MustChangePassword,
            permissions,
        });
    }

    /// <summary>Change own password (knows the current). Distinct from complete-first-login
    /// in that the user is already authenticated; used for routine rotation.</summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { error = "weak_password" });

        var user = await _users.FindByNameAsync(User.Identity?.Name ?? string.Empty);
        if (user is null) return Unauthorized();

        var result = await _users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new { error = "change_failed", details = result.Errors.Select(e => e.Description) });

        user.MustChangePassword = false;
        user.TemporaryPasswordPlaintext = null;
        user.TemporaryPasswordExpiresAtUtc = null;
        user.LastPasswordChangedAtUtc = _clock.UtcNow;
        await _users.UpdateAsync(user);

        return NoContent();
    }

    /// <summary>Resolves a login identifier (email, username, or ITS) to an ApplicationUser.</summary>
    private async Task<ApplicationUser?> ResolveUserAsync(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier)) return null;
        var trimmed = identifier.Trim();
        // Prefer email match (most common). Fall through to username, then to ITS number.
        var byEmail = await _users.FindByEmailAsync(trimmed);
        if (byEmail is not null) return byEmail;
        var byName = await _users.FindByNameAsync(trimmed);
        if (byName is not null) return byName;
        // ITS number is stored as a column, not Identity username, so we have to query it directly.
        // Normalize: ITS is digits only; allow both 8-digit raw and any whitespace.
        var its = new string(trimmed.Where(char.IsDigit).ToArray());
        if (its.Length == 8)
        {
            return _users.Users.FirstOrDefault(u => u.ItsNumber == its);
        }
        return null;
    }
}

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
