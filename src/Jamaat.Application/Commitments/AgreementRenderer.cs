using System.Text.RegularExpressions;

namespace Jamaat.Application.Commitments;

/// <summary>
/// Replaces <c>{{placeholder}}</c> tokens in a markdown agreement body with values supplied
/// at render time. Unknown tokens are left in place so callers can see what was missing.
/// </summary>
public static class AgreementRenderer
{
    private static readonly Regex TokenRegex = new(@"\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static readonly IReadOnlyList<string> KnownPlaceholders =
    [
        "party_name", "party_type",
        "fund_name", "fund_code",
        "total_amount", "currency",
        "installments", "frequency", "installment_amount",
        "start_date", "end_date",
        "today", "jamaat_name"
    ];

    public static string Render(string body, IReadOnlyDictionary<string, string> values)
    {
        if (string.IsNullOrEmpty(body)) return string.Empty;
        return TokenRegex.Replace(body, m =>
        {
            var key = m.Groups[1].Value.ToLowerInvariant();
            return values.TryGetValue(key, out var v) ? v : m.Value;
        });
    }
}
