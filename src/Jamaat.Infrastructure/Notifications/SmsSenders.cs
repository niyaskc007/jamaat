using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Jamaat.Application.Notifications;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.Notifications;

/// Composite sender: dispatches to the active provider per `SmsOptions.Provider`. If unset
/// or unrecognised, returns a no-op success so domain code that doesn't care about delivery
/// (e.g. dev environments) keeps working. The integration panel surfaces the active provider.
public sealed class CompositeSmsSender(
    IEnumerable<ISmsSender> providers,
    IOptionsMonitor<SmsOptions> options,
    ILogger<CompositeSmsSender> logger) : ISmsSender
{
    public string ProviderName => "Composite";

    public Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default)
    {
        var active = options.CurrentValue.Provider;
        if (string.IsNullOrWhiteSpace(active))
        {
            logger.LogDebug("SMS provider not configured; dropping message to {To}", toE164);
            return Task.FromResult(new SmsSendOutcome(true, "noop", "SMS disabled"));
        }
        var match = providers.FirstOrDefault(p => string.Equals(p.ProviderName, active, StringComparison.OrdinalIgnoreCase));
        if (match is null)
        {
            logger.LogWarning("SMS provider {Provider} not registered; dropping message", active);
            return Task.FromResult(new SmsSendOutcome(false, null, $"provider '{active}' not registered"));
        }
        return match.SendAsync(toE164, message, ct);
    }
}

/// Twilio SMS adapter. Uses Basic Auth against /Messages.json. Does NOT take a hard dependency
/// on the Twilio NuGet package - keeps the build slim and lets us swap auth/endpoint cleanly.
public sealed class TwilioSmsSender(IHttpClientFactory http, IOptionsMonitor<SmsOptions> options,
    ILogger<TwilioSmsSender> logger) : ISmsSender
{
    public string ProviderName => "Twilio";

    public async Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default)
    {
        var o = options.CurrentValue;
        if (string.IsNullOrWhiteSpace(o.TwilioAccountSid) || string.IsNullOrWhiteSpace(o.TwilioAuthToken)
            || string.IsNullOrWhiteSpace(o.FromNumber))
            return new(false, null, "Twilio credentials or FromNumber missing");
        var client = http.CreateClient("twilio");
        var url = $"https://api.twilio.com/2010-04-01/Accounts/{o.TwilioAccountSid}/Messages.json";
        var auth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{o.TwilioAccountSid}:{o.TwilioAuthToken}"));
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", auth);
        req.Content = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("From", o.FromNumber!),
            new KeyValuePair<string, string>("To", toE164),
            new KeyValuePair<string, string>("Body", message),
        });
        try
        {
            var res = await client.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                return new(false, null, $"Twilio {(int)res.StatusCode}: {Truncate(body, 200)}");
            using var doc = JsonDocument.Parse(body);
            var sid = doc.RootElement.TryGetProperty("sid", out var s) ? s.GetString() : null;
            return new(true, sid, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Twilio SMS failed to {To}", toE164);
            return new(false, null, ex.Message);
        }
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n];
}

/// Unifonic SMS adapter. UAE-popular regional gateway, REST API at api.unifonic.com.
public sealed class UnifonicSmsSender(IHttpClientFactory http, IOptionsMonitor<SmsOptions> options,
    ILogger<UnifonicSmsSender> logger) : ISmsSender
{
    public string ProviderName => "Unifonic";

    public async Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default)
    {
        var o = options.CurrentValue;
        if (string.IsNullOrWhiteSpace(o.UnifonicAppSid))
            return new(false, null, "Unifonic AppSid missing");
        var client = http.CreateClient("unifonic");
        var req = new HttpRequestMessage(HttpMethod.Post, "https://el.cloud.unifonic.com/rest/SMS/messages");
        req.Content = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("AppSid", o.UnifonicAppSid!),
            new KeyValuePair<string, string>("Recipient", toE164.TrimStart('+')),
            new KeyValuePair<string, string>("Body", message),
            new KeyValuePair<string, string>("SenderID", o.UnifonicSenderId ?? "Jamaat"),
        });
        try
        {
            var res = await client.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                return new(false, null, $"Unifonic {(int)res.StatusCode}: {Truncate(body, 200)}");
            using var doc = JsonDocument.Parse(body);
            var ok = doc.RootElement.TryGetProperty("success", out var s) && s.GetString()?.Equals("true", StringComparison.OrdinalIgnoreCase) == true;
            var msgId = doc.RootElement.TryGetProperty("data", out var d) && d.TryGetProperty("MessageID", out var m) ? m.GetString() : null;
            return new(ok, msgId, ok ? null : Truncate(body, 200));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Unifonic SMS failed to {To}", toE164);
            return new(false, null, ex.Message);
        }
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n];
}

/// Infobip SMS adapter. Strong MENA coverage; uses a per-tenant base URL + API key.
public sealed class InfobipSmsSender(IHttpClientFactory http, IOptionsMonitor<SmsOptions> options,
    ILogger<InfobipSmsSender> logger) : ISmsSender
{
    public string ProviderName => "Infobip";

    public async Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default)
    {
        var o = options.CurrentValue;
        if (string.IsNullOrWhiteSpace(o.InfobipApiKey) || string.IsNullOrWhiteSpace(o.InfobipBaseUrl)
            || string.IsNullOrWhiteSpace(o.FromNumber))
            return new(false, null, "Infobip ApiKey, BaseUrl or FromNumber missing");
        var client = http.CreateClient("infobip");
        var url = $"{o.InfobipBaseUrl!.TrimEnd('/')}/sms/2/text/advanced";
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("App", o.InfobipApiKey);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        var payload = new
        {
            messages = new[]
            {
                new
                {
                    from = o.FromNumber,
                    destinations = new[] { new { to = toE164.TrimStart('+') } },
                    text = message,
                },
            },
        };
        req.Content = JsonContent.Create(payload);
        try
        {
            var res = await client.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                return new(false, null, $"Infobip {(int)res.StatusCode}: {Truncate(body, 200)}");
            using var doc = JsonDocument.Parse(body);
            var msgId = doc.RootElement.TryGetProperty("messages", out var m) && m.GetArrayLength() > 0
                && m[0].TryGetProperty("messageId", out var id) ? id.GetString() : null;
            return new(true, msgId, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Infobip SMS failed to {To}", toE164);
            return new(false, null, ex.Message);
        }
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n];
}

/// Twilio WhatsApp adapter. Same Twilio API as SMS but with `whatsapp:` prefix on To/From.
public sealed class TwilioWhatsAppSender(IHttpClientFactory http, IOptionsMonitor<WhatsAppOptions> options,
    ILogger<TwilioWhatsAppSender> logger) : IWhatsAppSender
{
    public string ProviderName => "Twilio";

    public async Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default)
    {
        var o = options.CurrentValue;
        if (string.IsNullOrWhiteSpace(o.TwilioAccountSid) || string.IsNullOrWhiteSpace(o.TwilioAuthToken)
            || string.IsNullOrWhiteSpace(o.FromNumber))
            return new(false, null, "Twilio WhatsApp credentials or FromNumber missing");
        var client = http.CreateClient("twilio-wa");
        var url = $"https://api.twilio.com/2010-04-01/Accounts/{o.TwilioAccountSid}/Messages.json";
        var auth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{o.TwilioAccountSid}:{o.TwilioAuthToken}"));
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", auth);
        req.Content = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("From", $"whatsapp:{o.FromNumber}"),
            new KeyValuePair<string, string>("To", $"whatsapp:{toE164}"),
            new KeyValuePair<string, string>("Body", message),
        });
        try
        {
            var res = await client.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                return new(false, null, $"Twilio WA {(int)res.StatusCode}: {Truncate(body, 200)}");
            using var doc = JsonDocument.Parse(body);
            var sid = doc.RootElement.TryGetProperty("sid", out var s) ? s.GetString() : null;
            return new(true, sid, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Twilio WhatsApp failed to {To}", toE164);
            return new(false, null, ex.Message);
        }
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n];
}

/// Composite WhatsApp sender mirroring CompositeSmsSender.
public sealed class CompositeWhatsAppSender(
    IEnumerable<IWhatsAppSender> providers,
    IOptionsMonitor<WhatsAppOptions> options,
    ILogger<CompositeWhatsAppSender> logger) : IWhatsAppSender
{
    public string ProviderName => "Composite";

    public Task<SmsSendOutcome> SendAsync(string toE164, string message, CancellationToken ct = default)
    {
        var active = options.CurrentValue.Provider;
        if (string.IsNullOrWhiteSpace(active))
        {
            logger.LogDebug("WhatsApp provider not configured; dropping message to {To}", toE164);
            return Task.FromResult(new SmsSendOutcome(true, "noop", "WhatsApp disabled"));
        }
        var match = providers.FirstOrDefault(p => string.Equals(p.ProviderName, active, StringComparison.OrdinalIgnoreCase));
        if (match is null)
            return Task.FromResult(new SmsSendOutcome(false, null, $"WhatsApp provider '{active}' not registered"));
        return match.SendAsync(toE164, message, ct);
    }
}
