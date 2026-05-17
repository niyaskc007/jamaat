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
            // CRITICAL: this provisioning path is exclusively for member self-service logins.
            // The default enum value is Operator (=0); without explicitly setting Member here,
            // the JWT carries user_type=Operator and the SPA routes the user to /dashboard
            // instead of /portal/me. The seeder's ReconcileUserTypesAsync would correct this
            // on next API restart, but we shouldn't rely on that grace period for new joiners.
            UserType = UserType.Member,
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

        // Compute set of ITS numbers AND emails that already have a login. The email set
        // is critical: a Member row with email X may have NO ApplicationUser of its own
        // but a *different* member already has a user with the same email X. Calling
        // UserManager.CreateAsync on that second member throws "Email already taken",
        // which we catch as a warning - but each throw materialises a 25-line stack
        // trace through Serilog. On staging with 269 Members and dozens of duplicate
        // emails, the backfill loop took 10+ minutes (purely from exception logging)
        // and exceeded IIS's startup timeout. Pre-checking both indexes turns a slow
        // exception path into a fast hash-set hit.
        var existingUsers = await users.Users.Select(u => new { u.ItsNumber, u.Email }).ToListAsync(ct);
        var hasLoginSet = new HashSet<string>(existingUsers.Where(u => u.ItsNumber is not null).Select(u => u.ItsNumber!), StringComparer.Ordinal);
        var takenEmails = new HashSet<string>(existingUsers.Where(u => !string.IsNullOrEmpty(u.Email)).Select(u => u.Email!), StringComparer.OrdinalIgnoreCase);

        var members = await db.Members.AsNoTracking()
            .Where(m => !m.IsDeleted)
            .ToListAsync(ct);

        var created = 0;
        var skipped = new List<(Guid Id, string Its, string? Email)>();
        foreach (var m in members)
        {
            if (hasLoginSet.Contains(m.ItsNumber.Value)) continue;
            if (!string.IsNullOrEmpty(m.Email) && takenEmails.Contains(m.Email))
            {
                skipped.Add((m.Id, m.ItsNumber.Value, m.Email));
                continue;
            }
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
        if (skipped.Count > 0)
        {
            logger.LogInformation("Backfill: skipped {Count} member(s) whose email is already used by a different ApplicationUser; manual reconciliation needed.", skipped.Count);
            await RaiseEmailCollisionAlertAsync(skipped, ct);
        }
        return created;
    }

    /// One SystemAlert per startup if any Members were skipped during backfill because their
    /// email already belongs to another ApplicationUser. Fingerprinted so re-firings update
    /// the existing row (Repeat) rather than spamming a new one each deploy - SuperAdmin sees
    /// it once on /admin/reliability and can reconcile from the listed members.
    private async Task RaiseEmailCollisionAlertAsync(IReadOnlyList<(Guid Id, string Its, string? Email)> skipped, CancellationToken ct)
    {
        // Detail caps at 4000 chars on the SystemAlert entity; show up to 25 entries inline
        // and let "+N more" hint at the rest. 25 is a comfortable fit (~100 chars per row).
        const int maxInline = 25;
        var inline = string.Join("\n", skipped.Take(maxInline).Select(s => $"  - {s.Its}  {s.Email}  ({s.Id:N})"));
        var more = skipped.Count > maxInline ? $"\n  ... +{skipped.Count - maxInline} more" : string.Empty;
        var detail = $"During the post-startup login backfill, {skipped.Count} member(s) were skipped because another ApplicationUser already has their email. " +
                     $"These members will not be able to sign in until either the colliding user is reassigned or the member's Email is updated to a unique value.\n\n" +
                     $"Affected (ITS  Email  MemberId):\n{inline}{more}";

        const string fingerprint = "backfill.email.collision";
        var now = DateTimeOffset.UtcNow;
        var existing = await db.SystemAlerts.Where(a => a.Fingerprint == fingerprint)
            .OrderByDescending(a => a.LastSeenAtUtc).FirstOrDefaultAsync(ct);

        var title = $"Member-login backfill skipped {skipped.Count} member(s) due to duplicate emails";
        if (existing is not null)
        {
            existing.Repeat(title, detail, recipientCount: 0, at: now);
            db.SystemAlerts.Update(existing);
        }
        else
        {
            db.SystemAlerts.Add(SystemAlert.Open(fingerprint, kind: "data-quality", severity: "Warning",
                title, detail, recipientCount: 0, at: now));
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task EnableLoginAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null) return;
        if (user.IsLoginAllowed) return;
        user.IsLoginAllowed = true;
        await users.UpdateAsync(user);
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
