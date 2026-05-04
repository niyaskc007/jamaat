; Jamaat Web Application - Inno Setup installer
;
; This script produces JamaatInstaller-<version>.exe. It bundles:
;   - Api\         The published .NET 10 API (framework-dependent) + wwwroot/ React bundle
;   - scripts\     Helper PowerShell (DB connection test + post-install registration)
;   - redist\      Optional bundled .NET 10 Hosting Bundle (built/downloaded by build.ps1)
;
; The installer drives the user through three custom wizard pages on top of the standard
; Inno Setup ones (Welcome / License / Directory): Database, Ports & Hosting, Admin Account.
; All operator-supplied values are captured in the [Code] section as `gXxx` global variables
; and threaded into the post-install PowerShell script via Run/Parameters.

#ifndef MyAppVersion
#define MyAppVersion "1.0.0"
#endif

#define MyAppName        "Jamaat"
#define MyAppPublisher   "Ubrixy Technologies"
#define MyAppURL         "https://www.ubrixy.com/"
#define MyAppRepoURL     "https://github.com/niyaskc007/jamaat"
#define MyAppId          "{{8C4A1E3B-2D14-4F7C-9F9B-1C8E45A3B2C1}"
#define MyServiceName    "JamaatApi"
#define MyAppCopyright   "Copyright (c) 2026 Ubrixy Technologies. All rights reserved."

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=JamaatInstaller-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; SetupIconFile=assets\jamaat.ico  ; uncomment once a real icon exists; default is fine for now
LicenseFile=assets\license.txt
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
UninstallDisplayName={#MyAppName} {#MyAppVersion}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoCopyright={#MyAppCopyright}
VersionInfoDescription={#MyAppName} - a product of {#MyAppPublisher}
AppCopyright={#MyAppCopyright}
ChangesEnvironment=no
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; Brand the standard wizard labels so "Powered by Ubrixy Technologies" is visible on the
; welcome and finish pages without us having to hand-build a custom WelcomePage.
[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nJamaat is a product of Ubrixy Technologies (https://www.ubrixy.com/).%n%nIt is recommended that you close all other applications before continuing.
FinishedLabel=Setup has finished installing [name] on your computer.%n%nJamaat is a product of Ubrixy Technologies. The application may be launched by selecting the installed shortcuts.
BeveledLabel=Powered by Ubrixy Technologies

[Files]
Source: "..\build\api\*";        DestDir: "{app}\Api";     Flags: recursesubdirs createallsubdirs ignoreversion
; test-db.ps1 is needed BEFORE the install phase begins (the Database wizard page calls it
; via the Test connection button). Inno's normal [Files] extraction happens during install,
; not during the wizard, so we tag it `dontcopy` and extract it on demand from Pascal via
; ExtractTemporaryFile('test-db.ps1').
Source: "scripts\test-db.ps1";   DestDir: "{tmp}";         Flags: dontcopy
; post-install.ps1 + sql-prep.ps1 run DURING the install via [Run]. They sit alongside each
; other so post-install.ps1 can dot-source / Start-Process its sibling sql-prep.ps1.
Source: "scripts\post-install.ps1"; DestDir: "{tmp}";      Flags: deleteafterinstall
Source: "scripts\sql-prep.ps1";     DestDir: "{tmp}";      Flags: deleteafterinstall
; Optional - the .NET 10 Hosting Bundle. build.ps1 downloads into installer\redist\ and
; renames to "dotnet-hosting.exe" (fixed name so Inno [Files] doesn't need wildcards).
; If absent the installer skips the runtime install step and assumes the operator already
; has the runtime installed; NeedsHostingBundle() reports either way.
Source: "redist\dotnet-hosting.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall skipifsourcedoesntexist; Check: NeedsHostingBundle

[Dirs]
; Logs directory - the API writes Serilog files here. Service runs as LocalSystem, so the
; service account already has write access; we still pre-create with explicit permissions so
; the install state is self-documenting.
Name: "{app}\Logs"; Permissions: users-modify

[Run]
; 1) Install .NET 10 Hosting Bundle if it wasn't detected on PATH.
Filename: "{tmp}\dotnet-hosting.exe"; Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing .NET 10 Hosting Bundle (this may take a minute)..."; \
    Flags: waituntilterminated; Check: NeedsHostingBundle and FileExists(ExpandConstant('{tmp}\dotnet-hosting.exe'))

; 2) Run the post-install state machine. Parameters come from a JSON file that Pascal
;    writes during ssInstall (see WriteParamsFile in [Code]). Why JSON-via-file instead of
;    command-line args:
;      - 15+ params with quotes/spaces is unworkable through cmd.exe + PS arg-parsing
;      - JSON survives the cmd/PS double-parse round-trip cleanly (we already had a bug
;        from this in 1.0.0-1.0.3)
;      - The state file (install-state.json under {app}) lets us read what step failed
;        from CurStepChanged so the wizard can tell the operator the truth
;    The post-install script handles: appsettings.json patch, sql-prep, firewall rule,
;    service register (with chosen identity), service start, init admin, shortcut.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\post-install.ps1"" -Step all -ParamsFile ""{tmp}\params.json"" -StateFile ""{app}\install-state.json"" -Progress"; \
    StatusMsg: "Configuring Jamaat (this may take 30-60 seconds)..."; \
    Flags: waituntilterminated; \
    WorkingDir: "{tmp}"

; 3) Open the app in the default browser as a post-install option (user can untick).
Filename: "{cmd}"; Parameters: "/c start http://{code:GetPublicHost}:{code:GetPort}/login"; \
    Description: "Open {#MyAppName} in your browser"; Flags: postinstall nowait runhidden skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden; RunOnceId: "StopJamaatApi"
Filename: "{sys}\sc.exe"; Parameters: "delete {#MyServiceName}"; Flags: runhidden; RunOnceId: "DeleteJamaatApi"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Jamaat API"""; Flags: runhidden; RunOnceId: "DropFwRule"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\Logs"

; ============================================================================
; Pascal scripting - custom pages and helper functions
; ============================================================================
[Code]
const
  // Visual style
  WIZ_HMARGIN = 10;
  ROW_GAP     = 8;

var
  // ---- Database page ----
  pgDb:           TWizardPage;
  edDbServer:     TNewEdit;
  edDbName:       TNewEdit;
  rbAuthWindows:  TNewRadioButton;
  rbAuthSql:      TNewRadioButton;
  edDbUser:       TNewEdit;
  edDbPassword:   TPasswordEdit;
  lbDbUser:       TNewStaticText;
  lbDbPassword:   TNewStaticText;
  btnTestDb:      TNewButton;
  lbDbResult:     TNewStaticText;

  // ---- Ports / hosting page ----
  pgPorts:        TWizardPage;
  edPort:         TNewEdit;
  edPublicHost:   TNewEdit;
  edCorsOrigins:  TMemo;

  // ---- Admin account page ----
  pgAdmin:        TWizardPage;
  edAdminName:    TNewEdit;
  edAdminEmail:   TNewEdit;
  edAdminPwd:     TPasswordEdit;
  edAdminPwd2:    TPasswordEdit;
  edTenantName:   TNewEdit;
  cbCurrency:     TNewComboBox;
  lbAdminError:   TNewStaticText;

  // ---- Service identity page (NEW in 2.0) ----
  // Wizard asks the operator which Windows account the JamaatApi service should run under.
  // Default = Virtual service account (NT SERVICE\JamaatApi) - least privilege, no password
  // to manage, auto-rotated. Custom domain account requires creds the operator types in.
  pgSvcId:           TWizardPage;
  rbSvcVirtual:      TNewRadioButton;
  rbSvcLocalSystem:  TNewRadioButton;
  rbSvcNetworkSvc:   TNewRadioButton;
  rbSvcCustom:       TNewRadioButton;
  rbSvcSqlLogin:     TNewRadioButton;
  edSvcAccount:      TNewEdit;
  edSvcPassword:     TPasswordEdit;
  lbSvcAccount:      TNewStaticText;
  lbSvcPassword:     TNewStaticText;
  lbSvcHelp:         TNewStaticText;

  // ---- Captured state ----
  gDbServer, gDbName, gDbUser, gDbPassword, gDbAuthMode: String;
  gPort: String; gPublicHost, gCorsOrigins: String;
  gAdminName, gAdminEmail, gAdminPassword: String;
  gTenantName, gBaseCurrency: String;
  // Service identity (one of: Virtual / LocalSystem / NetworkService / Custom / SqlLogin)
  gSvcIdType, gSvcAccount, gSvcPassword: String;

  gHostingBundleNeeded: Boolean;
  gHostingBundleChecked: Boolean;

// Forward declarations - Inno Pascal needs these because event handlers and helpers
// reference each other across the file and the page creators install the OnClick
// pointers before the body of those handlers appears in source order.
procedure ApplyAuthVisibility(); forward;
procedure AuthRadioClick(Sender: TObject); forward;
procedure TestDbClick(Sender: TObject); forward;
procedure ApplySvcIdVisibility(); forward;
procedure SvcIdRadioClick(Sender: TObject); forward;
function  IsValidPasswordRules(const S: String): Boolean; forward;
function  IsPortFree(const Port: String): Boolean; forward;
procedure WriteParamsFile(); forward;
function  Esc(const S: String): String; forward;

// -- Helper: trim a string -----------------------------------------------------
function StrTrim(const S: String): String;
begin
  Result := Trim(S);
end;

// -- Detect whether ASP.NET Core 10 runtime is already on the box -------------
// We shell out to `dotnet --list-runtimes` and look for "Microsoft.AspNetCore.App 10."
// The result drives whether we run the bundled hosting bundle in [Run].
function NeedsHostingBundle(): Boolean;
var
  ResultCode: Integer;
  OutputFile, TmpDir: String;
  OutputContent: AnsiString;  // LoadStringFromFile in Inno 6 takes AnsiString by var
begin
  if gHostingBundleChecked then begin
    Result := gHostingBundleNeeded;
    exit;
  end;
  gHostingBundleChecked := True;

  TmpDir := ExpandConstant('{tmp}');
  OutputFile := TmpDir + '\dotnet-runtimes.txt';

  // cmd /c so we can redirect stdout cleanly. We don't fail hard if dotnet is missing -
  // that just means we definitely need to install the bundle.
  if not Exec(ExpandConstant('{cmd}'), '/c dotnet --list-runtimes > "' + OutputFile + '" 2>&1',
              '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    gHostingBundleNeeded := True;
    Result := True;
    exit;
  end;

  if not LoadStringFromFile(OutputFile, OutputContent) then OutputContent := '';
  // Match "Microsoft.AspNetCore.App 10." anywhere in the listing. Pos works on both
  // String and AnsiString; we just have to be consistent about the haystack type.
  gHostingBundleNeeded := (Pos('Microsoft.AspNetCore.App 10.', String(OutputContent)) = 0);
  Result := gHostingBundleNeeded;
end;

// -- Validate port: must be a positive integer 1..65535 -----------------------
function IsValidPort(const S: String): Boolean;
var v: Integer;
begin
  v := StrToIntDef(S, -1);
  Result := (v >= 1) and (v <= 65535);
end;

// -- Validate email: cheap regex-y check (contains @ and a dot after) ---------
function LooksLikeEmail(const S: String): Boolean;
var atPos: Integer;
begin
  atPos := Pos('@', S);
  Result := (atPos > 1) and (atPos < Length(S)) and (Pos('.', Copy(S, atPos+1, MaxInt)) > 0);
end;

// =============================================================================
// PAGE 1: Database connection
// =============================================================================
procedure CreateDatabasePage();
var
  pg: TWizardPage;
  y: Integer;
  lbHelp: TNewStaticText;
begin
  pg := CreateCustomPage(wpSelectDir, 'Database connection',
    'Choose the SQL Server instance and credentials Jamaat will use.');
  pgDb := pg;

  y := 0;

  lbHelp := TNewStaticText.Create(pg);
  lbHelp.Parent := pg.Surface;
  lbHelp.Caption := 'You can use Windows authentication (recommended on a domain-joined server) or a SQL Server login. Click Test connection to verify before continuing.';
  lbHelp.AutoSize := False;
  lbHelp.WordWrap := True;
  lbHelp.Left := 0; lbHelp.Top := y; lbHelp.Width := pg.SurfaceWidth; lbHelp.Height := 36;
  y := y + 44;

  // Server
  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Server'; Left := 0; Top := y + 4; Width := 100; end;
  edDbServer := TNewEdit.Create(pg);
  edDbServer.Parent := pg.Surface;
  edDbServer.Left := 110; edDbServer.Top := y; edDbServer.Width := pg.SurfaceWidth - 110;
  edDbServer.Text := 'localhost';
  y := y + 28;

  // Database
  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Database'; Left := 0; Top := y + 4; Width := 100; end;
  edDbName := TNewEdit.Create(pg);
  edDbName.Parent := pg.Surface;
  edDbName.Left := 110; edDbName.Top := y; edDbName.Width := pg.SurfaceWidth - 110;
  edDbName.Text := 'JAMAAT';
  y := y + 28;

  // Auth radios
  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Authentication'; Left := 0; Top := y + 4; Width := 100; end;
  rbAuthWindows := TNewRadioButton.Create(pg);
  rbAuthWindows.Parent := pg.Surface;
  rbAuthWindows.Caption := 'Windows';
  rbAuthWindows.Left := 110; rbAuthWindows.Top := y; rbAuthWindows.Width := 100;
  rbAuthWindows.Checked := True;

  rbAuthSql := TNewRadioButton.Create(pg);
  rbAuthSql.Parent := pg.Surface;
  rbAuthSql.Caption := 'SQL Server login';
  rbAuthSql.Left := 220; rbAuthSql.Top := y; rbAuthSql.Width := 200;
  y := y + 28;

  // User / password (hidden when Windows auth)
  lbDbUser := TNewStaticText.Create(pg);
  lbDbUser.Parent := pg.Surface; lbDbUser.Caption := 'User'; lbDbUser.Left := 0; lbDbUser.Top := y + 4; lbDbUser.Width := 100;
  edDbUser := TNewEdit.Create(pg);
  edDbUser.Parent := pg.Surface;
  edDbUser.Left := 110; edDbUser.Top := y; edDbUser.Width := pg.SurfaceWidth - 110;
  y := y + 28;

  lbDbPassword := TNewStaticText.Create(pg);
  lbDbPassword.Parent := pg.Surface; lbDbPassword.Caption := 'Password'; lbDbPassword.Left := 0; lbDbPassword.Top := y + 4; lbDbPassword.Width := 100;
  edDbPassword := TPasswordEdit.Create(pg);
  edDbPassword.Parent := pg.Surface;
  edDbPassword.Left := 110; edDbPassword.Top := y; edDbPassword.Width := pg.SurfaceWidth - 110;
  y := y + 36;

  // Test button + result
  btnTestDb := TNewButton.Create(pg);
  btnTestDb.Parent := pg.Surface;
  btnTestDb.Caption := 'Test connection';
  btnTestDb.Left := 0; btnTestDb.Top := y; btnTestDb.Width := 140; btnTestDb.Height := 26;
  btnTestDb.OnClick := @TestDbClick;

  lbDbResult := TNewStaticText.Create(pg);
  lbDbResult.Parent := pg.Surface;
  lbDbResult.Caption := '';
  lbDbResult.AutoSize := False;
  lbDbResult.WordWrap := True;
  lbDbResult.Left := 150; lbDbResult.Top := y; lbDbResult.Width := pg.SurfaceWidth - 150; lbDbResult.Height := 60;

  // Initial state: hide SQL credential fields since Windows is default.
  ApplyAuthVisibility();

  rbAuthWindows.OnClick := @AuthRadioClick;
  rbAuthSql.OnClick := @AuthRadioClick;
end;

// Show/hide SQL user+password fields based on auth radio state.
procedure ApplyAuthVisibility();
var sqlMode: Boolean;
begin
  sqlMode := rbAuthSql.Checked;
  lbDbUser.Visible := sqlMode;
  edDbUser.Visible := sqlMode;
  lbDbPassword.Visible := sqlMode;
  edDbPassword.Visible := sqlMode;
end;

procedure AuthRadioClick(Sender: TObject);
begin
  ApplyAuthVisibility();
end;

// "Test connection" - shells out to scripts\test-db.ps1. The script is tagged `dontcopy`
// in [Files] so Inno doesn't extract it during install (the wizard runs BEFORE that phase).
// We extract it on demand here via ExtractTemporaryFile, then invoke PowerShell against
// the path. ExtractTemporaryFile is idempotent - safe to call on every click.
procedure TestDbClick(Sender: TObject);
var
  ResultCode: Integer;
  OutputFile, AuthMode, Cmd, ScriptPath: String;
  Output: AnsiString;  // LoadStringFromFile var-param type
begin
  lbDbResult.Caption := 'Testing...';
  lbDbResult.Font.Color := clNavy;

  // Extract the script the first time the button is clicked. Cheap on subsequent clicks -
  // ExtractTemporaryFile no-ops once the file is already in {tmp}.
  try
    ExtractTemporaryFile('test-db.ps1');
  except
    lbDbResult.Caption := 'Failed to extract test-db.ps1 from the installer payload.';
    lbDbResult.Font.Color := clRed;
    exit;
  end;
  ScriptPath := ExpandConstant('{tmp}\test-db.ps1');

  if rbAuthWindows.Checked then AuthMode := 'Windows' else AuthMode := 'Sql';
  OutputFile := ExpandConstant('{tmp}\db-test-result.txt');

  // Quote everything that might contain a space. PowerShell parses these as positional/named.
  Cmd := '/c powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath + '"' +
         ' -Server "' + edDbServer.Text + '"' +
         ' -Database "' + edDbName.Text + '"' +
         ' -AuthMode ' + AuthMode +
         ' -User "' + edDbUser.Text + '"' +
         ' -Password "' + edDbPassword.Text + '"' +
         ' > "' + OutputFile + '" 2>&1';

  if not Exec(ExpandConstant('{cmd}'), Cmd, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    lbDbResult.Caption := 'Failed to invoke PowerShell. Is it on PATH?';
    lbDbResult.Font.Color := clRed;
    exit;
  end;

  Output := '';
  LoadStringFromFile(OutputFile, Output);
  // Convert once to wide String for the rest of this procedure - simplifies type rules.
  Cmd := Trim(String(Output));  // reusing Cmd as a scratch wide-string

  if (ResultCode = 0) and (Pos('OK', Cmd) = 1) then begin
    lbDbResult.Caption := 'Connected. ' + Copy(Cmd, 4, MaxInt);
    lbDbResult.Font.Color := clGreen;
  end else begin
    if Pos('FAIL', Cmd) = 1 then
      lbDbResult.Caption := 'Failed: ' + Copy(Cmd, 6, MaxInt)
    else
      lbDbResult.Caption := 'Failed: ' + Cmd;
    lbDbResult.Font.Color := clRed;
  end;
end;

// =============================================================================
// PAGE 1.5: Service Identity (NEW in 2.0)
// =============================================================================
// The JamaatApi Windows Service has to run as SOMEONE - that account is the SQL principal
// that authenticates to the database (when using Windows auth) and the file-system identity
// that owns log files etc. Wrong choice = service starts but immediately crashes on its
// first SQL query. We make the operator pick explicitly with sensible defaults + help text.
procedure CreateServiceIdentityPage();
var
  pg: TWizardPage;
  y: Integer;
begin
  pg := CreateCustomPage(pgDb.ID, 'Service identity',
    'Choose which Windows account the JamaatApi service will run as.');
  pgSvcId := pg;

  y := 0;

  lbSvcHelp := TNewStaticText.Create(pg);
  lbSvcHelp.Parent := pg.Surface;
  lbSvcHelp.AutoSize := False; lbSvcHelp.WordWrap := True;
  lbSvcHelp.Caption := 'The service identity is the SQL Server principal Jamaat will authenticate as. The installer will grant this principal access to the database during install.';
  lbSvcHelp.Left := 0; lbSvcHelp.Top := y; lbSvcHelp.Width := pg.SurfaceWidth; lbSvcHelp.Height := 36;
  y := y + 44;

  // Virtual service account (recommended)
  rbSvcVirtual := TNewRadioButton.Create(pg);
  rbSvcVirtual.Parent := pg.Surface;
  rbSvcVirtual.Caption := 'Virtual service account "NT SERVICE\JamaatApi"  (recommended)';
  rbSvcVirtual.Left := 0; rbSvcVirtual.Top := y; rbSvcVirtual.Width := pg.SurfaceWidth;
  rbSvcVirtual.Checked := True;
  y := y + 22;
  with TNewStaticText.Create(pg) do begin
    Parent := pg.Surface;
    Caption := '   Auto-managed, no password to maintain, least privilege.';
    Left := 0; Top := y; Width := pg.SurfaceWidth; Font.Color := clGray;
  end;
  y := y + 22;

  rbSvcLocalSystem := TNewRadioButton.Create(pg);
  rbSvcLocalSystem.Parent := pg.Surface;
  rbSvcLocalSystem.Caption := 'Local System  (NT AUTHORITY\SYSTEM)';
  rbSvcLocalSystem.Left := 0; rbSvcLocalSystem.Top := y; rbSvcLocalSystem.Width := pg.SurfaceWidth;
  y := y + 22;
  with TNewStaticText.Create(pg) do begin
    Parent := pg.Surface;
    Caption := '   Highest privilege; common on developer machines and small servers.';
    Left := 0; Top := y; Width := pg.SurfaceWidth; Font.Color := clGray;
  end;
  y := y + 22;

  rbSvcNetworkSvc := TNewRadioButton.Create(pg);
  rbSvcNetworkSvc.Parent := pg.Surface;
  rbSvcNetworkSvc.Caption := 'Network Service  (NT AUTHORITY\NETWORK SERVICE)';
  rbSvcNetworkSvc.Left := 0; rbSvcNetworkSvc.Top := y; rbSvcNetworkSvc.Width := pg.SurfaceWidth;
  y := y + 22;
  with TNewStaticText.Create(pg) do begin
    Parent := pg.Surface;
    Caption := '   Lower privilege than LocalSystem; useful on shared SQL servers.';
    Left := 0; Top := y; Width := pg.SurfaceWidth; Font.Color := clGray;
  end;
  y := y + 22;

  rbSvcCustom := TNewRadioButton.Create(pg);
  rbSvcCustom.Parent := pg.Surface;
  rbSvcCustom.Caption := 'Custom Windows account (DOMAIN\user)';
  rbSvcCustom.Left := 0; rbSvcCustom.Top := y; rbSvcCustom.Width := pg.SurfaceWidth;
  y := y + 22;

  rbSvcSqlLogin := TNewRadioButton.Create(pg);
  rbSvcSqlLogin.Parent := pg.Surface;
  rbSvcSqlLogin.Caption := 'SQL Server login  (service runs as LocalSystem; API uses this SQL login)';
  rbSvcSqlLogin.Left := 0; rbSvcSqlLogin.Top := y; rbSvcSqlLogin.Width := pg.SurfaceWidth;
  y := y + 28;

  // Account + password fields (visible only for Custom or SqlLogin).
  lbSvcAccount := TNewStaticText.Create(pg);
  lbSvcAccount.Parent := pg.Surface;
  lbSvcAccount.Caption := 'Account / Login';
  lbSvcAccount.Left := 0; lbSvcAccount.Top := y + 4; lbSvcAccount.Width := 100;

  edSvcAccount := TNewEdit.Create(pg);
  edSvcAccount.Parent := pg.Surface;
  edSvcAccount.Left := 110; edSvcAccount.Top := y; edSvcAccount.Width := pg.SurfaceWidth - 110;
  y := y + 28;

  lbSvcPassword := TNewStaticText.Create(pg);
  lbSvcPassword.Parent := pg.Surface;
  lbSvcPassword.Caption := 'Password';
  lbSvcPassword.Left := 0; lbSvcPassword.Top := y + 4; lbSvcPassword.Width := 100;

  edSvcPassword := TPasswordEdit.Create(pg);
  edSvcPassword.Parent := pg.Surface;
  edSvcPassword.Left := 110; edSvcPassword.Top := y; edSvcPassword.Width := pg.SurfaceWidth - 110;

  rbSvcVirtual.OnClick     := @SvcIdRadioClick;
  rbSvcLocalSystem.OnClick := @SvcIdRadioClick;
  rbSvcNetworkSvc.OnClick  := @SvcIdRadioClick;
  rbSvcCustom.OnClick      := @SvcIdRadioClick;
  rbSvcSqlLogin.OnClick    := @SvcIdRadioClick;
  ApplySvcIdVisibility();
end;

procedure ApplySvcIdVisibility();
var needsCreds: Boolean;
begin
  needsCreds := rbSvcCustom.Checked or rbSvcSqlLogin.Checked;
  lbSvcAccount.Visible := needsCreds;
  edSvcAccount.Visible := needsCreds;
  lbSvcPassword.Visible := needsCreds;
  edSvcPassword.Visible := needsCreds;
  if rbSvcCustom.Checked then begin
    lbSvcAccount.Caption := 'Account';
  end else if rbSvcSqlLogin.Checked then begin
    lbSvcAccount.Caption := 'SQL Login';
  end;
end;

procedure SvcIdRadioClick(Sender: TObject);
begin
  ApplySvcIdVisibility();
end;

// -- Password validation: enforce ASP.NET Identity defaults ------------------
// builder.Services.AddIdentityCore: RequiredLength=8, RequireNonAlphanumeric=false,
// RequireDigit=true, RequireLowercase=true, RequireUppercase=true (defaults).
function IsValidPasswordRules(const S: String): Boolean;
var i: Integer; hasLower, hasUpper, hasDigit: Boolean;
begin
  Result := False;
  if Length(S) < 8 then exit;
  hasLower := False; hasUpper := False; hasDigit := False;
  for i := 1 to Length(S) do begin
    if (S[i] >= 'a') and (S[i] <= 'z') then hasLower := True
    else if (S[i] >= 'A') and (S[i] <= 'Z') then hasUpper := True
    else if (S[i] >= '0') and (S[i] <= '9') then hasDigit := True;
  end;
  Result := hasLower and hasUpper and hasDigit;
end;

// -- Port-free check via netstat. Cheap and works on every Windows version ---
function IsPortFree(const Port: String): Boolean;
var
  ResultCode: Integer;
  OutputFile: String;
  Output: AnsiString;
begin
  OutputFile := ExpandConstant('{tmp}\netstat.txt');
  // 'netstat -ano' shows local-port + state. We look for ":<port> " followed by LISTENING.
  if not Exec(ExpandConstant('{cmd}'), '/c netstat -ano > "' + OutputFile + '"',
              '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    Result := True;  // can't check, don't block
    exit;
  end;
  if not LoadStringFromFile(OutputFile, Output) then begin
    Result := True;
    exit;
  end;
  Result := Pos(':' + Port + ' ', String(Output)) = 0;
end;

// -- Write params.json from the captured wizard state ------------------------
// Called from CurStepChanged(ssInstall). post-install.ps1 reads this file.
procedure WriteParamsFile();
var
  jsonPath, json, corsEsc: String;
begin
  jsonPath := ExpandConstant('{tmp}\params.json');
  // Build JSON manually - small, no external deps. We escape backslash + double-quote +
  // newlines in CORS origins via StringChange (Pascal).
  corsEsc := gCorsOrigins;
  StringChangeEx(corsEsc, '\', '\\', True);
  StringChangeEx(corsEsc, '"', '\"', True);
  StringChangeEx(corsEsc, #13#10, '\n', True);
  StringChangeEx(corsEsc, #13, '\n', True);
  StringChangeEx(corsEsc, #10, '\n', True);

  json :=
    '{' + #13#10 +
    '  "AppDir": "' + Esc(ExpandConstant('{app}')) + '",' + #13#10 +
    '  "DbServer": "' + Esc(gDbServer) + '",' + #13#10 +
    '  "DbDatabase": "' + Esc(gDbName) + '",' + #13#10 +
    '  "OperatorAuth": "' + gDbAuthMode + '",' + #13#10 +
    '  "OperatorUser": "' + Esc(gDbUser) + '",' + #13#10 +
    '  "OperatorPassword": "' + Esc(gDbPassword) + '",' + #13#10 +
    '  "ServiceIdentityType": "' + gSvcIdType + '",' + #13#10 +
    '  "ServiceAccount": "' + Esc(gSvcAccount) + '",' + #13#10 +
    '  "ServicePassword": "' + Esc(gSvcPassword) + '",' + #13#10 +
    '  "Port": ' + gPort + ',' + #13#10 +
    '  "PublicHost": "' + Esc(gPublicHost) + '",' + #13#10 +
    '  "CorsOrigins": "' + corsEsc + '",' + #13#10 +
    '  "AdminFullName": "' + Esc(gAdminName) + '",' + #13#10 +
    '  "AdminEmail": "' + Esc(gAdminEmail) + '",' + #13#10 +
    '  "AdminPassword": "' + Esc(gAdminPassword) + '",' + #13#10 +
    '  "TenantName": "' + Esc(gTenantName) + '",' + #13#10 +
    '  "BaseCurrency": "' + gBaseCurrency + '"' + #13#10 +
    '}';

  SaveStringToFile(jsonPath, json, False);
end;

// JSON-escape a Pascal string (backslash, double-quote, control chars).
function Esc(const S: String): String;
var s2: String;
begin
  s2 := S;
  StringChangeEx(s2, '\', '\\', True);
  StringChangeEx(s2, '"', '\"', True);
  StringChangeEx(s2, #13#10, '\n', True);
  StringChangeEx(s2, #13, '\n', True);
  StringChangeEx(s2, #10, '\n', True);
  StringChangeEx(s2, #9, '\t', True);
  Result := s2;
end;

// =============================================================================
// PAGE 2: Ports & hosting
// =============================================================================
procedure CreatePortsPage();
var
  pg: TWizardPage;
  y: Integer;
  lbHelp: TNewStaticText;
begin
  pg := CreateCustomPage(pgDb.ID, 'Ports and hosting',
    'Configure the network port the API listens on and the public hostname.');
  pgPorts := pg;

  y := 0;
  lbHelp := TNewStaticText.Create(pg);
  lbHelp.Parent := pg.Surface;
  lbHelp.Caption := 'Jamaat runs as a single Windows Service that serves both the API and the web UI on one port. The firewall rule will be opened automatically for the chosen port.';
  lbHelp.AutoSize := False; lbHelp.WordWrap := True;
  lbHelp.Left := 0; lbHelp.Top := y; lbHelp.Width := pg.SurfaceWidth; lbHelp.Height := 50;
  y := y + 56;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'HTTP Port'; Left := 0; Top := y + 4; Width := 130; end;
  edPort := TNewEdit.Create(pg);
  edPort.Parent := pg.Surface;
  edPort.Left := 140; edPort.Top := y; edPort.Width := 100;
  edPort.Text := '5174';
  y := y + 28;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Public hostname'; Left := 0; Top := y + 4; Width := 130; end;
  edPublicHost := TNewEdit.Create(pg);
  edPublicHost.Parent := pg.Surface;
  edPublicHost.Left := 140; edPublicHost.Top := y; edPublicHost.Width := pg.SurfaceWidth - 140;
  edPublicHost.Text := 'localhost';
  y := y + 36;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Additional CORS origins (one per line, optional):'; Left := 0; Top := y; Width := pg.SurfaceWidth; end;
  y := y + 18;
  edCorsOrigins := TMemo.Create(pg);
  edCorsOrigins.Parent := pg.Surface;
  edCorsOrigins.Left := 0; edCorsOrigins.Top := y; edCorsOrigins.Width := pg.SurfaceWidth; edCorsOrigins.Height := 80;
  edCorsOrigins.ScrollBars := ssVertical;
end;

// =============================================================================
// PAGE 3: Admin account
// =============================================================================
procedure CreateAdminPage();
var
  pg: TWizardPage;
  y: Integer;
begin
  pg := CreateCustomPage(pgPorts.ID, 'Administrator account',
    'Set the first administrator. You will use this to sign in after install.');
  pgAdmin := pg;

  y := 0;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Full name'; Left := 0; Top := y + 4; Width := 120; end;
  edAdminName := TNewEdit.Create(pg);
  edAdminName.Parent := pg.Surface;
  edAdminName.Left := 130; edAdminName.Top := y; edAdminName.Width := pg.SurfaceWidth - 130;
  edAdminName.Text := 'System Administrator';
  y := y + 28;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Email'; Left := 0; Top := y + 4; Width := 120; end;
  edAdminEmail := TNewEdit.Create(pg);
  edAdminEmail.Parent := pg.Surface;
  edAdminEmail.Left := 130; edAdminEmail.Top := y; edAdminEmail.Width := pg.SurfaceWidth - 130;
  y := y + 28;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Password'; Left := 0; Top := y + 4; Width := 120; end;
  edAdminPwd := TPasswordEdit.Create(pg);
  edAdminPwd.Parent := pg.Surface;
  edAdminPwd.Left := 130; edAdminPwd.Top := y; edAdminPwd.Width := pg.SurfaceWidth - 130;
  y := y + 28;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Confirm password'; Left := 0; Top := y + 4; Width := 120; end;
  edAdminPwd2 := TPasswordEdit.Create(pg);
  edAdminPwd2.Parent := pg.Surface;
  edAdminPwd2.Left := 130; edAdminPwd2.Top := y; edAdminPwd2.Width := pg.SurfaceWidth - 130;
  y := y + 36;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Jamaat name'; Left := 0; Top := y + 4; Width := 120; end;
  edTenantName := TNewEdit.Create(pg);
  edTenantName.Parent := pg.Surface;
  edTenantName.Left := 130; edTenantName.Top := y; edTenantName.Width := pg.SurfaceWidth - 130;
  edTenantName.Text := 'Default Jamaat';
  y := y + 28;

  with TNewStaticText.Create(pg) do begin Parent := pg.Surface; Caption := 'Base currency'; Left := 0; Top := y + 4; Width := 120; end;
  cbCurrency := TNewComboBox.Create(pg);
  cbCurrency.Parent := pg.Surface;
  cbCurrency.Left := 130; cbCurrency.Top := y; cbCurrency.Width := 120;
  cbCurrency.Style := csDropDownList;
  cbCurrency.Items.Add('AED');
  cbCurrency.Items.Add('INR');
  cbCurrency.Items.Add('USD');
  cbCurrency.Items.Add('GBP');
  cbCurrency.Items.Add('PKR');
  cbCurrency.Items.Add('KWD');
  cbCurrency.Items.Add('SAR');
  cbCurrency.ItemIndex := 0;
  y := y + 36;

  lbAdminError := TNewStaticText.Create(pg);
  lbAdminError.Parent := pg.Surface;
  lbAdminError.Caption := '';
  lbAdminError.AutoSize := False; lbAdminError.WordWrap := True;
  lbAdminError.Left := 0; lbAdminError.Top := y; lbAdminError.Width := pg.SurfaceWidth; lbAdminError.Height := 40;
  lbAdminError.Font.Color := clRed;
end;

// =============================================================================
// Page validation - hooked via NextButtonClick
// =============================================================================
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = pgDb.ID then begin
    if StrTrim(edDbServer.Text) = '' then begin
      MsgBox('Database server is required.', mbError, MB_OK); Result := False; exit;
    end;
    if StrTrim(edDbName.Text) = '' then begin
      MsgBox('Database name is required.', mbError, MB_OK); Result := False; exit;
    end;
    if rbAuthSql.Checked and (StrTrim(edDbUser.Text) = '') then begin
      MsgBox('SQL authentication selected but no username supplied.', mbError, MB_OK); Result := False; exit;
    end;
    gDbServer := edDbServer.Text;
    gDbName := edDbName.Text;
    if rbAuthWindows.Checked then gDbAuthMode := 'Windows' else gDbAuthMode := 'Sql';
    gDbUser := edDbUser.Text;
    gDbPassword := edDbPassword.Text;
  end
  else if CurPageID = pgSvcId.ID then begin
    if rbSvcVirtual.Checked then begin
      gSvcIdType := 'Virtual'; gSvcAccount := ''; gSvcPassword := '';
    end else if rbSvcLocalSystem.Checked then begin
      gSvcIdType := 'LocalSystem'; gSvcAccount := ''; gSvcPassword := '';
    end else if rbSvcNetworkSvc.Checked then begin
      gSvcIdType := 'NetworkService'; gSvcAccount := ''; gSvcPassword := '';
    end else if rbSvcCustom.Checked then begin
      if StrTrim(edSvcAccount.Text) = '' then begin
        MsgBox('Custom Windows account requires an account name (DOMAIN\user).', mbError, MB_OK); Result := False; exit;
      end;
      if StrTrim(edSvcPassword.Text) = '' then begin
        MsgBox('Custom Windows account requires a password.', mbError, MB_OK); Result := False; exit;
      end;
      if Pos('\', edSvcAccount.Text) = 0 then begin
        MsgBox('Account must be in DOMAIN\user form (use ".\user" for a local account).', mbError, MB_OK);
        Result := False; exit;
      end;
      gSvcIdType := 'Custom';
      gSvcAccount := StrTrim(edSvcAccount.Text);
      gSvcPassword := edSvcPassword.Text;
    end else if rbSvcSqlLogin.Checked then begin
      if StrTrim(edSvcAccount.Text) = '' then begin
        MsgBox('SQL login name is required.', mbError, MB_OK); Result := False; exit;
      end;
      if StrTrim(edSvcPassword.Text) = '' then begin
        MsgBox('SQL login password is required.', mbError, MB_OK); Result := False; exit;
      end;
      gSvcIdType := 'SqlLogin';
      gSvcAccount := StrTrim(edSvcAccount.Text);
      gSvcPassword := edSvcPassword.Text;
    end;
  end
  else if CurPageID = pgPorts.ID then begin
    if not IsValidPort(StrTrim(edPort.Text)) then begin
      MsgBox('Port must be a number between 1 and 65535.', mbError, MB_OK); Result := False; exit;
    end;
    if not IsPortFree(StrTrim(edPort.Text)) then begin
      if MsgBox('Port ' + StrTrim(edPort.Text) + ' appears to be in use already. The service install will fail when it tries to bind. Continue anyway?', mbConfirmation, MB_YESNO) = IDNO then begin
        Result := False; exit;
      end;
    end;
    if StrTrim(edPublicHost.Text) = '' then begin
      MsgBox('Public hostname is required (use "localhost" for local-only installs).', mbError, MB_OK);
      Result := False; exit;
    end;
    gPort := StrTrim(edPort.Text);
    gPublicHost := StrTrim(edPublicHost.Text);
    gCorsOrigins := edCorsOrigins.Text;
  end
  else if CurPageID = pgAdmin.ID then begin
    lbAdminError.Caption := '';
    if StrTrim(edAdminName.Text) = '' then begin lbAdminError.Caption := 'Full name is required.'; Result := False; exit; end;
    if not LooksLikeEmail(StrTrim(edAdminEmail.Text)) then begin lbAdminError.Caption := 'A valid email is required.'; Result := False; exit; end;
    // ASP.NET Identity defaults: 8+ chars, at least one upper + lower + digit. Reject early
    // so the install doesn't silently fail to seed the admin user later.
    if not IsValidPasswordRules(edAdminPwd.Text) then begin
      lbAdminError.Caption := 'Password must be 8+ chars with at least one uppercase, lowercase, and digit.';
      Result := False; exit;
    end;
    if edAdminPwd.Text <> edAdminPwd2.Text then begin lbAdminError.Caption := 'Passwords do not match.'; Result := False; exit; end;
    if StrTrim(edTenantName.Text) = '' then begin lbAdminError.Caption := 'Jamaat name is required.'; Result := False; exit; end;
    gAdminName := StrTrim(edAdminName.Text);
    gAdminEmail := LowerCase(StrTrim(edAdminEmail.Text));
    gAdminPassword := edAdminPwd.Text;
    gTenantName := StrTrim(edTenantName.Text);
    gBaseCurrency := cbCurrency.Items[cbCurrency.ItemIndex];
  end;
end;

// =============================================================================
// Wire pages into wizard
// =============================================================================
procedure InitializeWizard();
begin
  CreateDatabasePage();
  CreateServiceIdentityPage();  // NEW in 2.0
  CreatePortsPage();
  CreateAdminPage();
end;

// CurStepChanged hook - the install-phase orchestration. We use this to:
//   - ssInstall: write params.json before [Run] kicks off post-install.ps1
//   - ssPostInstall: read install-state.json and show the operator a clear message about
//     what step (if any) failed + where the log lives
procedure CurStepChanged(CurStep: TSetupStep);
var
  stateFile, stateContent: String;
  msg: String;
  stateAnsi: AnsiString;
begin
  if CurStep = ssInstall then begin
    // Make sure {app}\Logs exists for post-install transcript output
    ForceDirectories(ExpandConstant('{app}\Logs'));
    WriteParamsFile();
  end
  else if CurStep = ssPostInstall then begin
    stateFile := ExpandConstant('{app}\install-state.json');
    if FileExists(stateFile) then begin
      LoadStringFromFile(stateFile, stateAnsi);
      stateContent := String(stateAnsi);
      // Extremely cheap "did any step fail" check - look for "error" status string in the file.
      // The state file has per-step status like "patch-config":"ok" or "service-start":"error".
      if Pos('"error"', stateContent) > 0 then begin
        msg := 'Configuration completed with errors. Look at install-state.json under ' +
               ExpandConstant('{app}') + ' for details.' + #13#10 + #13#10 +
               'You can re-run the configuration without reinstalling by running, in elevated PowerShell:' + #13#10 +
               'powershell -NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\Api\..\install-recover.ps1" ' +
               '(or rerun the installer in repair mode).';
        MsgBox(msg, mbError, MB_OK);
      end;
    end;
  end;
end;

// =============================================================================
// Accessors used by [Run] / [Files] / [Setup] via {code:GetXxx}
// =============================================================================
function GetDbServer(Param: String): String;     begin Result := gDbServer; end;
function GetDbName(Param: String): String;       begin Result := gDbName; end;
function GetDbAuthMode(Param: String): String;   begin Result := gDbAuthMode; end;
function GetDbUser(Param: String): String;       begin Result := gDbUser; end;
function GetDbPassword(Param: String): String;   begin Result := gDbPassword; end;
function GetPort(Param: String): String;         begin Result := gPort; end;
function GetPublicHost(Param: String): String;   begin Result := gPublicHost; end;
function GetCorsOrigins(Param: String): String;
var s: String;
begin
  // Memo control returns embedded CR/LF which would break the PowerShell command line.
  // Replace newlines with commas; post-install.ps1 handles either.
  s := gCorsOrigins;
  StringChangeEx(s, #13#10, ',', True);
  StringChangeEx(s, #13, ',', True);
  StringChangeEx(s, #10, ',', True);
  Result := s;
end;
function GetAdminName(Param: String): String;     begin Result := gAdminName; end;
function GetAdminEmail(Param: String): String;    begin Result := gAdminEmail; end;
function GetAdminPassword(Param: String): String; begin Result := gAdminPassword; end;
function GetTenantName(Param: String): String;    begin Result := gTenantName; end;
function GetBaseCurrency(Param: String): String;  begin Result := gBaseCurrency; end;
