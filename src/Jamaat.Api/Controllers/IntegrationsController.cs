using System.Formats.Tar;
using System.IO.Compression;
using Jamaat.Application.Identity;
using Jamaat.Application.Notifications;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Jamaat.Api.Controllers;

/// Integration / external-service config + upload endpoints. Each integration is gated on
/// admin.integration. Today this includes: MaxMind geolocation database upload. Future:
/// Twilio / Unifonic / Infobip / WhatsApp / SMTP test-send endpoints (Phase C4).
[ApiController]
[Authorize(Policy = "admin.integration")]
[Route("api/v1/integrations")]
public sealed class IntegrationsController(
    IOptions<GeolocationOptions> geoOpts,
    MaxMindGeolocationService geoSvc,
    IGeolocationService geoIface,
    IOptionsMonitor<SmsOptions> smsOpts,
    IOptionsMonitor<WhatsAppOptions> waOpts,
    CompositeSmsSender smsSender,
    CompositeWhatsAppSender waSender) : ControllerBase
{
    /// Aggregate status for the integration panel: which providers are wired, which are
    /// configured, what the active provider names are. The frontend renders red/green chips
    /// off this payload.
    [HttpGet("status")]
    public IActionResult Status()
    {
        var sms = smsOpts.CurrentValue;
        var wa = waOpts.CurrentValue;
        return Ok(new
        {
            geolocation = new
            {
                provider = geoOpts.Value.Provider,
                isConfigured = geoIface.IsConfigured,
                databasePath = geoOpts.Value.MaxMindDatabasePath,
            },
            sms = new
            {
                provider = sms.Provider,
                isConfigured = !string.IsNullOrWhiteSpace(sms.Provider),
                fromNumber = sms.FromNumber,
                supported = new[] { "Twilio", "Unifonic", "Infobip" },
            },
            whatsapp = new
            {
                provider = wa.Provider,
                isConfigured = !string.IsNullOrWhiteSpace(wa.Provider),
                fromNumber = wa.FromNumber,
                supported = new[] { "Twilio" },
            },
        });
    }

    /// Send a test SMS through the active provider. Used by the integration panel after the
    /// admin enters credentials - one click verifies end-to-end delivery without needing to
    /// trigger a real domain event.
    [HttpPost("sms/test")]
    public async Task<IActionResult> TestSms([FromBody] TestSendDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.To)) return BadRequest(new { error = "to_required" });
        var msg = string.IsNullOrWhiteSpace(dto.Message)
            ? "Test message from Jamaat - if you see this, SMS is working."
            : dto.Message!;
        var outcome = await smsSender.SendAsync(dto.To, msg, ct);
        return Ok(outcome);
    }

    /// Send a test WhatsApp through the active provider.
    [HttpPost("whatsapp/test")]
    public async Task<IActionResult> TestWhatsApp([FromBody] TestSendDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.To)) return BadRequest(new { error = "to_required" });
        var msg = string.IsNullOrWhiteSpace(dto.Message)
            ? "Test message from Jamaat - if you see this, WhatsApp is working."
            : dto.Message!;
        var outcome = await waSender.SendAsync(dto.To, msg, ct);
        return Ok(outcome);
    }


    /// Reports whether MaxMind is currently usable plus where the .mmdb file is expected.
    /// Used by the integration panel to render a green "Loaded" / red "Not configured" badge.
    [HttpGet("geolocation/status")]
    public IActionResult GetGeolocationStatus()
    {
        return Ok(new
        {
            provider = geoOpts.Value.Provider,
            databasePath = geoOpts.Value.MaxMindDatabasePath,
            isConfigured = geoIface.IsConfigured,
            cacheMinutes = geoOpts.Value.CacheMinutes,
        });
    }

    /// Test a single IP through the active geolocation service. Use the admin's own IP via
    /// `?ip=<remote>` or a public IP like 8.8.8.8 to verify the lookup pipeline.
    [HttpGet("geolocation/test")]
    public async Task<IActionResult> TestGeolocation([FromQuery] string ip, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ip)) return BadRequest(new { error = "ip_required" });
        var hit = await geoIface.LookupAsync(ip, ct);
        return Ok(new { ip, country = hit?.Country, city = hit?.City, found = hit is not null });
    }

    /// Upload a fresh MaxMind GeoLite2 database. Accepts either a raw .mmdb file or the official
    /// `.tar.gz` (which contains the .mmdb inside a versioned subfolder). The file is written
    /// into the configured MaxMindDatabasePath and the in-memory reader is reloaded immediately
    /// so the change is live without a restart.
    [HttpPost("geolocation/upload")]
    [RequestSizeLimit(150 * 1024 * 1024)]
    public async Task<IActionResult> UploadMaxMind([FromForm] IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "file_required" });
        var name = file.FileName.ToLowerInvariant();
        var dir = ResolveAbsolute(geoOpts.Value.MaxMindDatabasePath);
        Directory.CreateDirectory(dir);

        try
        {
            if (name.EndsWith(".mmdb", StringComparison.OrdinalIgnoreCase))
            {
                var dest = Path.Combine(dir, Path.GetFileName(file.FileName));
                await using var fs = System.IO.File.Create(dest);
                await file.CopyToAsync(fs, ct);
            }
            else if (name.EndsWith(".tar.gz", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".tgz", StringComparison.OrdinalIgnoreCase))
            {
                await ExtractTarGzAsync(file, dir, ct);
            }
            else if (name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                await ExtractZipAsync(file, dir, ct);
            }
            else
            {
                return BadRequest(new { error = "unsupported_format", message = "Upload a .mmdb, .tar.gz or .zip from MaxMind." });
            }

            geoSvc.Reload();
            return Ok(new
            {
                isConfigured = geoIface.IsConfigured,
                message = geoIface.IsConfigured
                    ? "MaxMind database loaded successfully."
                    : "Upload received but no .mmdb was found inside; check the archive content.",
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "upload_failed", detail = ex.Message });
        }
    }

    private static string ResolveAbsolute(string path) =>
        Path.IsPathRooted(path) ? path : Path.Combine(AppContext.BaseDirectory, path);

    /// Streams the tarball through GZipStream + TarReader, writing each .mmdb out to `dir`
    /// (flattened - the official tarball nests under GeoLite2-Country_<date>/, which we don't need).
    private static async Task ExtractTarGzAsync(IFormFile file, string dir, CancellationToken ct)
    {
        await using var src = file.OpenReadStream();
        await using var gz = new GZipStream(src, CompressionMode.Decompress);
        await using var tar = new TarReader(gz);
        TarEntry? entry;
        while ((entry = await tar.GetNextEntryAsync(cancellationToken: ct)) is not null)
        {
            if (entry.EntryType != TarEntryType.RegularFile) continue;
            var fname = Path.GetFileName(entry.Name);
            if (string.IsNullOrEmpty(fname)) continue;
            if (!fname.EndsWith(".mmdb", StringComparison.OrdinalIgnoreCase)) continue;
            var dest = Path.Combine(dir, fname);
            await using var outFs = System.IO.File.Create(dest);
            if (entry.DataStream is not null)
                await entry.DataStream.CopyToAsync(outFs, ct);
        }
    }

    public sealed record TestSendDto(string To, string? Message);

    private static async Task ExtractZipAsync(IFormFile file, string dir, CancellationToken ct)
    {
        await using var src = file.OpenReadStream();
        // ZipArchive needs a seekable stream; copy to a memory stream first.
        using var ms = new MemoryStream();
        await src.CopyToAsync(ms, ct);
        ms.Position = 0;
        using var zip = new ZipArchive(ms, ZipArchiveMode.Read);
        foreach (var entry in zip.Entries)
        {
            if (string.IsNullOrEmpty(entry.Name)) continue;
            if (!entry.Name.EndsWith(".mmdb", StringComparison.OrdinalIgnoreCase)) continue;
            var dest = Path.Combine(dir, Path.GetFileName(entry.Name));
            await using var outFs = System.IO.File.Create(dest);
            await using var inFs = entry.Open();
            await inFs.CopyToAsync(outFs, ct);
        }
    }
}
