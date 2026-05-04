using System.Text;
using Asp.Versioning;
using Jamaat.Api.Auth;
using Jamaat.Api.Middleware;
using Jamaat.Domain.Abstractions;
using Jamaat.Infrastructure;
using Jamaat.Infrastructure.Persistence.Seed;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Exceptions;

var builder = WebApplication.CreateBuilder(args);

// ---- Windows Service host -------------------------------------------------
// Required when the API is registered as a Windows Service (the production install via
// Inno Setup does this). Without this call SCM's start-handshake never completes and
// `Start-Service JamaatApi` fails with "Cannot start service ... on computer '.'". When
// running interactively (dotnet run / Visual Studio), UseWindowsService() is a no-op.
builder.Host.UseWindowsService(o => o.ServiceName = "JamaatApi");

// ---- Serilog --------------------------------------------------------------
builder.Host.UseSerilog((ctx, sp, lc) => lc
    .ReadFrom.Configuration(ctx.Configuration)
    .ReadFrom.Services(sp)
    .Enrich.FromLogContext()
    .Enrich.WithEnvironmentName()
    .Enrich.WithThreadId()
    .Enrich.WithMachineName()
    .Enrich.WithExceptionDetails());

// ---- Infrastructure (DbContext, Identity, UoW, audit, tenant) -------------
builder.Services.AddJamaatInfrastructure(builder.Configuration);

// ---- Current user (API-layer ICurrentUser) --------------------------------
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();

// ---- JWT auth -------------------------------------------------------------
var jwt = builder.Configuration.GetSection("Jwt");
var jwtKey = jwt["Key"] ?? throw new InvalidOperationException("Jwt:Key missing.");
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt["Issuer"],
            ValidAudience = jwt["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromMinutes(1),
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddSingleton<Microsoft.AspNetCore.Authorization.IAuthorizationPolicyProvider, Jamaat.Api.Auth.PermissionPolicyProvider>();
builder.Services.AddSingleton<Microsoft.AspNetCore.Authorization.IAuthorizationHandler, Jamaat.Api.Auth.PermissionHandler>();

// ---- API versioning -------------------------------------------------------
builder.Services
    .AddApiVersioning(o =>
    {
        o.DefaultApiVersion = new ApiVersion(1, 0);
        o.AssumeDefaultVersionWhenUnspecified = true;
        o.ReportApiVersions = true;
        o.ApiVersionReader = new UrlSegmentApiVersionReader();
    })
    .AddApiExplorer(o =>
    {
        o.GroupNameFormat = "'v'VVV";
        o.SubstituteApiVersionInUrl = true;
    });

// ---- Controllers + OpenAPI (native .NET 10) -------------------------------
// Global UsageTrackingActionFilter emits a UsageEvent on every authenticated controller
// action invocation (analytics aggregations roll up from these rows). The filter is
// transient/per-request via DI - its dependencies are scoped (ITenantContext) and a
// singleton (IUsageEventQueue), so AddMvc resolves a fresh one per request.
builder.Services.AddControllers(o => o.Filters.Add<Jamaat.Api.Filters.UsageTrackingActionFilter>());
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// ---- Health checks --------------------------------------------------------
var connectionString = builder.Configuration.GetConnectionString("Default");
var healthBuilder = builder.Services.AddHealthChecks();
if (!string.IsNullOrWhiteSpace(connectionString))
    healthBuilder.AddSqlServer(connectionString, name: "sql", tags: ["ready"]);

// ---- Forwarded headers ----------------------------------------------------
// Production deployments typically sit behind a reverse proxy (nginx, IIS, ALB, Cloudflare).
// Without this, HttpContext.Connection.RemoteIpAddress is the PROXY's IP - so login-history
// records the proxy instead of the real member, and MaxMind geolocation never has a useful
// IP to look up.
//
// Trust list is configurable via ForwardedHeaders:KnownProxies / KnownNetworks. In dev we
// trust loopback so a Vite dev-proxy or local nginx Just Works. In production, set
// ForwardedHeaders:KnownProxies to your proxy's IP(s) - never leave KnownProxies empty in
// production or any client could spoof X-Forwarded-For.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Clear the defaults; we explicitly add what we trust.
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();

    var knownProxies = builder.Configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [];
    foreach (var p in knownProxies)
        if (System.Net.IPAddress.TryParse(p, out var ip)) o.KnownProxies.Add(ip);

    var knownNetworks = builder.Configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [];
    foreach (var n in knownNetworks)
    {
        var slash = n.IndexOf('/');
        if (slash > 0
            && System.Net.IPAddress.TryParse(n[..slash], out var prefix)
            && int.TryParse(n[(slash + 1)..], out var prefixLen))
        {
            o.KnownIPNetworks.Add(new System.Net.IPNetwork(prefix, prefixLen));
        }
    }

    // Dev fallback: trust the loopback range so X-Forwarded-For from the Vite proxy or a local
    // tunnel propagates without any extra config. Production deploys MUST set KnownProxies.
    if (builder.Environment.IsDevelopment() && knownProxies.Length == 0 && knownNetworks.Length == 0)
    {
        o.KnownIPNetworks.Add(new System.Net.IPNetwork(System.Net.IPAddress.Parse("127.0.0.0"), 8));
        o.KnownIPNetworks.Add(new System.Net.IPNetwork(System.Net.IPAddress.IPv6Loopback, 128));
    }
});

// ---- CORS (configurable origins) ------------------------------------------
const string CorsPolicy = "JamaatWeb";
builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

await DatabaseSeeder.SeedAsync(app.Services);

// ForwardedHeaders MUST run before everything that reads RemoteIpAddress (request logging,
// auth, audit). Order matters - this overwrites HttpContext.Connection.RemoteIpAddress with
// the original client IP from X-Forwarded-For when the request came through a trusted proxy.
app.UseForwardedHeaders();

app.UseSerilogRequestLogging();

app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<CorrelationIdMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors(CorsPolicy);

app.UseAuthentication();
app.UseMiddleware<TenantMiddleware>();
// Activity tracker runs AFTER auth so it can read the JWT principal but BEFORE the
// authorization gate (so we still record requests that get rejected with 403, since those
// are also signal). Cheap: two dict touches + an interlocked increment per request.
app.UseMiddleware<ActivityTrackerMiddleware>();
app.UseAuthorization();

app.MapControllers();

app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = r => r.Tags.Contains("ready")
});

// SPA static-file serving. When the React bundle has been copied into wwwroot/ (production
// install via install-gui.ps1), serve it from this same Kestrel process so there's a single
// origin for both UI and API calls — no CORS gymnastics, single port to open in the firewall,
// single Windows Service to install. Dev environments still run Vite separately on :5173 and
// don't have a populated wwwroot, so this block is a no-op there.
var wwwroot = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
if (Directory.Exists(wwwroot) && File.Exists(Path.Combine(wwwroot, "index.html")))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
    // SPA fallback: any non-API GET that didn't match a static file lands on index.html so
    // React Router can take over. Excludes /api and /health so those still 404 cleanly when
    // the path is wrong rather than silently rendering the SPA shell.
    app.MapFallbackToFile("index.html").Add(b =>
    {
        // No additional filtering needed — MapControllers + MapHealthChecks above are already
        // matched by the routing pipeline before the fallback runs.
    });
}

app.Run();

public partial class Program;
