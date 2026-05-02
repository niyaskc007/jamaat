# MaxMind GeoLite2 Geolocation Setup

The login-history audit (admin → Login history) shows the **country and city** each login attempt came from. That enrichment uses an offline MaxMind GeoLite2 database — no third-party API calls, no data leakage to external services, no per-login latency.

This document explains how to install, refresh, and verify the database.

---

## Why offline (MaxMind) instead of an online API?

| Concern | MaxMind (offline) | Online API (e.g. ip-api.com) |
|---|---|---|
| Latency on login path | <1 ms | 100-500 ms |
| Privacy (member IPs) | Stays on your servers | Sent to a third-party |
| Rate limits | None | Free tiers ~45 req/min |
| Outage coupling | No | Yes — third-party down breaks geo |
| Air-gapped deploys | Works | Doesn't |
| Disk cost | ~75 MB (Country) / ~75 MB (City) | 0 |
| Update cadence | Monthly download | Real-time |

For a financial app where login is on the critical path, MaxMind wins on every load-bearing concern.

---

## Initial setup (one time)

### 1. Get a free MaxMind account

Sign up at <https://www.maxmind.com/en/geolite2/signup> (free; no credit card). Once logged in, generate a **license key** under Account → Manage License Keys.

### 2. Download a GeoLite2 database

Two options that work with this app:

- **GeoLite2-Country** (~5 MB) — country-level lookup. Sufficient for most needs.
- **GeoLite2-City** (~75 MB) — country + city + region + postal code. Preferred if you want city-level audit visibility.

Download the **`.tar.gz`** build for whichever you choose. URLs follow this pattern (insert your license key):

```text
https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=YOUR_KEY&suffix=tar.gz
https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=YOUR_KEY&suffix=tar.gz
```

You'll get a file named like `GeoLite2-Country_20260501.tar.gz` (the date suffix is the build date).

### 3. Upload via the admin UI

1. Sign in as an admin (`admin.integration` permission).
2. Go to **Administration → Integrations → Geolocation**.
3. Click **Upload database**.
4. Select the `.tar.gz` (or pre-extracted `.mmdb`) you downloaded.
5. The server unpacks the archive, drops the `.mmdb` into `Maxmind/` next to the API binary, and reloads the in-memory reader. No app restart needed.
6. The **Status** chip flips to "Loaded — Country DB" (or "City DB").

### 4. Verify it works

- On the same admin page, the **Test lookup** section accepts an IP address (try `8.8.8.8`) and returns the resolved country/city.
- Open **Administration → Login history**. New login rows from this point on will have the Country and City columns populated.

---

## Refreshing the database (every month)

MaxMind publishes new builds twice a week. They retire old data after about 30 days, so you'll want to refresh roughly monthly.

The flow is identical to the initial upload:

1. Download a fresh `.tar.gz` from MaxMind (same URL, just rerun it).
2. Upload via **Integrations → Geolocation → Upload database**.
3. The server replaces the old `.mmdb` in place and hot-reloads the reader — existing in-flight logins are not interrupted.

**Tip:** If you'd rather automate this, schedule a cron job on the API host that:

1. Curls the MaxMind URL with your license key.
2. Posts the resulting tarball to `POST /api/v1/integrations/geolocation/upload` using a service-account JWT.

---

## Manual installation (without the UI)

If you can't reach the admin UI (e.g. first-run before any user is set up), drop the database directly on disk:

1. Extract the `.tar.gz` from MaxMind.
2. Find the `.mmdb` file inside (it's nested under a versioned folder).
3. Copy the `.mmdb` into one of:
   - `<API_BIN>/Maxmind/` (next to the running API binary)
   - `src/Jamaat.Api/Maxmind/` (in the source tree, picked up automatically in dev)
   - The path configured by `Geolocation:MaxMindDatabasePath` in `appsettings.json`
4. Restart the API (or hit the upload endpoint with any small valid file to trigger a reload).

The service walks subdirectories, so leaving the file inside its `GeoLite2-Country_<date>/` folder also works.

---

## Configuration reference

```json
{
  "Geolocation": {
    "Provider": "MaxMind",
    "MaxMindDatabasePath": "Maxmind",
    "CacheMinutes": 60
  }
}
```

| Setting | Default | Meaning |
|---|---|---|
| `Provider` | `MaxMind` | Active provider. Future: `IpApi` for online fallback. |
| `MaxMindDatabasePath` | `Maxmind` | Directory holding the `.mmdb` file. Relative paths resolve against the API binary directory; absolute paths are used as-is. |
| `CacheMinutes` | `60` | In-process cache TTL for IP→location. Reduces DB hits during login bursts. |

---

## Troubleshooting

**Q: The status chip says "Not configured" after upload.**
A: The tarball didn't contain a `.mmdb`. MaxMind also ships `-CSV` zips that don't have one — make sure you downloaded the **binary** (`tar.gz`) build, not the CSV.

**Q: Country shows as null on every login attempt.**
A: Logins from `127.0.0.1`, `::1`, or RFC1918 ranges (`10.x`, `192.168.x`, `172.16-31.x`) are skipped — these are private and have no public geolocation. Test with a public IP via the admin Test lookup form.

**Q: I see the file at `Maxmind/GeoLite2-Country.mmdb` but the status is still "Not configured".**
A: Restart the API once, or hit any upload endpoint to trigger `Reload()`. The service caches "no DB found" for 60 seconds before retrying disk.

**Q: The reload endpoint returned 200 but lookups still fail.**
A: Check the API logs for `Failed to load MaxMind database` — most likely the `.mmdb` is corrupted (truncated download). Re-download from MaxMind and try again.

---

## Privacy note

The MaxMind `.mmdb` is read-only and does not phone home. No member IP ever leaves your servers. The license you accept from MaxMind permits commercial use of the GeoLite2 build — see <https://www.maxmind.com/en/geolite2/eula> for the full terms.
