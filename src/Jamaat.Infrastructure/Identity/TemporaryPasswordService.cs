using System.Security.Cryptography;
using Jamaat.Application.Identity;
using Jamaat.Domain.Abstractions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Identity;

public interface ITemporaryPasswordService
{
    /// Generates a fresh temp password, sets it on the user, marks MustChangePassword=true,
    /// stamps the expiry, and returns the plaintext (the only place it is ever returned).
    Task<string> IssueAsync(ApplicationUser user, CancellationToken ct = default);
}

/// Generates cryptographically random temp passwords (no formula). The plaintext is held on
/// the user record solely so admins can view + share it with the member; the moment the user
/// changes it, the plaintext is wiped.
public sealed class TemporaryPasswordService(
    UserManager<ApplicationUser> users,
    IOptions<TemporaryPasswordOptions> options,
    IClock clock) : ITemporaryPasswordService
{
    // Avoid characters that look alike (0/O, 1/l/I) so members reading the temp pw aloud or
    // off paper don't get tripped up. Mix of upper/lower/digit + a punctuation char keeps the
    // Identity password policy happy without requiring non-alpha (the policy doesn't require it).
    private const string Alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZ" + "abcdefghijkmnpqrstuvwxyz" + "23456789" + "@#$%&*";

    public async Task<string> IssueAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var opt = options.Value;
        var plaintext = GenerateRandom(Math.Max(8, opt.Length));

        // Reset Identity's password hash to the new temp value. Generate a reset token via Identity
        // then consume it - this is the supported way to set a password without knowing the old one.
        var token = await users.GeneratePasswordResetTokenAsync(user);
        var reset = await users.ResetPasswordAsync(user, token, plaintext);
        if (!reset.Succeeded)
        {
            var errs = string.Join("; ", reset.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Failed to set temp password: {errs}");
        }

        user.TemporaryPasswordPlaintext = plaintext;
        user.TemporaryPasswordExpiresAtUtc = clock.UtcNow.AddDays(opt.ExpiryDays);
        user.MustChangePassword = true;
        var update = await users.UpdateAsync(user);
        if (!update.Succeeded)
        {
            var errs = string.Join("; ", update.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Failed to persist temp password metadata: {errs}");
        }

        return plaintext;
    }

    private static string GenerateRandom(int length)
    {
        Span<byte> buf = stackalloc byte[length * 2];
        RandomNumberGenerator.Fill(buf);
        var sb = new System.Text.StringBuilder(length);
        for (int i = 0; i < length; i++)
        {
            sb.Append(Alphabet[buf[i] % Alphabet.Length]);
        }
        // Guarantee at least one digit + one punctuation in case the random draw missed.
        if (!sb.ToString().Any(char.IsDigit)) sb[length / 2] = '7';
        if (!sb.ToString().Any(c => "@#$%&*".Contains(c))) sb[^1] = '#';
        return sb.ToString();
    }
}
