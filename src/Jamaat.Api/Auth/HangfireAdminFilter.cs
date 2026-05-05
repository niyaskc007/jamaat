using Hangfire.Dashboard;

namespace Jamaat.Api.Auth;

/// Authorization filter for /hangfire. Only signed-in users with the system.admin policy
/// can see the dashboard. Without this, anyone reaching the URL would see a list of jobs +
/// the ability to trigger them - a privilege-escalation vector.
public sealed class HangfireAdminFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var http = context.GetHttpContext();
        if (http?.User?.Identity?.IsAuthenticated != true) return false;
        // The system.admin permission claim is granted to SuperAdmin only (see DatabaseSeeder
        // SystemPermissions block). We check by direct claim match so the dashboard works
        // even before the IAuthorizationPolicyProvider has populated the dynamic policy
        // (which it does on first hit; the dashboard is hit early at /hangfire).
        return http.User.HasClaim(c =>
            c.Type == "permission" &&
            (c.Value.Equals("system.admin", StringComparison.OrdinalIgnoreCase) ||
             c.Value.Equals("system.view", StringComparison.OrdinalIgnoreCase)));
    }
}
