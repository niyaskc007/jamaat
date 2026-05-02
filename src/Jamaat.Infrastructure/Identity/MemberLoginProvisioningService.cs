using Jamaat.Application.Members;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Identity;

public sealed class MemberLoginProvisioningService(
    UserManager<ApplicationUser> users,
    RoleManager<ApplicationRole> roles,
    ITemporaryPasswordService tempPw,
    JamaatDbContext db,
    ITenantContext tenant,
    ILogger<MemberLoginProvisioningService> logger) : IMemberLoginProvisioningService
{
    private const string MemberRoleName = "Member";

    public async Task<MemberLoginProvisioningResult> ProvisionAsync(Member member, CancellationToken ct = default)
    {
        var its = member.ItsNumber.Value;
        var existing = await users.Users.FirstOrDefaultAsync(u => u.ItsNumber == its, ct);
        if (existing is not null)
        {
            return new MemberLoginProvisioningResult(existing.Id, existing.UserName ?? its, WasCreated: false, TemporaryPasswordPlaintext: null);
        }

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = its,
            Email = member.Email,
            EmailConfirmed = !string.IsNullOrWhiteSpace(member.Email),
            FullName = member.FullName,
            ItsNumber = its,
            TenantId = member.TenantId,
            IsActive = true,
            // Off by default - bulk-enable via the admin Users page is the intentional "go live" step.
            IsLoginAllowed = false,
            MustChangePassword = true,
            PreferredLanguage = "en",
            PhoneE164 = member.Phone,
        };

        // Create with a placeholder password; TemporaryPasswordService rotates it immediately.
        var seedResult = await users.CreateAsync(user, Guid.NewGuid().ToString("N") + "Aa1#");
        if (!seedResult.Succeeded)
        {
            var errs = string.Join("; ", seedResult.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Failed to create login for ITS {its}: {errs}");
        }

        // Ensure the Member role exists, then attach.
        await EnsureMemberRoleExistsAsync(member.TenantId);
        await users.AddToRoleAsync(user, MemberRoleName);

        // Mirror the role's permission claims onto the user so JWT issuance picks them up.
        var roleClaims = await GetRolePermissionClaimsAsync(MemberRoleName);
        foreach (var c in roleClaims)
        {
            await users.AddClaimAsync(user, c);
        }

        var plaintext = await tempPw.IssueAsync(user, ct);
        return new MemberLoginProvisioningResult(user.Id, user.UserName!, WasCreated: true, TemporaryPasswordPlaintext: plaintext);
    }

    public async Task<int> BackfillTenantAsync(CancellationToken ct = default)
    {
        await EnsureMemberRoleExistsAsync(tenant.TenantId);

        // Compute set of ITS numbers that already have a login.
        var hasLoginIts = await users.Users.Where(u => u.ItsNumber != null).Select(u => u.ItsNumber!).ToListAsync(ct);
        var hasLoginSet = new HashSet<string>(hasLoginIts, StringComparer.Ordinal);

        var members = await db.Members.AsNoTracking()
            .Where(m => !m.IsDeleted)
            .ToListAsync(ct);

        var created = 0;
        foreach (var m in members)
        {
            if (hasLoginSet.Contains(m.ItsNumber.Value)) continue;
            try
            {
                var r = await ProvisionAsync(m, ct);
                if (r.WasCreated) created++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Backfill: failed to provision login for member {MemberId} ITS {Its}",
                    m.Id, m.ItsNumber.Value);
            }
        }
        if (created > 0)
            logger.LogInformation("Backfilled {Count} member logins", created);
        return created;
    }

    private async Task EnsureMemberRoleExistsAsync(Guid tenantId)
    {
        if (await roles.RoleExistsAsync(MemberRoleName)) return;
        var role = new ApplicationRole
        {
            Id = Guid.NewGuid(),
            Name = MemberRoleName,
            NormalizedName = MemberRoleName.ToUpperInvariant(),
            Description = "Member self-service - access only to own data via the member portal.",
            TenantId = tenantId,
        };
        var r = await roles.CreateAsync(role);
        if (!r.Succeeded)
        {
            var errs = string.Join("; ", r.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Failed to create Member role: {errs}");
        }
    }

    private async Task<IReadOnlyList<System.Security.Claims.Claim>> GetRolePermissionClaimsAsync(string roleName)
    {
        var role = await roles.FindByNameAsync(roleName);
        if (role is null) return [];
        var claims = await roles.GetClaimsAsync(role);
        return claims.Where(c => c.Type == "permission").ToList();
    }
}
