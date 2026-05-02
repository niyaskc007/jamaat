namespace Jamaat.Application.Identity;

public sealed record GeoLocation(string? Country, string? City);

/// Resolves an IP address to a coarse Country / City pair for the login-history audit.
/// Implementations must be **best-effort** - throwing here would block logins, which is
/// unacceptable; failures must be swallowed and logged.
public interface IGeolocationService
{
    Task<GeoLocation?> LookupAsync(string? ipAddress, CancellationToken ct = default);

    /// True if the implementation has a usable database / API configured. Surfaced on the
    /// integration panel so admins know whether geolocation is live.
    bool IsConfigured { get; }
}

public sealed class GeolocationOptions
{
    public const string SectionName = "Geolocation";

    /// "MaxMind" (offline, default) or "IpApi" (online fallback). Pluggable so admins can swap
    /// the active provider from the integration panel.
    public string Provider { get; set; } = "MaxMind";

    /// Path to the directory holding extracted .mmdb files. Default points at the in-repo
    /// folder so a fresh checkout works after the admin uploads + extracts via the UI.
    public string MaxMindDatabasePath { get; set; } = System.IO.Path.Combine("Maxmind");

    /// In-process cache TTL for IP -> location lookups; reduces DB hits during login bursts.
    public int CacheMinutes { get; set; } = 60;
}
