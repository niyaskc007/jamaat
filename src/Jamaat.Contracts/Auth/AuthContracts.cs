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
    string? PreferredLanguage);
