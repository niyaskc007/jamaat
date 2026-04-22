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
            UserId = Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
            UserName = user.FindFirstValue(ClaimTypes.Name) ?? user.FindFirstValue(ClaimTypes.Email);
            Permissions = user.FindAll("permission").Select(c => c.Value).ToArray();
        }
        else
        {
            Permissions = [];
        }
    }

    public Guid? UserId { get; }
    public string? UserName { get; }
    public bool IsAuthenticated { get; }
    public IReadOnlyCollection<string> Permissions { get; }

    public bool HasPermission(string permission) => Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
}
