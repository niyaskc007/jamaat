using System.Security.Claims;
using Jamaat.Contracts.Setup;
using Jamaat.Domain.Entities;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Persistence;
using Jamaat.Infrastructure.Persistence.Seed;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Api.Controllers;

/// <summary>
/// First-run setup wizard endpoints. The whole controller is anonymous because by definition
/// no admin user exists when these are called. Once <see cref="Initialize"/> succeeds it
/// becomes a no-op (returns 409) so a malicious second call can't reset the system.
/// </summary>
/// <remarks>
/// Why direct DB access (not via a service): the rest of the app uses TenantContext-scoped
/// queries with a global filter on TenantId, but at setup time the request is anonymous so
/// the tenant context isn't populated. We use IgnoreQueryFilters() and the configured
/// MultiTenancy:DefaultTenantId to read/update the seeded tenant row directly.
/// </remarks>
[ApiController]
[AllowAnonymous]
[Route("api/v1/setup")]
public sealed class SetupController(
    JamaatDbContext db,
    UserManager<ApplicationUser> userMgr,
    RoleManager<ApplicationRole> roleMgr,
    IConfiguration config,
    ILogger<SetupController> logger) : ControllerBase
{
    /// <summary>Probe the install state. Cheap to call (one count query). The SPA hits this
    /// on app boot to decide whether to redirect to /setup.</summary>
    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        var dbReachable = false;
        var hasAnyTenant = false;
        var adminCount = 0;
        try
        {
            dbReachable = await db.Database.CanConnectAsync(ct);
            if (dbReachable)
            {
                hasAnyTenant = await db.Tenants.IgnoreQueryFilters().AnyAsync(ct);
                // "Admin" = any user in the Administrator role. Cheaper than counting permission
                // claims and matches the role the seeder + this initializer both grant.
                var adminRole = await roleMgr.FindByNameAsync("Administrator");
                if (adminRole is not null)
                {
                    adminCount = await db.UserRoles.CountAsync(ur => ur.RoleId == adminRole.Id, ct);
                }
            }
        }
        catch (Exception ex)
        {
            // CanConnectAsync can throw on certain provider failures rather than returning
            // false. Treat any throw as "not reachable" - the wizard will offer guidance.
            logger.LogWarning(ex, "Setup status: DB probe threw");
            dbReachable = false;
        }
        var version = typeof(SetupController).Assembly
            .GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
            .OfType<System.Reflection.AssemblyInformationalVersionAttribute>()
            .FirstOrDefault()?.InformationalVersion ?? "dev";
        return Ok(new SetupStatusDto(
            RequiresSetup: dbReachable && adminCount == 0,
            HasAnyAdmin: adminCount > 0,
            HasAnyTenant: hasAnyTenant,
            DbReachable: dbReachable,
            Version: version));
    }

    /// <summary>Create the first admin user and stamp the seeded default tenant with the
    /// operator-provided name + base currency. Idempotent guard: 409 if any admin already
    /// exists, so re-running the wizard against an installed system is a no-op.</summary>
    [HttpPost("initialize")]
    public async Task<IActionResult> Initialize([FromBody] InitializeSetupDto dto, CancellationToken ct)
    {
        // -- guards ----------------------------------------------------------
        if (string.IsNullOrWhiteSpace(dto.TenantName)) return BadRequest(new { error = "tenant_name_required" });
        if (string.IsNullOrWhiteSpace(dto.AdminFullName)) return BadRequest(new { error = "admin_name_required" });
        if (string.IsNullOrWhiteSpace(dto.AdminEmail)) return BadRequest(new { error = "admin_email_required" });
        if (string.IsNullOrWhiteSpace(dto.AdminPassword) || dto.AdminPassword.Length < 8)
            return BadRequest(new { error = "admin_password_too_short", message = "Password must be at least 8 characters." });

        var defaultTenantId = Guid.Parse(config["MultiTenancy:DefaultTenantId"] ?? Guid.Empty.ToString());
        if (defaultTenantId == Guid.Empty)
            return Problem(detail: "MultiTenancy:DefaultTenantId is not configured.", statusCode: 500);

        // -- idempotency check -----------------------------------------------
        // We re-check here (not just trust the SPA's earlier status query) because the
        // initialize endpoint is the security boundary. Two browsers could race the wizard;
        // only the first one wins.
        var adminRole = await roleMgr.FindByNameAsync("Administrator");
        if (adminRole is null)
            return Problem(detail: "Administrator role missing - seeder hasn't run yet. Restart the API.", statusCode: 500);
        var existingAdmins = await db.UserRoles.CountAsync(ur => ur.RoleId == adminRole.Id, ct);
        if (existingAdmins > 0)
            return Conflict(new { error = "already_initialized", message = "Setup has already been completed." });

        // -- find the seeded default tenant + apply operator's choices -------
        var tenant = await db.Tenants.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == defaultTenantId, ct);
        if (tenant is null)
            return Problem(detail: "Default tenant row missing - run migrations.", statusCode: 500);
        tenant.UpdateDetails(dto.TenantName.Trim(), tenant.Address, tenant.Phone, tenant.Email);
        // Force base currency. The Tenant aggregate hides this behind a private setter, so we
        // mirror DatabaseSeeder's reflection trick here rather than carve out a new mutator
        // (and risk drift between two paths to the same property).
        if (!string.IsNullOrWhiteSpace(dto.BaseCurrency) && tenant.BaseCurrency != dto.BaseCurrency)
        {
            typeof(Tenant).GetProperty(nameof(Tenant.BaseCurrency))!.SetValue(tenant, dto.BaseCurrency.Trim().ToUpperInvariant());
        }
        // The Tenant.Code is set at seed time to "DEFAULT". If the operator wants a different
        // code we apply it directly via reflection (no public mutator on the aggregate).
        var requestedCode = (dto.TenantCode ?? "").Trim().ToUpperInvariant();
        if (!string.IsNullOrEmpty(requestedCode) && tenant.Code != requestedCode)
        {
            typeof(Tenant).GetProperty(nameof(Tenant.Code))!.SetValue(tenant, requestedCode);
        }
        db.Tenants.Update(tenant);
        await db.SaveChangesAsync(ct);

        // -- create the admin user ------------------------------------------
        var email = dto.AdminEmail.Trim().ToLowerInvariant();
        var existingUser = await userMgr.FindByEmailAsync(email);
        if (existingUser is not null)
        {
            // A user with that email already exists but isn't yet an admin (because the early
            // guard above passed). Promote them to admin instead of failing - this is the
            // friendly path when the operator created a user via the seeder but no admin role.
            await userMgr.AddToRoleAsync(existingUser, "Administrator");
            // The installer-driven admin is also the SuperAdmin for the box.
            if (await roleMgr.RoleExistsAsync("SuperAdmin"))
                await userMgr.AddToRoleAsync(existingUser, "SuperAdmin");
            await GrantAllPermissionsAsync(existingUser);
            logger.LogInformation("Setup: promoted existing user {Email} to admin + SuperAdmin.", email);
            return Ok(new InitializeSetupResultDto(tenant.Id, existingUser.Id, email));
        }

        var admin = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            FullName = dto.AdminFullName.Trim(),
            TenantId = tenant.Id,
            EmailConfirmed = true,
            IsActive = true,
            IsLoginAllowed = true,
            // Operator just typed this password, no need to force a change.
            MustChangePassword = false,
            PreferredLanguage = string.IsNullOrWhiteSpace(dto.PreferredLanguage) ? "en" : dto.PreferredLanguage,
        };
        var createResult = await userMgr.CreateAsync(admin, dto.AdminPassword);
        if (!createResult.Succeeded)
        {
            return BadRequest(new
            {
                error = "create_failed",
                message = string.Join("; ", createResult.Errors.Select(e => e.Description)),
            });
        }
        await userMgr.AddToRoleAsync(admin, "Administrator");
        if (await roleMgr.RoleExistsAsync("SuperAdmin"))
            await userMgr.AddToRoleAsync(admin, "SuperAdmin");
        await GrantAllPermissionsAsync(admin);
        logger.LogInformation("Setup completed: admin {Email} created for tenant {TenantId}.", email, tenant.Id);
        return Ok(new InitializeSetupResultDto(tenant.Id, admin.Id, email));
    }

    /// <summary>Grant the full permission catalog (tenant + system) to the user as security
    /// claims, mirroring the DatabaseSeeder pattern so JWTs reflect the permissions directly
    /// without a role lookup. The first installer-driven admin is also the SuperAdmin so we
    /// include SystemPermissions explicitly here.</summary>
    private async Task GrantAllPermissionsAsync(ApplicationUser user)
    {
        var existing = (await userMgr.GetClaimsAsync(user))
            .Where(c => c.Type == "permission")
            .Select(c => c.Value)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var perm in DatabaseSeeder.AllPermissions.Concat(DatabaseSeeder.SystemPermissions))
        {
            if (existing.Contains(perm)) continue;
            await userMgr.AddClaimAsync(user, new Claim("permission", perm));
        }
    }
}
