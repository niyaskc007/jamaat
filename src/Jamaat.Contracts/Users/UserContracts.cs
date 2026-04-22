namespace Jamaat.Contracts.Users;

public sealed record UserDto(
    Guid Id, string UserName, string FullName, string? Email, string? ItsNumber,
    IReadOnlyList<string> Roles, bool IsActive, string? PreferredLanguage,
    DateTimeOffset? LastLoginAtUtc);

public sealed record CreateUserDto(
    string Email, string FullName, string? ItsNumber, string Password,
    IReadOnlyList<string> Roles, string? PreferredLanguage = "en");

public sealed record UpdateUserDto(
    string FullName, string? ItsNumber, bool IsActive,
    IReadOnlyList<string> Roles, string? PreferredLanguage);

public sealed record ResetPasswordDto(string NewPassword);

public sealed record UserListQuery(
    int Page = 1, int PageSize = 25, string? Search = null, bool? Active = null);

public sealed record RoleDto(Guid Id, string Name, string? Description, IReadOnlyList<string> Permissions);
