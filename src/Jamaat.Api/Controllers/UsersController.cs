using System.Security.Claims;
using Jamaat.Application.Common;
using Jamaat.Contracts.Users;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Enums;
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
    ITenantContext tenant,
    ITemporaryPasswordService tempPw,
    ILoginAuditService loginAudit,
    INotificationSender notify,
    IConfiguration config,
    IExcelExporter excel) : ControllerBase
{
    private static string Origin(IConfiguration config) =>
        config["Portal:PublicUrl"]?.TrimEnd('/') ?? "http://localhost:5173";

    private static NotificationMessage BuildWelcome(ApplicationUser user, string origin) => new(
        Kind: NotificationKind.UserWelcome,
        Subject: "Your Jamaat self-service login is ready",
        Body: $"Salaam {user.FullName},\n\n" +
              $"Your self-service portal is now active.\n\n" +
              $"Sign in at: {origin}/login\n" +
              $"Username: ITS {user.ItsNumber} or email {user.Email ?? "(not set)"}\n" +
              $"Temporary password: {user.TemporaryPasswordPlaintext}\n\n" +
              $"You'll be asked to set a permanent password on your first login. " +
              $"This temporary password expires {(user.TemporaryPasswordExpiresAtUtc?.ToString("dd MMM yyyy") ?? "soon")}.\n\n" +
              $"If you did not request this, please contact your committee.",
        RecipientEmail: user.Email,
        RecipientUserId: user.Id,
        SourceId: user.Id,
        SourceReference: user.UserName,
        RecipientPhoneE164: user.PhoneE164);

    private static NotificationMessage BuildTempPasswordIssued(ApplicationUser user, string origin) => new(
        Kind: NotificationKind.TempPasswordIssued,
        Subject: "A new temporary password has been issued",
        Body: $"Salaam {user.FullName},\n\n" +
              $"An administrator has issued you a new temporary password. Your previous one no longer works.\n\n" +
              $"Sign in at: {origin}/login\n" +
              $"Temporary password: {user.TemporaryPasswordPlaintext}\n\n" +
              $"You'll be asked to set a permanent password on first login.",
        RecipientEmail: user.Email,
        RecipientUserId: user.Id,
        SourceId: user.Id,
        SourceReference: user.UserName,
        RecipientPhoneE164: user.PhoneE164);

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
            dtos.Add(MapUser(u, roles));
        }
        return Ok(new PagedResult<UserDto>(dtos, total, q.Page, q.PageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var u = await userMgr.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        var roles = await userMgr.GetRolesAsync(u);
        return Ok(MapUser(u, roles));
    }

    /// <summary>
    /// Lite user-lookup for tooltips/popovers. Returns only the non-sensitive fields needed
    /// to render an "approver" or "actor" hover card: username, display name, roles, last
    /// login. Authorized to any authenticated user (overrides the class-level admin-users
    /// policy) so QH viewers, accountants, etc. can see who approved a loan / posted a
    /// voucher without being granted full user-admin rights.
    /// </summary>
    [HttpGet("{id:guid}/lite")]
    [Authorize] // overrides the admin.users policy at class level
    public async Task<IActionResult> GetLite(Guid id, CancellationToken ct)
    {
        var u = await userMgr.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        var roles = await userMgr.GetRolesAsync(u);
        return Ok(new UserLiteDto(
            u.Id, u.UserName ?? "", u.FullName, roles.ToList(),
            u.IsActive, u.LastLoginAtUtc));
    }

    private static UserDto MapUser(ApplicationUser u, IList<string> roles) => new(
        u.Id, u.UserName ?? "", u.FullName, u.Email, u.ItsNumber, roles.ToList(),
        u.IsActive, u.PreferredLanguage, u.LastLoginAtUtc,
        u.IsLoginAllowed, u.MustChangePassword, u.TemporaryPasswordExpiresAtUtc,
        u.LastPasswordChangedAtUtc, u.PhoneE164);

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

    /// Phase B1 - Bulk allow / disallow login for many users at once. Used by the admin Users
    /// page after a bulk member import to flip the "go live" switch for a batch of accounts.
    /// On Allow=true, fires a UserWelcome notification (channel-routed: WhatsApp -> SMS ->
    /// email -> log-only) so the user receives their temporary password without admin needing
    /// to relay it manually.
    [HttpPost("bulk-allow-login")]
    public async Task<IActionResult> BulkAllowLogin([FromBody] BulkAllowLoginDto dto, CancellationToken ct)
    {
        if (dto.UserIds is null || dto.UserIds.Count == 0) return BadRequest(new { error = "no_users" });
        var ids = dto.UserIds.ToHashSet();
        var users = await userMgr.Users.Where(u => ids.Contains(u.Id)).ToListAsync(ct);
        var origin = Origin(config);
        var changed = 0;
        var notified = 0;
        foreach (var u in users)
        {
            if (u.IsLoginAllowed == dto.Allow) continue;
            u.IsLoginAllowed = dto.Allow;
            await userMgr.UpdateAsync(u);
            changed++;

            // Fire welcome only when *enabling* and the user still has a usable temp pw.
            if (dto.Allow && u.MustChangePassword && !string.IsNullOrEmpty(u.TemporaryPasswordPlaintext))
            {
                try { await notify.SendAsync(BuildWelcome(u, origin), ct); notified++; }
                catch { /* fire-and-forget - audit row already written by NotificationSender */ }
            }
        }
        return Ok(new { changed, requested = dto.UserIds.Count, notified });
    }

    /// Phase B2 - Generate (or regenerate) a temp password for the user. Returns the plaintext
    /// to the admin so they can copy + share with the user out-of-band. The user is forced to
    /// change it on first login. Subsequent calls re-issue and reset the expiry window.
    [HttpPost("{id:guid}/issue-temp-password")]
    public async Task<IActionResult> IssueTempPassword(Guid id, CancellationToken ct)
    {
        var u = await userMgr.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        var plaintext = await tempPw.IssueAsync(u, ct);
        // Re-fetch so we return the updated expiry stamp set inside the service.
        var fresh = await userMgr.FindByIdAsync(id.ToString());
        if (fresh is not null && fresh.IsLoginAllowed)
        {
            try { await notify.SendAsync(BuildTempPasswordIssued(fresh, Origin(config)), ct); }
            catch { /* fire-and-forget */ }
        }
        return Ok(new TempPasswordDto(plaintext, fresh?.TemporaryPasswordExpiresAtUtc, MustChangePassword: true));
    }

    /// Phase B2 - View the currently-active temp password for a user (only returns one if
    /// MustChangePassword=true; otherwise the user has rotated it and the plaintext is gone).
    [HttpGet("{id:guid}/temp-password")]
    public async Task<IActionResult> GetTempPassword(Guid id, CancellationToken ct)
    {
        var u = await userMgr.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        if (!u.MustChangePassword || string.IsNullOrEmpty(u.TemporaryPasswordPlaintext))
            return NotFound(new { error = "no_active_temp_password", message = "User has no active temporary password. Issue a new one if needed." });
        return Ok(new TempPasswordDto(u.TemporaryPasswordPlaintext!, u.TemporaryPasswordExpiresAtUtc, true));
    }

    /// Phase B4 - Tenant-wide login history (admin view). Most-recent first; capped at 1000.
    [HttpGet("login-history")]
    public async Task<IActionResult> LoginHistory([FromQuery] int max = 200, CancellationToken ct = default)
    {
        var rows = await loginAudit.ListForTenantAsync(max, ct);
        return Ok(rows.Select(r => new LoginAttemptDto(
            r.Id, r.TenantId, r.UserId, r.Identifier, r.AttemptedAtUtc,
            r.Success, r.FailureReason, r.IpAddress, r.UserAgent, r.GeoCountry, r.GeoCity)).ToList());
    }

    /// Phase B4 - Per-user login history (admin view).
    [HttpGet("{id:guid}/login-history")]
    public async Task<IActionResult> LoginHistoryForUser(Guid id, [FromQuery] int max = 50, CancellationToken ct = default)
    {
        var rows = await loginAudit.ListForUserAsync(id, max, ct);
        return Ok(rows.Select(r => new LoginAttemptDto(
            r.Id, r.TenantId, r.UserId, r.Identifier, r.AttemptedAtUtc,
            r.Success, r.FailureReason, r.IpAddress, r.UserAgent, r.GeoCountry, r.GeoCity)).ToList());
    }

    /// Tenant-wide login history export. Same row shape as the JSON endpoint but always
    /// pulls the maximum window (1000 rows) so security audits can be downloaded in one go.
    [HttpGet("login-history.xlsx")]
    public async Task<IActionResult> LoginHistoryXlsx(CancellationToken ct = default)
    {
        var rows = await loginAudit.ListForTenantAsync(1000, ct);
        var sheet = new ExcelSheet(
            "Login history",
            new[]
            {
                new ExcelColumn("Attempted at", ExcelColumnType.DateTime),
                new ExcelColumn("Identifier"),
                new ExcelColumn("Success", ExcelColumnType.Text),
                new ExcelColumn("Failure reason"),
                new ExcelColumn("IP"),
                new ExcelColumn("Country"),
                new ExcelColumn("City"),
                new ExcelColumn("User-agent"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.AttemptedAtUtc.UtcDateTime,
                r.Identifier,
                r.Success ? "Yes" : "No",
                r.FailureReason ?? "",
                r.IpAddress ?? "",
                r.GeoCountry ?? "",
                r.GeoCity ?? "",
                r.UserAgent ?? "",
            }).ToList());
        var bytes = excel.Build(new[] { sheet });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"login-history_{DateTime.UtcNow:yyyyMMdd-HHmm}.xlsx");
    }

    /// CSV companion of the login-history XLSX export. Same row shape, single sheet.
    [HttpGet("login-history.csv")]
    public async Task<IActionResult> LoginHistoryCsv(CancellationToken ct = default)
    {
        var rows = await loginAudit.ListForTenantAsync(1000, ct);
        var sheet = new ExcelSheet(
            "Login history",
            new[]
            {
                new ExcelColumn("Attempted at", ExcelColumnType.DateTime),
                new ExcelColumn("Identifier"),
                new ExcelColumn("Success"),
                new ExcelColumn("Failure reason"),
                new ExcelColumn("IP"),
                new ExcelColumn("Country"),
                new ExcelColumn("City"),
                new ExcelColumn("User-agent"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.AttemptedAtUtc.UtcDateTime,
                r.Identifier,
                r.Success ? "Yes" : "No",
                r.FailureReason ?? "",
                r.IpAddress ?? "",
                r.GeoCountry ?? "",
                r.GeoCity ?? "",
                r.UserAgent ?? "",
            }).ToList());
        return File(excel.BuildCsv(sheet), "text/csv",
            $"login-history_{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }
}
