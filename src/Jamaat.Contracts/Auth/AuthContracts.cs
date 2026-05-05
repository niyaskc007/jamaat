namespace Jamaat.Contracts.Auth;

public sealed record LoginRequest(string Email, string Password);

public sealed record RefreshRequest(string RefreshToken);

public sealed record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTimeOffset AccessTokenExpiresAtUtc,
    UserInfo User);

public sealed record UserInfo(
    Guid Id,
    string UserName,
    string FullName,
    string? Email,
    Guid TenantId,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions,
    string? PreferredLanguage,
    /// Coarse audience type used by the SPA to pick a default landing route.
    /// "Operator" / "Member" / "Hybrid". May be null on tokens issued before the
    /// 2026-05 migration; SPA falls back to permission-shape inference in that case.
    string? UserType = null);

/// Returned by /auth/login when the user supplied a valid temp password but MustChangePassword
/// is set. No JWT is issued. The client navigates to the change-password screen and POSTs to
/// /auth/complete-first-login with the new password; on success a normal AuthResponse is returned.
public sealed record PasswordChangeRequiredResponse(
    Guid UserId,
    string UserName,
    bool MustChangePassword,
    DateTimeOffset? TemporaryPasswordExpiresAtUtc,
    string Reason);

public sealed record CompleteFirstLoginRequest(string Identifier, string CurrentPassword, string NewPassword);
