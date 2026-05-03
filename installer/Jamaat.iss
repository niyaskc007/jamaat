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
#define MyAppPublisher   "Jamaat"
#define MyAppURL         "https://github.com/niyaskc007/jamaat"
#define MyAppId          "{{8C4A1E3B-2D14-4F7C-9F9B-1C8E45A3B2C1}"
#define MyServiceName    "JamaatApi"

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
VersionInfoDescription={#MyAppName} community management web app
ChangesEnvironment=no
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\build\api\*";        DestDir: "{app}\Api";     Flags: recursesubdirs createallsubdirs ignoreversion
Source: "scripts\test-db.ps1";   DestDir: "{tmp}";         Flags: deleteafterinstall
Source: "scripts\post-install.ps1"; DestDir: "{tmp}";      Flags: deleteafterinstall
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

; 2) Open the firewall for the chosen port (TCP) so the LAN can reach the app.
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Jamaat API"""; \
    Flags: runhidden; StatusMsg: "Removing previous firewall rule..."
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""Jamaat API"" dir=in action=allow protocol=TCP localport={code:GetPort}"; \
    Flags: runhidden; StatusMsg: "Opening firewall port {code:GetPort}..."

; 3) Hand off to PowerShell to write appsettings, register service, init admin.
;    Quoting is fiddly: each value goes through PowerShell's argument parser, so we wrap in
;    single quotes to disable expansion. CMD also gets a chance at it, so we use ^ escaping
;    on inner double-quotes by relying on PS to accept single-quoted strings.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\post-install.ps1"" -AppDir ""{app}"" -DbServer ""{code:GetDbServer}"" -DbDatabase ""{code:GetDbName}"" -DbAuthMode ""{code:GetDbAuthMode}"" -DbUser ""{code:GetDbUser}"" -DbPassword ""{code:GetDbPassword}"" -Port {code:GetPort} -PublicHost ""{code:GetPublicHost}"" -CorsOrigins ""{code:GetCorsOrigins}"" -AdminFullName ""{code:GetAdminName}"" -AdminEmail ""{code:GetAdminEmail}"" -AdminPassword ""{code:GetAdminPassword}"" -TenantName ""{code:GetTenantName}"" -BaseCurrency ""{code:GetBaseCurrency}"""; \
    StatusMsg: "Configuring Jamaat API and creating admin account..."; \
    Flags: waituntilterminated; \
    WorkingDir: "{tmp}"

; 4) Open the app in the default browser as a post-install option (user can untick).
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

  // ---- Captured state ----
  gDbServer, gDbName, gDbUser, gDbPassword, gDbAuthMode: String;
  gPort: String; gPublicHost, gCorsOrigins: String;
  gAdminName, gAdminEmail, gAdminPassword: String;
  gTenantName, gBaseCurrency: String;

  gHostingBundleNeeded: Boolean;
  gHostingBundleChecked: Boolean;

// Forward declarations - Inno Pascal needs these because event handlers and helpers
// reference each other across the file and the page creators install the OnClick
// pointers before the body of those handlers appears in source order.
procedure ApplyAuthVisibility(); forward;
procedure AuthRadioClick(Sender: TObject); forward;
procedure TestDbClick(Sender: TObject); forward;

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

// "Test connection" - shells out to scripts\test-db.ps1 (extracted to {tmp}).
procedure TestDbClick(Sender: TObject);
var
  ResultCode: Integer;
  OutputFile, AuthMode, Cmd: String;
  Output: AnsiString;  // LoadStringFromFile var-param type
begin
  lbDbResult.Caption := 'Testing...';
  lbDbResult.Font.Color := clNavy;

  if rbAuthWindows.Checked then AuthMode := 'Windows' else AuthMode := 'Sql';
  OutputFile := ExpandConstant('{tmp}\db-test-result.txt');

  // Quote everything that might contain a space. PowerShell parses these as positional/named.
  Cmd := '/c powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\test-db.ps1') + '"' +
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
  else if CurPageID = pgPorts.ID then begin
    if not IsValidPort(StrTrim(edPort.Text)) then begin
      MsgBox('Port must be a number between 1 and 65535.', mbError, MB_OK); Result := False; exit;
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
    if Length(edAdminPwd.Text) < 8 then begin lbAdminError.Caption := 'Password must be at least 8 characters.'; Result := False; exit; end;
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
  CreatePortsPage();
  CreateAdminPage();
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
