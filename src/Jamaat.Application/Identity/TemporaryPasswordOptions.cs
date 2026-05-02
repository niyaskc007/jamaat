namespace Jamaat.Application.Identity;

public sealed class TemporaryPasswordOptions
{
    public const string SectionName = "TemporaryPassword";

    /// How long a temp password remains usable from issue. Configurable; integration panel can
    /// override at runtime (future enhancement). 7 days by default - long enough for the user
    /// to receive the welcome message, short enough that a leaked credential auto-expires.
    public int ExpiryDays { get; set; } = 7;

    /// Length of generated temp passwords. 12 chars gives ~71 bits of entropy in the alphabet
    /// below, which is plenty for one-shot use within a 7-day window.
    public int Length { get; set; } = 12;
}
