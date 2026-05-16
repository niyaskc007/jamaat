using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Jamaat.Domain.Abstractions;

namespace Jamaat.Api.Auth;

public sealed class CurrentUser : ICurrentUser
{
    public CurrentUser(IHttpContextAccessor accessor)
    {
        var user = accessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated == true)
        {
            IsAuthenticated = true;
            UserId = ResolveUserId(user);
            UserName = user.FindFirstValue(ClaimTypes.Name)
                       ?? user.FindFirstValue(JwtRegisteredClaimNames.UniqueName)
                       ?? user.FindFirstValue(ClaimTypes.Email)
                       ?? user.FindFirstValue(JwtRegisteredClaimNames.Email);
            Permissions = user.FindAll("permission").Select(c => c.Value).ToArray();
        }
        else
        {
            Permissions = [];
        }
    }

    /// Resolve the user GUID by walking every plausible claim type. JwtBearer's inbound
    /// claim type mapping has flip-flopped across .NET versions (5.0 maps sub -> NameIdentifier
    /// by default; 7.0 keeps it as `sub`; 8.0+ depends on whether `MapInboundClaims` is true).
    /// Rather than pin a single source, try the standard set in priority order.
    private static Guid? ResolveUserId(ClaimsPrincipal user)
    {
        string?[] candidates = {
            user.FindFirstValue(ClaimTypes.NameIdentifier),
            user.FindFirstValue(JwtRegisteredClaimNames.Sub),
            user.FindFirstValue("sub"),
            user.FindFirstValue("nameid"),
        };
        foreach (var v in candidates)
        {
            if (Guid.TryParse(v, out var id)) return id;
        }
        return null;
    }

    public Guid? UserId { get; }
    public string? UserName { get; }
    public bool IsAuthenticated { get; }
    public IReadOnlyCollection<string> Permissions { get; }

    public bool HasPermission(string permission) => Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
}
