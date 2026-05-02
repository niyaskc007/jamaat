# Integration Configuration Guide

Jamaat ships pluggable adapters for SMS, WhatsApp, email, and offline IP geolocation. Configure each in `appsettings.json` (or environment variables) and verify from **Administration → Integrations**.

---

## Quick reference

| Integration | Config section | Provider field | Test endpoint |
|---|---|---|---|
| Geolocation (MaxMind) | `Geolocation` | `Provider: MaxMind` | `POST /api/v1/integrations/geolocation/test?ip=...` |
| SMS | `Sms` | `Provider: Twilio | Unifonic | Infobip` | `POST /api/v1/integrations/sms/test` |
| WhatsApp | `WhatsApp` | `Provider: Twilio` | `POST /api/v1/integrations/whatsapp/test` |
| Email | `Notifications:Smtp` | `Notifications:Enabled=true` | (no live test endpoint — verify by triggering a real notification) |

Every integration is **disabled by default** when the `Provider` (or `Notifications:Enabled`) is empty. The system falls back to log-only mode in that case — every notification still gets an audit row, just no outbound delivery.

---

## Geolocation (MaxMind GeoLite2)

See the dedicated guide: **[`docs/admin/geolocation-maxmind.md`](geolocation-maxmind.md)**.

TL;DR: download a free `.tar.gz` from MaxMind, upload via **Integrations → Geolocation → Upload database**. The reader hot-reloads; no restart.

---

## SMS

Three providers ship out-of-the-box:

### Twilio (global, premium)

```json
"Sms": {
  "Provider": "Twilio",
  "FromNumber": "+9715xxxxxxx",
  "TwilioAccountSid": "ACxxxxxxxxxxxxxxxx",
  "TwilioAuthToken": "your_auth_token"
}
```

Account: <https://console.twilio.com/>
Pricing: ~$0.04+ per UAE-bound SMS.
Pros: Global reach, mature API, also handles WhatsApp.
Cons: Most expensive option for the GCC region.

### Unifonic (UAE-based, regional sweet spot)

```json
"Sms": {
  "Provider": "Unifonic",
  "FromNumber": "+9715xxxxxxx",
  "UnifonicAppSid": "your_app_sid",
  "UnifonicSenderId": "Jamaat"
}
```

Account: <https://www.unifonic.com/>
Pricing: ~$0.02-0.03 per UAE-bound SMS.
Pros: Local company, fast support, sender-ID friendly, cheaper than Twilio.
Cons: Smaller global footprint.

### Infobip (global, strong MENA)

```json
"Sms": {
  "Provider": "Infobip",
  "FromNumber": "+9715xxxxxxx",
  "InfobipApiKey": "your_api_key",
  "InfobipBaseUrl": "https://xxxxxx.api.infobip.com"
}
```

Account: <https://www.infobip.com/>
Pricing: ~$0.025-0.03 per UAE-bound SMS.
Pros: Enterprise-grade, dedicated MENA team, broader provider stack (also Voice/Email/Chat).
Cons: Onboarding takes longer than Twilio/Unifonic.

### Adding another SMS provider

1. Implement `Application.Notifications.ISmsSender` in `Jamaat.Infrastructure/Notifications/`.
2. Set `ProviderName` to a string like `"Plivo"`.
3. Register in `DependencyInjection.cs`.
4. Set `Sms:Provider` to that string and supply credentials.

The composite sender picks the registered provider whose `ProviderName` matches `Sms:Provider` at runtime — no code changes needed when switching between configured providers.

---

## WhatsApp (Twilio Business API)

```json
"WhatsApp": {
  "Provider": "Twilio",
  "FromNumber": "+14155238886",  // Twilio sandbox or your approved business number
  "TwilioAccountSid": "ACxxxxxxxxxxxxxxxx",
  "TwilioAuthToken": "your_auth_token"
}
```

**Sandbox vs production**:

- **Sandbox**: free to test. Recipients must opt in by texting `join <phrase>` to your sandbox number first.
- **Production**: requires Twilio to approve your WhatsApp Business profile + each outbound template you want to send outside a 24-hour conversation window. Welcome / temp-password messages are exactly the kind of messages that need template approval.

For the welcome notification, register a template in your Twilio console along these lines:

```
Salaam {{1}}, your Jamaat self-service portal is ready.
Sign in at {{2}} with your ITS or email and the temp password {{3}}.
You'll set a permanent password on first login.
```

---

## Email (SMTP)

Existing notifications stack — extended in this rollout to coexist with SMS / WhatsApp via the channel-routing logic.

```json
"Notifications": {
  "Enabled": true,
  "FromEmail": "noreply@your-host",
  "FromName": "Your Jamaat",
  "Smtp": {
    "Host": "smtp.your-provider.com",
    "Port": 587,
    "UseSsl": true,
    "Username": "smtp_user",
    "Password": "smtp_password"
  }
}
```

When `Enabled=false` or `Smtp.Host` is empty, every email notification becomes log-only (still audited).

---

## Channel routing

When a domain event triggers a notification (welcome, temp-pw-issued, receipt confirmation, QH disbursement), the `NotificationSender` picks the most-direct channel the recipient has on file:

1. **WhatsApp** if `WhatsApp:Provider` set + member has `PhoneE164`
2. **SMS** if `Sms:Provider` set + member has `PhoneE164`
3. **Email** if SMTP is ready + member has email
4. **Log-only** otherwise (audit row only)

Callers can override the channel with `NotificationMessage.PreferredChannel` if a specific message must always go to a specific channel (e.g. password reset → SMS).

---

## Verifying everything works

1. Sign in as admin → **Administration → Integrations**.
2. Each tab has a **Test** button:
   - Geolocation: enter `8.8.8.8`, expect `United States`.
   - SMS: enter your own E.164 phone, expect a real SMS.
   - WhatsApp: same, expect a WhatsApp message (may need sandbox opt-in first).
3. Open **Administration → Notifications** to see every test send recorded in the audit log.

---

## Troubleshooting

**Q: I configured Twilio but the test send returns "Twilio 401: ..."**
A: Auth token wrong. Re-copy from the Twilio console (mind whitespace) and restart the API.

**Q: Test send "succeeded" with `providerMessageId: noop`**
A: SMS provider not configured (`Sms:Provider` empty). The composite sender returns success with `noop` so domain code that doesn't care about delivery keeps working.

**Q: Test SMS goes to one country but the welcome message doesn't.**
A: Welcome routes per-recipient. Check the member has `PhoneE164` populated (not `Phone`) — the channel-routing logic only uses E.164 normalised numbers.

**Q: WhatsApp returns "63016: failed to send freeform message because you are outside the allowed window"**
A: You're using a production Twilio WhatsApp Business number without an approved template. Either switch to the sandbox for testing, or get your template approved.

**Q: Notifications all show "skipped" with reason "No recipient phone on file"**
A: Members imported via the Excel flow may not have `PhoneE164` set — only the legacy `Phone` field. Update the bulk-import template to populate `Phone` in E.164 format (e.g. `+9715xxxxxxx`) so the auto-provisioning copies it across.
