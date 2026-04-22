using System.Globalization;

namespace Jamaat.Application.Common;

/// <summary>Converts Gregorian to Hijri using the .NET UmAlQuraCalendar. Suitable for display only.</summary>
public static class HijriDate
{
    private static readonly UmAlQuraCalendar _hijri = new();
    private static readonly string[] MonthNames =
    [
        "Muharram", "Safar", "Rabiul Awwal", "Rabiul Akhar",
        "Jumadil Ula", "Jumadil Ukhra", "Rajab", "Shabaan",
        "Ramadan", "Shawwal", "Zul-Qada", "Zul-Hijja",
    ];

    /// <summary>Format a Gregorian DateOnly as an Islamic date string (e.g., "15 Rabiul Akhar 1431H.").</summary>
    public static string Format(DateOnly date)
    {
        try
        {
            var d = date.ToDateTime(TimeOnly.MinValue);
            // UmAlQuraCalendar is limited to a specific range; fall back silently if out of range.
            if (d < _hijri.MinSupportedDateTime || d > _hijri.MaxSupportedDateTime)
                return "";
            var hijriDay = _hijri.GetDayOfMonth(d);
            var hijriMonth = _hijri.GetMonth(d);
            var hijriYear = _hijri.GetYear(d);
            var name = MonthNames[Math.Clamp(hijriMonth - 1, 0, MonthNames.Length - 1)];
            return $"{hijriDay:D2} {name} {hijriYear}H.";
        }
        catch
        {
            return "";
        }
    }

    public static string? FormatOrNull(DateOnly? date) => date is null ? null : Format(date.Value);
}
