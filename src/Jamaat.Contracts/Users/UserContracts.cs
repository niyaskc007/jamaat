namespace Jamaat.Contracts.Users;

public sealed record UserDto(
    Guid Id, string UserName, string FullName, string? Email, string? ItsNumber,
    IReadOnlyList<string> Roles, bool IsActive, string? PreferredLanguage,
    DateTimeOffset? LastLoginAtUtc,
    bool IsLoginAllowed = false,
    bool MustChangePassword = false,
    DateTimeOffset? TemporaryPasswordExpiresAtUtc = null,
    DateTimeOffset? LastPasswordChangedAtUtc = null,
    string? PhoneE164 = null,
    /// 'Operator' / 'Member' / 'Hybrid'. Drives default landing route after login;
    /// also exposed in the admin Users grid so an admin can see at a glance which
    /// users are member-portal users vs staff.
    string? UserType = null);

public sealed record BulkAllowLoginDto(IReadOnlyList<Guid> UserIds, bool Allow);

/// PUT /api/v1/users/{id}/user-type body. Lets admin manually flip a user from
/// Operator to Hybrid (e.g. when an existing Jamaat member is hired as staff)
/// or back. Server validates: must be one of Operator / Member / Hybrid.
public sealed record SetUserTypeDto(string UserType);

/// <summary>Minimal user info for tooltips / "who did this?" popovers throughout the app.
/// Excludes sensitive fields (email, phone, ITS) so non-admin readers can resolve a user-id
/// to a friendly name without inheriting admin.users access.</summary>
public sealed record UserLiteDto(
    Guid Id, string UserName, string FullName,
    IReadOnlyList<string> Roles, bool IsActive,
    DateTimeOffset? LastLoginAtUtc);

public sealed record TempPasswordDto(
    string Plaintext,
    DateTimeOffset? ExpiresAtUtc,
    bool MustChangePassword);

public sealed record LoginAttemptDto(
    long Id, Guid TenantId, Guid? UserId, string Identifier, DateTimeOffset AttemptedAtUtc,
    bool Success, string? FailureReason, string? IpAddress, string? UserAgent,
    string? GeoCountry, string? GeoCity);

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
