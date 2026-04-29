using System.Text.RegularExpressions;

namespace Jamaat.Domain.ValueObjects;

/// ITS (Intricate Tracking System) number - 8-digit identifier used across the main Jamaat platform.
public readonly partial record struct ItsNumber
{
    public string Value { get; }

    private ItsNumber(string value) => Value = value;

    public static bool TryCreate(string? input, out ItsNumber its)
    {
        its = default;
        if (string.IsNullOrWhiteSpace(input)) return false;
        var trimmed = input.Trim();
        if (!ItsRegex().IsMatch(trimmed)) return false;
        its = new ItsNumber(trimmed);
        return true;
    }

    public static ItsNumber Create(string input) =>
        TryCreate(input, out var its) ? its : throw new ArgumentException($"Invalid ITS number: '{input}'", nameof(input));

    public override string ToString() => Value;

    [GeneratedRegex(@"^\d{8}$")]
    private static partial Regex ItsRegex();
}
