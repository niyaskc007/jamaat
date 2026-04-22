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
}

public class ApplicationRole : IdentityRole<Guid>
{
    public string? Description { get; set; }
    public Guid? TenantId { get; set; }
}
