using System.Net;
using Jamaat.Application.Events;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Bot-facing HTML stub for social link previews (WhatsApp, Twitter, LinkedIn, Slack, etc.).
/// The SPA renders OG tags client-side via react-helmet-async, but most social scrapers do NOT
/// execute JavaScript - so they'd see an empty &lt;head&gt;. Routing bots to <c>/og/events/{slug}</c>
/// gives them a fully-populated meta document plus a &lt;meta http-equiv="refresh"&gt; fallback so
/// humans who happen to hit this URL still reach the real portal page.
///
/// In production, configure the reverse proxy (nginx/IIS/CloudFront) to detect bot user-agents
/// and route <c>/portal/events/*</c> to this endpoint; humans continue to the SPA.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("og/events")]
public sealed class EventOgController(IEventPortalService portalSvc) : ControllerBase
{
    [HttpGet("{slug}")]
    public async Task<IActionResult> Get(string slug, CancellationToken ct)
    {
        var r = await portalSvc.GetBySlugAsync(slug, ct);
        if (!r.IsSuccess) return NotFound();
        var detail = r.Value!;
        var summary = detail.Summary;

        var title = WebUtility.HtmlEncode(detail.ShareTitle ?? summary.Name);
        var desc = WebUtility.HtmlEncode(detail.ShareDescription ?? summary.Tagline ?? "");
        var image = detail.ShareImageUrl ?? summary.CoverImageUrl ?? "";
        var imageEncoded = WebUtility.HtmlEncode(image);
        var host = Request.Host.HasValue ? Request.Host.Value : "localhost";
        var scheme = Request.Scheme;
        var canonical = $"{scheme}://{host}/portal/events/{WebUtility.UrlEncode(slug)}";
        var canonicalEncoded = WebUtility.HtmlEncode(canonical);

        var html = $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>{{title}}</title>
              <link rel="canonical" href="{{canonicalEncoded}}" />
              <meta name="description" content="{{desc}}" />
              <meta property="og:type" content="website" />
              <meta property="og:title" content="{{title}}" />
              <meta property="og:description" content="{{desc}}" />
              {{(string.IsNullOrEmpty(image) ? "" : $"<meta property=\"og:image\" content=\"{imageEncoded}\" />")}}
              <meta property="og:url" content="{{canonicalEncoded}}" />
              <meta name="twitter:card" content="{{(string.IsNullOrEmpty(image) ? "summary" : "summary_large_image")}}" />
              <meta name="twitter:title" content="{{title}}" />
              <meta name="twitter:description" content="{{desc}}" />
              {{(string.IsNullOrEmpty(image) ? "" : $"<meta name=\"twitter:image\" content=\"{imageEncoded}\" />")}}
              <meta http-equiv="refresh" content="0; url={{canonicalEncoded}}" />
            </head>
            <body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:40px;color:#334155">
              <h1 style="margin:0 0 8px">{{title}}</h1>
              {{(string.IsNullOrEmpty(desc) ? "" : $"<p style=\"margin:0 0 16px;color:#64748B\">{desc}</p>")}}
              <p><a href="{{canonicalEncoded}}">Open the event page →</a></p>
            </body>
            </html>
            """;

        Response.Headers.CacheControl = "public, max-age=300"; // scrapers cache aggressively; 5m keeps updates flowing
        return Content(html, "text/html; charset=utf-8");
    }
}
