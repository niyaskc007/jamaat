# Jamaat Windows Installer

Produces a single signed-able `JamaatInstaller-<version>.exe` for end users to double-click.
Built on **Inno Setup 6** with custom Pascal pages for DB connection / ports / admin account.

## What the installer does

End users see a standard Windows installer wizard with these pages:

1. Welcome
2. License (`assets/license.txt`)
3. Install directory (default: `C:\Program Files\Jamaat`)
4. **Database connection** — server, database, Windows or SQL auth, credentials, plus a
   "Test connection" button that opens a real `SqlConnection` and reports the result.
5. **Ports & hosting** — HTTP port, public hostname, additional CORS origins.
6. **Administrator account** — full name, email, password, Jamaat name, base currency.
7. Ready / progress / finish.

On install the wizard:

- Lays down the published `Api/` folder (API binaries + `wwwroot/` React bundle).
- Installs the bundled .NET 10 Hosting Bundle if the runtime isn't detected.
- Opens the firewall for the chosen TCP port.
- Patches `Api\appsettings.json` with the operator's connection string, port, CORS origins,
  rotates the JWT signing key (random 64-byte secret), and bakes the admin seed values.
- Registers `JamaatApi` as an auto-start Windows Service (`sc create`), with restart-on-crash.
- Polls `http://localhost:<port>/api/v1/setup/status` until the service responds.
- Calls `POST /api/v1/setup/initialize` to create the first admin and stamp the tenant.
- Offers an "Open in browser" finish option.

Uninstall stops + deletes the service, drops the firewall rule, removes installed files.

## Files

| File | Purpose |
|---|---|
| `Jamaat.iss` | Main Inno Setup script. Defines wizard pages, [Files], [Run], Pascal `[Code]`. |
| `build.ps1` | Build orchestration: stops dev API → publish API → build web → bundle → invoke ISCC. |
| `scripts/test-db.ps1` | Bundled inside installer; called by Pascal "Test connection" button. |
| `scripts/post-install.ps1` | Bundled inside installer; runs at end of install to write appsettings, register service, init admin. |
| `assets/license.txt` | License shown on the License page. |
| `redist/` | Cache for the bundled .NET 10 Hosting Bundle (gitignored). Auto-downloaded by `build.ps1`. |
| `output/` | Compiler output (gitignored). Final `.exe` lands here. |

## Build prerequisites

- **Windows 10/11** or Windows Server 2019+
- **.NET 10 SDK** — `dotnet --version` should report 10.x
- **Node.js 20+** + **npm**
- **Inno Setup 6** — install with `winget install JRSoftware.InnoSetup`
- Internet access on first build (to download the .NET hosting bundle, ~70 MB)

## Build

From the repo root:

```powershell
.\installer\build.ps1
```

Common variants:

```powershell
.\installer\build.ps1 -Version 1.2.3              # set version
.\installer\build.ps1 -SkipApiBuild -SkipWebBuild # iterate on .iss without re-publishing
.\installer\build.ps1 -SkipHostingBundle          # smaller .exe; target box must have .NET 10
```

Output: `installer\output\JamaatInstaller-<version>.exe`.

## Test on a clean box

The installer expects to be the only thing on the target machine. **Don't run it on the
dev box** — the dev API and the installed service would fight over the same port and
service name. Use a clean Windows VM (Hyper-V, VirtualBox, parallels, etc).

```powershell
# On the test VM, after copying the .exe over:
.\JamaatInstaller-1.0.0.exe
```

## Silent / unattended install (GPO, Intune, SCCM)

Every wizard field maps to a `/<NAME>=value` command-line argument. Combine with Inno's
`/VERYSILENT` and `/SUPPRESSMSGBOXES` flags for a no-UI deploy:

```powershell
JamaatInstaller-2.3.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART `
  /DBSERVER=sql01.corp.local `
  /DBNAME=JAMAAT `
  /OPERATORAUTH=Windows `
  /SVCIDTYPE=Virtual `
  /PORT=5174 `
  /HOSTNAME=jamaat.corp.local `
  /ADMINNAME="System Administrator" `
  /ADMINEMAIL=ops@corp.com `
  /ADMINPASSWORD=Sup3rS3cret! `
  /JAMAATNAME="Corporate HQ" `
  /CURRENCY=USD `
  /LOG="%TEMP%\jamaat-install.log"
```

Recognised flags:

| Flag | Description |
|---|---|
| `/DBSERVER=` | SQL Server hostname (e.g. `localhost`, `sql01\SQLEXPRESS`) |
| `/DBNAME=` | Database name (e.g. `JAMAAT`) — created if missing |
| `/OPERATORAUTH=` | `Windows` or `Sql` — auth used by the installer to provision the DB |
| `/OPERATORUSER=` | SQL login (only when `OPERATORAUTH=Sql`) |
| `/OPERATORPASSWORD=` | SQL password (only when `OPERATORAUTH=Sql`) |
| `/SVCIDTYPE=` | `Virtual` (recommended), `LocalSystem`, `NetworkService`, `Custom`, `SqlLogin` |
| `/SVCACCOUNT=` | DOMAIN\user (Custom) or SQL login name (SqlLogin) |
| `/SVCPASSWORD=` | Password for the above |
| `/PORT=` | TCP port the API listens on (default 5174) |
| `/HOSTNAME=` | Public hostname used for CORS + browser links |
| `/CORSORIGINS=` | Extra CORS origins, comma-separated |
| `/ADMINNAME=` | First admin's full name |
| `/ADMINEMAIL=` | First admin's email (becomes the login) |
| `/ADMINPASSWORD=` | First admin's password (must meet ASP.NET Identity rules: 8+ chars, upper+lower+digit) |
| `/JAMAATNAME=` | Tenant display name |
| `/CURRENCY=` | One of `AED`, `INR`, `USD`, `GBP`, `PKR`, `KWD`, `SAR` |

Standard Inno Setup flags also apply: `/SILENT` (very-silent + a final progress dialog),
`/VERYSILENT` (no UI), `/SUPPRESSMSGBOXES` (auto-default any prompt), `/LOG=path` (write
the install log somewhere SCCM can collect). Exit codes follow Inno conventions:

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Setup failed to initialise (missing prereqs etc) |
| `2` | User cancelled before install |
| `3` | Fatal error during prepare-to-install |
| `5` | User cancelled during install |
| `1602` | User cancelled (silent path) |
| `1603` | Fatal error during the install — check the log + `{app}\install-state.json` |
| `1641` | Restart needed |

## Code-signing

Inno Setup supports `SignTool=` in `[Setup]`. To sign:

1. Add a signtool entry to your Inno Setup config (Tools → Configure Sign Tools).
2. Add `SignTool=mysigntool` and `SignedUninstaller=yes` to the `[Setup]` section in `Jamaat.iss`.
3. Re-build.

We don't ship a signing config in the repo because the cert path/password is per-machine.

## Troubleshooting

- **ISCC not found** — `build.ps1` searches default paths and the user-scope winget install
  (`%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe`). Pass `-IsccPath` to override.
- **`dotnet publish` complains about locked DLLs** — `build.ps1` stops `JamaatApi` and any
  running dev API automatically, but kill any IDE that has the project loaded if it persists.
- **Hosting bundle download fails** — check `$HostingBundleUrl` in `build.ps1`. The default
  points to a specific 10.0.0 build. If Microsoft moves the URL, override:
  `.\build.ps1 -HostingBundleUrl https://...`
- **Installer crashes on the database page** — open `%TEMP%\db-test-result.txt` after a Test
  click to see the raw PowerShell output.
- **Service starts but `/api/v1/setup/status` 404s** — wrong port mapping. Check
  `<install-dir>\Logs\post-install-*.log` and the service's stderr (event log).
