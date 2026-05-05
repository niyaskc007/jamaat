using Jamaat.Domain.Common;
using Microsoft.AspNetCore.Identity;

namespace Jamaat.Infrastructure.Identity;

public class ApplicationUser : IdentityUser<Guid>, ITenantScoped
{
    public Guid TenantId { get; set; }
    public string FullName { get; set; } = default!;
    public string? ItsNumber { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public string? PreferredLanguage { get; set; } = "en";

    /// Admin-controlled flag distinct from IsActive: a member can be active in the directory yet
    /// not allowed to log in (e.g. provisioned but not yet enabled). Login is rejected when this
    /// is false even if IsActive is true and the password matches.
    public bool IsLoginAllowed { get; set; }

    /// True until the user completes a password change. Set on user creation (default temp pw),
    /// re-enabled when admin issues a temporary password. Login returns a PasswordChangeRequired
    /// response (no JWT) until cleared. Server-enforced: cannot be bypassed by direct DB edit
    /// because clients only get a JWT after the change-password endpoint clears the flag.
    public bool MustChangePassword { get; set; }

    /// Plaintext temp password kept ONLY for admin "view temp pw / share with member" workflow.
    /// Cleared the moment the user changes it. Never logged. Visible only via the
    /// /api/v1/users/{id}/temp-password endpoint behind admin.users.
    public string? TemporaryPasswordPlaintext { get; set; }

    /// When the temp password expires. After this point login fails even with the correct temp
    /// password and admin must re-issue.
    public DateTimeOffset? TemporaryPasswordExpiresAtUtc { get; set; }

    /// Most recent successful password change (first login or rotation). Null until first change.
    public DateTimeOffset? LastPasswordChangedAtUtc { get; set; }

    /// Notification channel preference for this user. Null = email default.
    public string? NotificationChannel { get; set; }

    /// Phone in E.164 format (e.g. +9715xxxxxxx) - used for SMS + WhatsApp delivery.
    public string? PhoneE164 { get; set; }

    /// Coarse audience classification used for default landing route. Distinct from
    /// permissions: a Hybrid is a real persona (e.g. an Admin who is also a Jamaat member),
    /// not a permission union. Driving routing off this avoids fragile "every perm starts
    /// with portal." inferences. Backfilled by the seeder from existing role membership;
    /// settable by admins on the Users page.
    public UserType UserType { get; set; } = UserType.Operator;
}

public enum UserType
{
    Operator = 0,  // Staff/admin - lands on /dashboard
    Member   = 1,  // Provisioned member - lands on /portal/me
    Hybrid   = 2,  // Both - lands on /dashboard with switcher
}

public class ApplicationRole : IdentityRole<Guid>
{
    public string? Description { get; set; }
    public Guid? TenantId { get; set; }
}
