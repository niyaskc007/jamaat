namespace Jamaat.Contracts.Setup;

/// <summary>
/// Snapshot of the install state, served by an unauthenticated endpoint so the SPA can
/// decide whether to render the first-run wizard or the login page on app boot.
/// </summary>
/// <param name="RequiresSetup">true while the system has no admin user. The SPA gate
/// uses this single bit to redirect to /setup. Once any admin exists this flips
/// permanently to false.</param>
/// <param name="HasAnyAdmin">true if at least one user with the Administrator role
/// exists. Strictly stronger than HasAnyTenant because tenant rows can be seeded
/// without an admin (e.g. fresh DB right after migrations).</param>
/// <param name="HasAnyTenant">true if a tenant row exists. Always true on a healthy
/// system after first migration because the default tenant is seeded.</param>
/// <param name="DbReachable">true if the API can talk to the database. Used by the
/// wizard's welcome step to give a green-tick before asking for any input. Renders
/// red on the wizard with a "check your connection string" hint when false.</param>
/// <param name="Version">The API's assembly informational version, shown on the
/// wizard footer so the operator can confirm they're installing the build they
/// expected.</param>
public sealed record SetupStatusDto(
    bool RequiresSetup,
    bool HasAnyAdmin,
    bool HasAnyTenant,
    bool DbReachable,
    string Version);

/// <summary>Submitted by the wizard's "Finish" step. Creates the first admin user
/// and stamps the existing default tenant with the chosen Jamaat name + base currency.</summary>
public sealed record InitializeSetupDto(
    string TenantName,
    string TenantCode,
    string BaseCurrency,
    string AdminFullName,
    string AdminEmail,
    string AdminPassword,
    string PreferredLanguage = "en");

/// <summary>Returned on a successful initialize. The SPA reads `LoginEmail` and
/// auto-fills the login page so the operator's first action after the wizard is a
/// single password type-in.</summary>
public sealed record InitializeSetupResultDto(
    Guid TenantId,
    Guid AdminUserId,
    string LoginEmail);
