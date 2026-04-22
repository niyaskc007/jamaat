using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Jamaat.Contracts.Auth;
using Jamaat.Domain.Abstractions;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Jamaat.Infrastructure.Identity;

public interface ITokenService
{
    Task<AuthResponse> IssueTokensAsync(ApplicationUser user, string? ipAddress, CancellationToken ct = default);
    Task<AuthResponse> RefreshAsync(string refreshToken, string? ipAddress, CancellationToken ct = default);
    Task<bool> RevokeAsync(string refreshToken, CancellationToken ct = default);
}

public sealed class JwtTokenService : ITokenService
{
    private readonly JwtOptions _jwt;
    private readonly IClock _clock;
    private readonly JamaatDbContext _db;
    private readonly UserManager<ApplicationUser> _users;

    public JwtTokenService(IOptions<JwtOptions> jwt, IClock clock, JamaatDbContext db, UserManager<ApplicationUser> users)
    {
        _jwt = jwt.Value;
        _clock = clock;
        _db = db;
        _users = users;
    }

    public async Task<AuthResponse> IssueTokensAsync(ApplicationUser user, string? ipAddress, CancellationToken ct = default)
    {
        var now = _clock.UtcNow;
        var accessExpiresAt = now.AddMinutes(_jwt.AccessTokenMinutes);
        var refreshExpiresAt = now.AddDays(_jwt.RefreshTokenDays);

        var rolesList = await _users.GetRolesAsync(user);
        var roles = rolesList.ToArray();
        var claims = await _users.GetClaimsAsync(user);
        var permissions = claims.Where(c => c.Type == "permission").Select(c => c.Value).ToArray();

        var accessToken = BuildJwt(user, roles, permissions, accessExpiresAt);

        var (refreshTokenRaw, refreshHash) = GenerateRefreshToken();
        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = refreshHash,
            ExpiresAtUtc = refreshExpiresAt,
            CreatedAtUtc = now,
            CreatedByIp = ipAddress,
        });
        user.LastLoginAtUtc = now;
        await _db.SaveChangesAsync(ct);

        var userInfo = new UserInfo(
            user.Id,
            user.UserName ?? string.Empty,
            user.FullName,
            user.Email,
            user.TenantId,
            roles,
            permissions,
            user.PreferredLanguage);

        return new AuthResponse(accessToken, refreshTokenRaw, accessExpiresAt, userInfo);
    }

    public async Task<AuthResponse> RefreshAsync(string refreshToken, string? ipAddress, CancellationToken ct = default)
    {
        var hash = HashToken(refreshToken);
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash, ct)
            ?? throw new UnauthorizedAccessException("Invalid refresh token.");
        if (!stored.IsActive) throw new UnauthorizedAccessException("Refresh token is not active.");

        var user = await _users.FindByIdAsync(stored.UserId.ToString())
            ?? throw new UnauthorizedAccessException("User not found.");

        stored.RevokedAtUtc = _clock.UtcNow;

        var rotated = await IssueTokensAsync(user, ipAddress, ct);
        stored.ReplacedByTokenHash = HashToken(rotated.RefreshToken);
        await _db.SaveChangesAsync(ct);
        return rotated;
    }

    public async Task<bool> RevokeAsync(string refreshToken, CancellationToken ct = default)
    {
        var hash = HashToken(refreshToken);
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash, ct);
        if (stored is null || !stored.IsActive) return false;
        stored.RevokedAtUtc = _clock.UtcNow;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    private string BuildJwt(ApplicationUser user, IReadOnlyCollection<string> roles, IReadOnlyCollection<string> permissions, DateTimeOffset expiresAt)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.UserName ?? string.Empty),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new("tenant_id", user.TenantId.ToString()),
            new("full_name", user.FullName),
        };
        if (!string.IsNullOrEmpty(user.Email)) claims.Add(new Claim(ClaimTypes.Email, user.Email));
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));
        claims.AddRange(permissions.Select(p => new Claim("permission", p)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            notBefore: _clock.UtcNow.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static (string Raw, string Hash) GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        var raw = Convert.ToBase64String(bytes);
        return (raw, HashToken(raw));
    }

    private static string HashToken(string raw)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash);
    }
}
