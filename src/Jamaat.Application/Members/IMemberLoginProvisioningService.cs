using Jamaat.Domain.Entities;

namespace Jamaat.Application.Members;

/// Provisions self-service login credentials for a Member. Implementation lives in the
/// Infrastructure layer (it needs UserManager + Identity), but services in the Application
/// layer can depend on this interface without taking a reference on Identity.
///
/// Behavior:
///   - If an ApplicationUser already exists for the Member's ITS number, return that user
///     (idempotent - bulk import / backfill / repeated calls all converge).
///   - Otherwise create an ApplicationUser with:
///       * UserName  = ITS number
///       * Email     = member.PrimaryEmail (if present, else null)
///       * FullName  = member.FullName
///       * ItsNumber = member.ItsNumber
///       * Role      = "Member"
///       * IsActive  = true
///       * IsLoginAllowed = false  (admin opts the user in via the bulk-enable flow; this
///         prevents an accidental import from immediately exposing thousands of accounts)
///   - Issue a fresh temp password via ITemporaryPasswordService (cryptographically random,
///     no formula); MustChangePassword=true.
///
/// Returns the ApplicationUser id so callers can stash it on the Member if they want a hard FK.
public interface IMemberLoginProvisioningService
{
    Task<MemberLoginProvisioningResult> ProvisionAsync(Member member, CancellationToken ct = default);

    /// One-shot backfill that walks every Member in the current tenant and provisions a login
    /// for any that don't yet have one. Called from the database seeder on startup. Returns the
    /// number of new logins created.
    Task<int> BackfillTenantAsync(CancellationToken ct = default);

    /// Flip IsLoginAllowed=true on the ApplicationUser. Called from the application-approval
    /// flow so that approving a member application is a single decision point - the admin
    /// doesn't need a second click on the Users page to actually let the member sign in.
    Task EnableLoginAsync(Guid userId, CancellationToken ct = default);
}

public sealed record MemberLoginProvisioningResult(Guid UserId, string UserName, bool WasCreated, string? TemporaryPasswordPlaintext);
