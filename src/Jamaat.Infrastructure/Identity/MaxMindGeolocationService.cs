using System.Collections.Concurrent;
using System.Net;
using Jamaat.Application.Identity;
using MaxMind.GeoIP2;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Identity;

/// Offline IP -> Country/City lookup against a MaxMind GeoLite2 database. Loads the .mmdb file
/// once at startup (lazily; if the file is missing we degrade gracefully and IsConfigured=false).
/// Reuses the same DatabaseReader for every lookup - it is thread-safe per the MaxMind docs.
///
/// Resolution: the path in GeolocationOptions.MaxMindDatabasePath is treated as a directory; we
/// search for a file matching GeoLite2-City.mmdb first, then GeoLite2-Country.mmdb, then any *.mmdb.
/// This way the admin can drop ANY of the official builds in and we'll pick the most precise.
public sealed class MaxMindGeolocationService : IGeolocationService, IDisposable
{
    private readonly GeolocationOptions _options;
    private readonly ILogger<MaxMindGeolocationService> _logger;
    private readonly ConcurrentDictionary<string, (GeoLocation Geo, DateTimeOffset At)> _cache = new();
    private DatabaseReader? _reader;
    private DateTimeOffset _lastLoadAttempt = DateTimeOffset.MinValue;
    private readonly object _loadLock = new();
    private bool _isCity; // City DB resolves to a richer payload; otherwise Country-only.

    public MaxMindGeolocationService(IOptions<GeolocationOptions> options, ILogger<MaxMindGeolocationService> logger)
    {
        _options = options.Value;
        _logger = logger;
        TryLoad();
    }

    public bool IsConfigured => _reader is not null;

    public Task<GeoLocation?> LookupAsync(string? ipAddress, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(ipAddress)) return Task.FromResult<GeoLocation?>(null);
        if (!IPAddress.TryParse(ipAddress, out var ip)) return Task.FromResult<GeoLocation?>(null);
        // Skip RFC1918 / loopback / link-local - they have no public geolocation.
        if (IsPrivateOrLocal(ip)) return Task.FromResult<GeoLocation?>(null);

        var ttl = TimeSpan.FromMinutes(Math.Max(1, _options.CacheMinutes));
        if (_cache.TryGetValue(ipAddress, out var hit) && DateTimeOffset.UtcNow - hit.At < ttl)
            return Task.FromResult<GeoLocation?>(hit.Geo);

        EnsureLoaded();
        if (_reader is null) return Task.FromResult<GeoLocation?>(null);

        try
        {
            string? country, city = null;
            if (_isCity)
            {
                var c = _reader.City(ip);
                country = c.Country?.Name ?? c.RegisteredCountry?.Name;
                city = c.City?.Name;
            }
            else
            {
                var c = _reader.Country(ip);
                country = c.Country?.Name ?? c.RegisteredCountry?.Name;
            }
            var geo = new GeoLocation(country, city);
            _cache[ipAddress] = (geo, DateTimeOffset.UtcNow);
            return Task.FromResult<GeoLocation?>(geo);
        }
        catch (Exception ex)
        {
            // MaxMind throws AddressNotFoundException for IPs not in the DB; that's fine.
            _logger.LogDebug(ex, "MaxMind lookup failed for {Ip}", ipAddress);
            return Task.FromResult<GeoLocation?>(null);
        }
    }

    /// Forces the reader to be reloaded - called after an admin uploads a fresh .mmdb so the
    /// next request picks up the new database without an app restart.
    public void Reload()
    {
        lock (_loadLock)
        {
            _reader?.Dispose();
            _reader = null;
            _cache.Clear();
            _lastLoadAttempt = DateTimeOffset.MinValue;
            TryLoad();
        }
    }

    private void EnsureLoaded()
    {
        if (_reader is not null) return;
        // Retry at most once per minute - if the file isn't there, don't hammer the disk.
        if (DateTimeOffset.UtcNow - _lastLoadAttempt < TimeSpan.FromMinutes(1)) return;
        TryLoad();
    }

    private void TryLoad()
    {
        lock (_loadLock)
        {
            _lastLoadAttempt = DateTimeOffset.UtcNow;
            try
            {
                var path = ResolveDatabasePath();
                if (path is null)
                {
                    _logger.LogInformation("No MaxMind .mmdb file found under {Dir}; geolocation disabled until upload.",
                        _options.MaxMindDatabasePath);
                    return;
                }
                _reader = new DatabaseReader(path);
                _isCity = path.Contains("City", StringComparison.OrdinalIgnoreCase);
                _logger.LogInformation("MaxMind {Kind} database loaded from {Path}", _isCity ? "City" : "Country", path);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load MaxMind database; geolocation disabled.");
                _reader = null;
            }
        }
    }

    private string? ResolveDatabasePath()
    {
        // Dev convenience: search the configured path AND a few standard fallbacks. In production
        // the admin upload writes the file directly into the configured path so the first candidate
        // wins; in dev it lets a fresh checkout pick up the Maxmind/ folder under src/Jamaat.Api/
        // without anyone having to copy files into bin/.
        foreach (var dir in CandidateDirs())
        {
            if (!Directory.Exists(dir)) continue;
            // Prefer City > Country > any .mmdb (admin may have dropped a renamed file in).
            string[] preferred = ["GeoLite2-City.mmdb", "GeoLite2-Country.mmdb"];
            foreach (var p in preferred)
            {
                var match = Directory.EnumerateFiles(dir, p, SearchOption.AllDirectories).FirstOrDefault();
                if (match is not null) return match;
            }
            var any = Directory.EnumerateFiles(dir, "*.mmdb", SearchOption.AllDirectories).FirstOrDefault();
            if (any is not null) return any;
        }
        return null;
    }

    private IEnumerable<string> CandidateDirs()
    {
        var configured = _options.MaxMindDatabasePath;
        if (Path.IsPathRooted(configured)) yield return configured;
        else
        {
            yield return Path.Combine(AppContext.BaseDirectory, configured);
            yield return Path.Combine(Directory.GetCurrentDirectory(), configured);
            // Walk up from the running binary to find a sibling src/Jamaat.Api/Maxmind in dev.
            var dir = AppContext.BaseDirectory;
            for (int i = 0; i < 6 && !string.IsNullOrEmpty(dir); i++)
            {
                var candidate = Path.Combine(dir, "src", "Jamaat.Api", configured);
                if (Directory.Exists(candidate)) { yield return candidate; break; }
                dir = Directory.GetParent(dir)?.FullName ?? "";
            }
        }
    }

    private static bool IsPrivateOrLocal(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip)) return true;
        var bytes = ip.GetAddressBytes();
        if (bytes.Length == 4)
        {
            return bytes[0] == 10                                                    // 10.0.0.0/8
                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)             // 172.16.0.0/12
                || (bytes[0] == 192 && bytes[1] == 168)                              // 192.168.0.0/16
                || (bytes[0] == 169 && bytes[1] == 254);                             // link-local
        }
        return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal;
    }

    public void Dispose() => _reader?.Dispose();
}
