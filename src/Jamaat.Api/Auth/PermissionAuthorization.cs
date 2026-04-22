using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace Jamaat.Api.Auth;

/// Authorization requirement: user must carry a 'permission' claim with the given value.
public sealed class PermissionRequirement(string permission) : IAuthorizationRequirement
{
    public string Permission { get; } = permission;
}

public sealed class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (context.User.HasClaim(c => c.Type == "permission"
            && string.Equals(c.Value, requirement.Permission, StringComparison.OrdinalIgnoreCase)))
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask;
    }
}

/// Lazily builds a policy for every "permission:<name>" lookup — no need to register each permission
/// up-front; controllers/actions attach [Authorize(Policy = "member.view")] and a policy is created on demand.
/// Extends DefaultAuthorizationPolicyProvider directly to avoid a circular dependency on
/// IAuthorizationPolicyProvider.
public sealed class PermissionPolicyProvider(IOptions<AuthorizationOptions> options)
    : DefaultAuthorizationPolicyProvider(options)
{
    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        // Treat any policy name that contains a dot as a permission claim name (e.g. member.view, receipt.cancel).
        if (policyName.Contains('.', StringComparison.Ordinal))
        {
            return new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .AddRequirements(new PermissionRequirement(policyName))
                .Build();
        }
        return await base.GetPolicyAsync(policyName);
    }
}
