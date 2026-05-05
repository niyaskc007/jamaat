using System.Security.Claims;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.MultiTenancy;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Persistence.Seed;

/// Runs on API startup. Idempotent: safe to run repeatedly.
public static class DatabaseSeeder
{
    public static async Task SeedAsync(IServiceProvider sp, CancellationToken ct = default)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<JamaatDbContext>();
        var userMgr = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roleMgr = scope.ServiceProvider.GetRequiredService<RoleManager<ApplicationRole>>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Seeder");

        var defaultTenantId = Guid.Parse(config["MultiTenancy:DefaultTenantId"] ?? Guid.Empty.ToString());
        if (defaultTenantId == Guid.Empty)
        {
            logger.LogWarning("No DefaultTenantId configured. Skipping seed.");
            return;
        }

        // Ensure tenant-scoped queries see the default tenant during seeding, otherwise
        // the EF global query filter hides existing rows and upserts duplicate inserts.
        var tenantCtx = scope.ServiceProvider.GetRequiredService<TenantContext>();
        tenantCtx.SetTenant(defaultTenantId);

        await db.Database.MigrateAsync(ct);

        // --- Tenant ---------------------------------------------------------
        // Note: IgnoreQueryFilters needed because TenantContext won't be set here.
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == defaultTenantId, ct);
        if (tenant is null)
        {
            tenant = new Tenant(defaultTenantId, "DEFAULT", "Default Jamaat");
            db.Tenants.Add(tenant);
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded default tenant {TenantId}", defaultTenantId);
        }
        // Force base currency to AED (updates legacy INR default too)
        if (tenant.BaseCurrency != "AED")
        {
            typeof(Tenant).GetProperty(nameof(Tenant.BaseCurrency))!.SetValue(tenant, "AED");
            db.Tenants.Update(tenant);
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Tenant base currency set to AED.");
        }

        // --- Roles ----------------------------------------------------------
        // Phase H additions: DataEditor / DataValidator / EventCoordinator / EventVolunteer.
        // Per-role permission claims are seeded below in the persona section so the role -> claim
        // mapping stays in one place; admins remain free to add / remove via the UsersPage.
        var roles = new[]
        {
            ("Administrator", "Full access"),
            ("Accountant", "Manages receipts, vouchers, accounting"),
            ("Counter", "Issues receipts at counter"),
            ("Approver", "Approves vouchers and reversals"),
            ("Auditor", "Read-only access"),
            ("DataEditor", "Edits member data; submissions go through the verification queue"),
            ("DataValidator", "Reviews and approves member change requests; verifies data + photos"),
            ("EventCoordinator", "Plans and runs events; manages registrations and check-ins"),
            ("EventVolunteer", "Scans and check-ins members at events"),
            ("Member", "Member self-service - access only to own data via the member portal"),
        };
        foreach (var (name, desc) in roles)
        {
            if (await roleMgr.FindByNameAsync(name) is null)
            {
                await roleMgr.CreateAsync(new ApplicationRole { Name = name, Description = desc, TenantId = defaultTenantId });
            }
        }

        // SuperAdmin is system-scoped (TenantId = null). It is intentionally the only role
        // that grants the system.* permission set, which gates the cross-tenant System Monitor
        // page (server health, DB size, logs, tenant inventory). The first installer-driven
        // admin and the dev-mode auto-admin both get this role on top of Administrator.
        if (await roleMgr.FindByNameAsync("SuperAdmin") is null)
        {
            await roleMgr.CreateAsync(new ApplicationRole
            {
                Name = "SuperAdmin",
                Description = "System-scope administrator; can monitor the host, DB, logs, and all tenants.",
                TenantId = null,
            });
        }

        // --- Permission claims on Administrator role -----------------------
        var adminRole = await roleMgr.FindByNameAsync("Administrator");
        if (adminRole is not null)
        {
            var existingClaims = (await roleMgr.GetClaimsAsync(adminRole)).Where(c => c.Type == "permission").Select(c => c.Value).ToHashSet();
            foreach (var perm in AllPermissions)
            {
                if (!existingClaims.Contains(perm))
                    await roleMgr.AddClaimAsync(adminRole, new Claim("permission", perm));
            }
        }

        // --- Permission claims on SuperAdmin role --------------------------
        // SuperAdmin gets EVERY permission - the tenant-level ones plus system.*. So a
        // SuperAdmin can always step in and act as a tenant Administrator if needed without
        // having to also grant the Administrator role separately.
        var superAdminRole = await roleMgr.FindByNameAsync("SuperAdmin");
        if (superAdminRole is not null)
        {
            var existingSuper = (await roleMgr.GetClaimsAsync(superAdminRole)).Where(c => c.Type == "permission").Select(c => c.Value).ToHashSet();
            foreach (var perm in AllPermissions.Concat(SystemPermissions))
            {
                if (!existingSuper.Contains(perm))
                    await roleMgr.AddClaimAsync(superAdminRole, new Claim("permission", perm));
            }
        }

        // --- Permission claims on the new domain roles --------------------
        // Each of these mappings is additive only - we never strip claims an admin has
        // hand-added on top of the seed. So admins can extend a role and the next deploy
        // won't reset their tweaks.
        var rolePermissions = new (string Role, string[] Permissions)[]
        {
            ("DataEditor", new[]
            {
                "member.view", "family.view", "member.self.update", "member.changes.approve",
            }),
            ("DataValidator", new[]
            {
                "member.view", "family.view", "member.changes.approve", "member.verify",
                "member.reliability.view",
            }),
            ("EventCoordinator", new[]
            {
                "member.view", "family.view", "event.view", "event.manage", "event.scan",
                "reports.view",
            }),
            ("EventVolunteer", new[]
            {
                "member.view", "event.view", "event.scan",
            }),
            // Member self-service portal: scoped to OWN data; controllers must apply ownership
            // filters so a Member can never see anyone else's contributions / loans / events.
            ("Member", new[]
            {
                "portal.access",
                "portal.contributions.view.own",
                "portal.commitments.view.own",
                "portal.commitments.create.own",
                "portal.qh.view.own",
                "portal.qh.request",
                "portal.qh.endorse_guarantor",
                "portal.events.view",
                "portal.events.register",
                "portal.login_history.view.own",
                "member.self.update",
                "member.wealth.view",
            }),
        };
        foreach (var (roleName, perms) in rolePermissions)
        {
            var role = await roleMgr.FindByNameAsync(roleName);
            if (role is null) continue;
            var existing = (await roleMgr.GetClaimsAsync(role))
                .Where(c => c.Type == "permission")
                .Select(c => c.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var p in perms)
            {
                if (!existing.Contains(p))
                    await roleMgr.AddClaimAsync(role, new Claim("permission", p));
            }
        }

        // --- Admin user -----------------------------------------------------
        // When `Setup:UseWizard` is true (set by the one-click installer), skip auto-creating
        // the default admin. The first-run wizard at /setup creates it interactively from
        // operator-supplied credentials. Dev environments leave this flag false so the seed
        // continues to provision admin@jamaat.local / Admin@12345 the way it always has.
        var useWizard = config.GetValue<bool>("Setup:UseWizard");
        var adminEmail = config["Seed:AdminEmail"] ?? "admin@jamaat.local";
        var adminPassword = config["Seed:AdminPassword"] ?? "Admin@12345";

        if (useWizard)
        {
            logger.LogInformation("Setup:UseWizard=true — skipping seeded admin. First-run wizard will create one.");
            return;
        }

        var admin = await userMgr.FindByEmailAsync(adminEmail);
        if (admin is null)
        {
            admin = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = adminEmail,
                Email = adminEmail,
                FullName = "System Administrator",
                TenantId = defaultTenantId,
                EmailConfirmed = true,
                IsActive = true,
                IsLoginAllowed = true,
                MustChangePassword = false,
                PreferredLanguage = "en",
            };
            var createResult = await userMgr.CreateAsync(admin, adminPassword);
            if (!createResult.Succeeded)
            {
                logger.LogError("Failed to seed admin user: {Errors}",
                    string.Join("; ", createResult.Errors.Select(e => e.Description)));
                return;
            }
            await userMgr.AddToRoleAsync(admin, "Administrator");
            await userMgr.AddToRoleAsync(admin, "SuperAdmin");

            // Grant the admin user every permission claim as well (so JWT claims reflect it
            // directly). Includes system.* so the dev admin lands on the System Monitor too.
            foreach (var perm in AllPermissions.Concat(SystemPermissions))
                await userMgr.AddClaimAsync(admin, new Claim("permission", perm));

            logger.LogInformation("Seeded admin user {Email} with password '{Password}'", adminEmail, adminPassword);
        }
        else
        {
            // Admin already exists - idempotently reconcile role membership and permission
            // claims so that permissions / roles added in a later release flow to the existing
            // admin user. SuperAdmin was added in a later phase, so older installs need it
            // attached on next startup.
            if (!await userMgr.IsInRoleAsync(admin, "SuperAdmin"))
                await userMgr.AddToRoleAsync(admin, "SuperAdmin");

            var currentClaims = (await userMgr.GetClaimsAsync(admin))
                .Where(c => c.Type == "permission")
                .Select(c => c.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var added = 0;
            foreach (var perm in AllPermissions.Concat(SystemPermissions))
            {
                if (!currentClaims.Contains(perm))
                {
                    await userMgr.AddClaimAsync(admin, new Claim("permission", perm));
                    added++;
                }
            }
            if (added > 0) logger.LogInformation("Reconciled {Count} new permission claim(s) on admin user.", added);

            // Idempotent reconciliation of the new login flags for upgrades from older builds.
            if (!admin.IsLoginAllowed)
            {
                admin.IsLoginAllowed = true;
                await userMgr.UpdateAsync(admin);
            }

            // Reset the password on every boot to match Seed:AdminPassword. Reason: the
            // installer's reconfigure flow updates appsettings.json with whatever the operator
            // typed in the wizard, but the user record's password hash dates from the FIRST
            // install. Without this reconcile, an operator who reinstalls with a new password
            // gets locked out - the appsettings shows the new value, but the user record has
            // the old hash. (Real bug we just hit.) Only runs when Seed:AdminPassword is
            // configured AND honour-password is on (default true) - dev environments that
            // tweak the seed user's password via the admin UI can opt out via
            // `Seed:HonourPasswordReset = false` in appsettings.
            var honourReset = config.GetValue<bool>("Seed:HonourPasswordReset", true);
            if (honourReset && !string.IsNullOrEmpty(adminPassword))
            {
                var checkPwd = await userMgr.CheckPasswordAsync(admin, adminPassword);
                if (!checkPwd)
                {
                    logger.LogInformation(
                        "Seed:AdminPassword does not match the stored hash - resetting password for {Email} from configuration.",
                        adminEmail);
                    var token = await userMgr.GeneratePasswordResetTokenAsync(admin);
                    var resetResult = await userMgr.ResetPasswordAsync(admin, token, adminPassword);
                    if (!resetResult.Succeeded)
                    {
                        logger.LogError("Failed to reset admin password: {Errors}",
                            string.Join("; ", resetResult.Errors.Select(e => e.Description)));
                    }
                }
            }
        }

        await SeedCurrenciesAndRatesAsync(db, defaultTenantId, logger, ct);
        await SeedChartOfAccountsAsync(db, defaultTenantId, logger, ct);
        await SeedFundCategoriesAsync(db, defaultTenantId, logger, ct);
        await SeedFundTypesAsync(db, defaultTenantId, logger, ct);
        await SeedNumberingSeriesAsync(db, defaultTenantId, logger, ct);
        await SeedFinancialPeriodAsync(db, defaultTenantId, logger, ct);
        await SeedBankAndExpenseAsync(db, defaultTenantId, logger, ct);
        await SeedAgreementTemplateAsync(db, defaultTenantId, logger, ct);
        await SeedLookupsAsync(db, defaultTenantId, logger, ct);
        await EnsureEventCategoryLookupsAsync(db, defaultTenantId, logger, ct);
        await SeedSectorsAsync(db, defaultTenantId, logger, ct);
        await SeedOrganisationsAsync(db, defaultTenantId, logger, ct);
        await SeedCmsDefaultsAsync(db, logger, ct);
        await ReconcileAdminUserPermissionsAsync(userMgr, logger);
        await ReconcileUserTypesAsync(userMgr, logger);
        await SeedTestUsersAsync(userMgr, defaultTenantId, logger, config);

        // Dev-only bulk data generator - populates members/families/enrollments/commitments/events
        // so every screen has something to render. Off by default; enable via Seed:DevData=true.
        if (bool.TryParse(config["Seed:DevData"] ?? "false", out var devData) && devData)
        {
            await DevDataSeeder.SeedAsync(db, defaultTenantId, logger, ct);
            await DevDataSeeder.SeedReceiptsAsync(scope.ServiceProvider, defaultTenantId, logger, ct);
            await DevDataSeeder.EnrichDevDataAsync(scope.ServiceProvider, defaultTenantId, logger, ct);
        }

        // Phase A6: backfill - every Member without an ApplicationUser gets one provisioned (with
        // IsLoginAllowed=false). Idempotent; safe to run on every startup. Gated by Seed:Backfill
        // so a flagged-off deployment doesn't surprise admins with thousands of new login rows.
        if (bool.TryParse(config["Seed:BackfillMemberLogins"] ?? "true", out var backfill) && backfill)
        {
            try
            {
                var prov = scope.ServiceProvider.GetService<Application.Members.IMemberLoginProvisioningService>();
                if (prov is not null)
                {
                    var created = await prov.BackfillTenantAsync(ct);
                    if (created > 0)
                        logger.LogInformation("Member login backfill provisioned {Count} new logins", created);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Member login backfill encountered an error; admins can re-run by restarting.");
            }
        }
    }

    /// Creates one user per operational persona so every permission boundary has a login.
    /// Idempotent: skips users that already exist; reconciles permission claims on each run.
    /// Gated by <c>Seed:TestUsers</c> (default true). Password comes from <c>Seed:TestPassword</c> or "Test@12345".
    private static async Task SeedTestUsersAsync(
        UserManager<ApplicationUser> userMgr,
        Guid tenantId,
        ILogger logger,
        IConfiguration config)
    {
        if (!bool.TryParse(config["Seed:TestUsers"] ?? "true", out var enabled) || !enabled) return;
        var password = config["Seed:TestPassword"] ?? "Test@12345";

        // "view everything" bundle for the read-only viewer
        var allViewPerms = AllPermissions.Where(p => p.EndsWith(".view", StringComparison.Ordinal)).ToArray();

        var personas = new (string Email, string Name, string Role, string[] Permissions)[]
        {
            ("cashier@jamaat.local", "Counter Cashier", "Counter", new[]
            {
                "member.view", "family.view", "commitment.view", "enrollment.view", "qh.view",
                "receipt.view", "receipt.create", "receipt.confirm", "receipt.reprint",
                "event.view", "event.scan",
                // Counters consult reliability when accepting cheques / setting up commitments.
                "member.reliability.view",
            }),
            ("accountant@jamaat.local", "Senior Accountant", "Accountant", new[]
            {
                "member.view", "family.view", "commitment.view",
                "enrollment.view",
                "receipt.view", "receipt.create", "receipt.confirm", "receipt.reprint", "receipt.cancel", "receipt.reverse",
                "receipt.approve",
                "receipt.return", "receipt.return.early",
                "voucher.view", "voucher.create", "voucher.approve", "voucher.cancel", "voucher.reverse",
                "accounting.view", "accounting.journal", "period.open", "period.close",
                "reports.view", "reports.export",
                // Accountants reference reliability when reviewing returnables and overdue receivables.
                "member.reliability.view",
            }),
            ("events@jamaat.local", "Events Coordinator", "Counter", new[]
            {
                "member.view", "family.view", "enrollment.view",
                "event.view", "event.manage", "event.scan",
                "reports.view",
            }),
            ("qh-l1@jamaat.local", "QH Approver (L1)", "Approver", new[]
            {
                "member.view", "family.view",
                "qh.view", "qh.create", "qh.approve_l1",
                "reports.view",
                // L1 approvers see the reliability profile when deciding whether to recommend a loan.
                "member.reliability.view",
            }),
            ("qh-l2@jamaat.local", "QH Approver (L2)", "Approver", new[]
            {
                "member.view", "family.view",
                "qh.view", "qh.approve_l2", "qh.disburse", "qh.cancel", "qh.waive",
                "reports.view",
                "member.reliability.view",
            }),
            ("verifier@jamaat.local", "Data Verifier", "Counter", new[]
            {
                "member.view", "member.update", "member.verify",
                "family.view", "family.update",
            }),
            ("viewer@jamaat.local", "Read-only Auditor", "Auditor", allViewPerms),
        };

        foreach (var (email, name, role, perms) in personas)
        {
            var user = await userMgr.FindByEmailAsync(email);
            if (user is null)
            {
                user = new ApplicationUser
                {
                    Id = Guid.NewGuid(),
                    UserName = email,
                    Email = email,
                    FullName = name,
                    TenantId = tenantId,
                    EmailConfirmed = true,
                    IsActive = true,
                    IsLoginAllowed = true,        // seeded operator personas are usable immediately
                    MustChangePassword = false,    // dev seed - skip the force-reset flow
                    PreferredLanguage = "en",
                };
                var result = await userMgr.CreateAsync(user, password);
                if (!result.Succeeded)
                {
                    logger.LogError("Failed to seed test user {Email}: {Errors}", email,
                        string.Join("; ", result.Errors.Select(e => e.Description)));
                    continue;
                }
                await userMgr.AddToRoleAsync(user, role);
                logger.LogInformation("Seeded test user {Email} with password '{Password}'", email, password);
            }

            // Idempotently reconcile permission claims - additions only, so manual grants survive.
            var current = (await userMgr.GetClaimsAsync(user))
                .Where(c => c.Type == "permission")
                .Select(c => c.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var p in perms)
            {
                if (!current.Contains(p))
                    await userMgr.AddClaimAsync(user, new Claim("permission", p));
            }

            // Reconcile login flags so existing seeded users from older builds can still log in.
            if (!user.IsLoginAllowed)
            {
                user.IsLoginAllowed = true;
                await userMgr.UpdateAsync(user);
            }
        }
    }

    private static async Task SeedLookupsAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        if (await db.Lookups.AnyAsync(ct)) return;
        // Values sourced from the workbook's "Lookups" sheet.
        var entries = new (string category, string code, string name)[]
        {
            ("SabilType", "INDIVIDUAL", "Individual"),
            ("SabilType", "PROFESSIONAL", "Professional"),
            ("SabilType", "ESTABLISHMENT", "Establishment"),
            ("WajebaatType", "LOCAL", "Local"),
            ("WajebaatType", "INTERNATIONAL", "International"),
            ("NiyazType", "LOCAL", "Local"),
            ("NiyazType", "INTERNATIONAL", "International"),
            ("NiyazType", "LQ", "LQ"),
            ("QarzanHasanaScheme", "MOHAMMADI", "Mohammadi Scheme"),
            ("QarzanHasanaScheme", "HUSSAIN", "Hussain Scheme"),
            ("Qualification", "PRIMARY", "Primary"),
            ("Qualification", "SECONDARY", "Secondary"),
            ("Qualification", "GRADUATE", "Graduate"),
            ("Qualification", "POSTGRAD", "Postgraduate"),
            ("Qualification", "DOCTORATE", "Doctorate"),
            ("Language", "LDD", "Lisaan-ud-Dawat"),
            ("Language", "EN", "English"),
            ("Language", "AR", "Arabic"),
            ("Language", "UR", "Urdu"),
            ("Language", "HI", "Hindi"),
        };
        int order = 0;
        foreach (var (cat, code, name) in entries)
        {
            var l = new Lookup(Guid.NewGuid(), tenantId, cat, code, name);
            l.Update(name, null, order++, null, isActive: true);
            db.Lookups.Add(l);
        }
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} lookup entries.", entries.Length);
    }

    /// Idempotent seed of the EventCategory lookup. Codes are stringified ints matching the
    /// (historic) EventCategory enum so existing event rows keep working unchanged. Runs on every
    /// startup so new categories added in code get picked up by databases that already have lookups.
    private static async Task EnsureEventCategoryLookupsAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        var defaults = new (string code, string name, int order)[]
        {
            ("0", "Other", 99),
            ("1", "Urs", 1),
            ("2", "Miladi", 2),
            ("3", "Shahadat", 3),
            ("4", "Night", 4),
            ("5", "Ashara Mubaraka", 5),
            ("6", "Religious", 6),
            ("7", "Community", 7),
        };
        const string category = "EventCategory";
        var existing = await db.Lookups.Where(l => l.Category == category).Select(l => l.Code).ToListAsync(ct);
        var added = 0;
        foreach (var (code, name, order) in defaults)
        {
            if (existing.Contains(code, StringComparer.OrdinalIgnoreCase)) continue;
            var l = new Lookup(Guid.NewGuid(), tenantId, category, code, name);
            l.Update(name, null, order, null, isActive: true);
            db.Lookups.Add(l);
            added++;
        }
        if (added > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded {Count} EventCategory lookups.", added);
        }
    }

    private static async Task SeedSectorsAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        if (await db.Sectors.AnyAsync(ct)) return;
        var sector = new Sector(Guid.NewGuid(), tenantId, "HATEMI", "Hatemi");
        sector.Update("Hatemi", null, null, "Seeded sample sector from the workbook.", isActive: true);
        db.Sectors.Add(sector);
        await db.SaveChangesAsync(ct);

        var sub = new SubSector(Guid.NewGuid(), tenantId, sector.Id, "FLR2", "2nd Floor");
        sub.Update("2nd Floor", null, null, null, isActive: true);
        db.SubSectors.Add(sub);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded sample sector + sub-sector.");
    }

    private static async Task SeedOrganisationsAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        if (await db.Organisations.AnyAsync(ct)) return;
        var orgs = new (string code, string name, string category)[]
        {
            ("SHABABIL", "Shababil Eidz-Zahabi", "Committee"),
            ("TANZEEM", "Tanzeem Committee", "Committee"),
            ("ALAQEEQ", "Alaqeeq", "Idara"),
            ("ZAKEREEN", "Zakereen", "Group"),
            ("HIZB_WATAN", "Hizb ul Watan", "Group"),
            ("BUNAYYAAT", "Bunayyaat ul Eid iz Zahabi", "Committee"),
            ("NAZAFAT", "Nazafat / Environment Committee", "Committee"),
        };
        foreach (var (code, name, cat) in orgs)
        {
            var o = new Organisation(Guid.NewGuid(), tenantId, code, name);
            o.Update(name, null, cat, null, isActive: true);
            db.Organisations.Add(o);
        }
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} organisations.", orgs.Length);
    }

    private static async Task SeedAgreementTemplateAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        if (await db.CommitmentAgreementTemplates.AnyAsync(ct)) return;
        const string body = """
# Pledge Agreement

I, **{{party_name}}** ({{party_type}}), hereby pledge to contribute to the **{{fund_name}}** ({{fund_code}}) fund of {{jamaat_name}}.

## Pledge Details
- **Total pledge:** {{total_amount}} ({{currency}})
- **Schedule:** {{installments}} installment(s), {{frequency}}
- **Installment amount:** {{installment_amount}}
- **Start date:** {{start_date}}
- **End date:** {{end_date}}

## Terms
1. I commit to paying the pledged amount according to the schedule above.
2. Partial payments are permitted where the commitment allows.
3. Any missed or overdue installments remain my obligation until settled or formally waived.
4. Receipts will be issued for every payment received, allocated against this pledge.
5. This agreement may be cancelled only with the approval of the Jamaat administration.

Accepted on {{today}}.
""";
        var tpl = new CommitmentAgreementTemplate(Guid.NewGuid(), tenantId, "DEFAULT", "Default Pledge Agreement", body);
        tpl.Update("Default Pledge Agreement", body, "en", null, isDefault: true, isActive: true);
        db.CommitmentAgreementTemplates.Add(tpl);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded default commitment agreement template.");
    }

    private static async Task SeedCurrenciesAndRatesAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        // Currencies: AED is base; also seed Gulf + Asian + key global currencies
        var existing = await db.Currencies.AsNoTracking().Select(c => c.Code).ToListAsync(ct);
        var have = new HashSet<string>(existing);
        var seeds = new (string Code, string Name, string Symbol, int Decimals, bool IsBase)[]
        {
            ("AED", "UAE Dirham", "د.إ", 2, true),
            ("INR", "Indian Rupee", "₹", 2, false),
            ("USD", "US Dollar", "$", 2, false),
            ("EUR", "Euro", "€", 2, false),
            ("GBP", "British Pound", "£", 2, false),
            ("SAR", "Saudi Riyal", "ر.س", 2, false),
            ("QAR", "Qatari Riyal", "ر.ق", 2, false),
            ("OMR", "Omani Rial", "ر.ع.", 3, false),
            ("KWD", "Kuwaiti Dinar", "د.ك", 3, false),
            ("BHD", "Bahraini Dinar", ".د.ب", 3, false),
            ("PKR", "Pakistani Rupee", "₨", 2, false),
        };
        int added = 0;
        foreach (var (code, name, symbol, decimals, isBase) in seeds)
        {
            if (have.Contains(code)) continue;
            var c = new Domain.Entities.Currency(Guid.NewGuid(), tenantId, code, name, symbol, decimals);
            if (isBase) c.MarkBase();
            db.Currencies.Add(c);
            added++;
        }
        if (added > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded {Added} currencies.", added);
        }

        // Ensure exactly one is marked base (AED)
        var baseCodes = await db.Currencies.Where(c => c.IsBase).ToListAsync(ct);
        if (!baseCodes.Any(c => c.Code == "AED"))
        {
            foreach (var c in baseCodes) c.UnmarkBase();
            var aed = await db.Currencies.FirstOrDefaultAsync(c => c.Code == "AED", ct);
            aed?.MarkBase();
            await db.SaveChangesAsync(ct);
        }

        // Sample rates (→ AED) as of today. Approximate Nov 2025 values.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var rates = new (string From, string To, decimal Rate)[]
        {
            ("USD", "AED", 3.6725m),   // USD pegged
            ("EUR", "AED", 3.95m),
            ("GBP", "AED", 4.65m),
            ("INR", "AED", 0.0436m),   // 1 INR ≈ 0.0436 AED  (1 AED ≈ 22.9 INR)
            ("SAR", "AED", 0.9796m),
            ("QAR", "AED", 1.008m),
            ("OMR", "AED", 9.54m),
            ("KWD", "AED", 11.95m),
            ("BHD", "AED", 9.75m),
            ("PKR", "AED", 0.0130m),
        };
        int addedRates = 0;
        foreach (var (from, to, rate) in rates)
        {
            var hasRate = await db.ExchangeRates.AnyAsync(r => r.FromCurrency == from && r.ToCurrency == to && r.EffectiveFrom <= today && (r.EffectiveTo == null || r.EffectiveTo >= today), ct);
            if (hasRate) continue;
            db.ExchangeRates.Add(new ExchangeRate(Guid.NewGuid(), tenantId, from, to, rate, new DateOnly(2024, 1, 1), null, "seed"));
            addedRates++;
        }
        if (addedRates > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded {Added} exchange rates.", addedRates);
        }
    }

    private static async Task SeedChartOfAccountsAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        // Upsert missing accounts by code (so earlier manual seeds don't block later defaults).
        var existingCodes = await db.Accounts.AsNoTracking().Select(a => a.Code).ToListAsync(ct);
        var existing = new HashSet<string>(existingCodes);
        var seeds = new (string Code, string Name, AccountType Type, bool IsControl)[]
        {
            ("1000", "Cash & Bank", AccountType.Asset, true),
            ("1100", "Cash in Hand", AccountType.Asset, false),
            ("1200", "Bank Accounts", AccountType.Asset, false),
            // Outstanding QH loans live here as an asset - debited on disbursement, credited
            // on repayment. Lets the balance sheet show how much the Jamaat is owed by borrowers.
            ("1500", "Qarzan Hasana Loans Receivable", AccountType.Asset, false),
            ("2000", "Liabilities", AccountType.Liability, true),
            ("3000", "Funds", AccountType.Fund, true),
            ("3100", "General Fund", AccountType.Fund, false),
            ("3200", "Niyaz Fund", AccountType.Fund, false),
            ("3300", "Darees Fund", AccountType.Fund, false),
            ("3400", "Madrasa Fund", AccountType.Fund, false),
            // Default landing spot for returnable contributions when a fund type doesn't
            // override via FundType.LiabilityAccountId. Kept under "Qarzan Hasana" for the
            // common QH-returnable case; admins can split into per-bucket liability accounts
            // (e.g. 3510 "Other returnable contributions") and wire fund types to them.
            ("3500", "Qarzan Hasana - Returnable Contributions", AccountType.Liability, false),
            ("4000", "Donations Income", AccountType.Income, false),
            ("5000", "Expenses", AccountType.Expense, true),
            ("5100", "Event Expenses", AccountType.Expense, false),
            ("5200", "Utilities", AccountType.Expense, false),
            ("5300", "Honorarium", AccountType.Expense, false),
        };
        var added = 0;
        foreach (var (code, name, type, isControl) in seeds)
        {
            if (existing.Contains(code)) continue;
            var acc = new Account(Guid.NewGuid(), tenantId, code, name, type);
            if (isControl) acc.MarkControl();
            db.Accounts.Add(acc);
            added++;
        }
        if (added > 0) await db.SaveChangesAsync(ct);
        if (added > 0) logger.LogInformation("Seeded {Count} chart-of-accounts rows.", added);
    }

    private static async Task SeedFundCategoriesAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        // Idempotent - the migration's SQL also seeds these for any existing tenant, but a brand-new
        // tenant added later (multi-tenant future) won't hit that path, so we re-check here.
        var existing = await db.FundCategories.AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .Select(c => c.Code).ToListAsync(ct);
        var have = new HashSet<string>(existing, StringComparer.OrdinalIgnoreCase);

        var seeds = new (string Code, string Name, FundCategoryKind Kind, int SortOrder, string Description)[]
        {
            ("PERM_INCOME", "Permanent Income", FundCategoryKind.PermanentIncome, 10,
                "Permanent contributions - receipts post to income; no return obligation. (Mohammedi-style schemes belong here.)"),
            ("TEMP_INCOME", "Temporary Income", FundCategoryKind.TemporaryIncome, 20,
                "Returnable contributions - receipts create a return obligation; not income. (Hussaini-style schemes belong here.)"),
            ("LOAN_FUND", "Loan Fund", FundCategoryKind.LoanFund, 30,
                "Funds that issue loans (e.g. Qarzan Hasana). Same fund may also receive returnable + permanent contributions."),
            ("COMMIT_SCHEME", "Commitment Scheme", FundCategoryKind.CommitmentScheme, 40,
                "Schemes structured as commitments / pledges with instalment schedules."),
            ("FUNCTION", "Function-based Fund", FundCategoryKind.FunctionBased, 50,
                "Contributions tied to a specific event / majlis / program."),
        };
        var added = 0;
        foreach (var (code, name, kind, sortOrder, description) in seeds)
        {
            if (have.Contains(code)) continue;
            var c = new FundCategoryEntity(Guid.NewGuid(), tenantId, code, name, kind);
            c.Update(name, kind, description, sortOrder, isActive: true);
            db.FundCategories.Add(c);
            added++;
        }
        if (added > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded {Count} fund categories.", added);
        }
    }

    private static async Task SeedFundTypesAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        if (await db.FundTypes.AnyAsync(ct)) return;
        var donations = await db.Accounts.FirstOrDefaultAsync(a => a.Code == "4000", ct);

        // Resolve the new master categories so each fund type lands with its FundCategoryId set
        // out of the box. These were seeded just above.
        var permIncome = await db.FundCategories.FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Code == "PERM_INCOME", ct);
        var loanFund = await db.FundCategories.FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Code == "LOAN_FUND", ct);

        var seeds = new (string Code, string Name, bool RequiresPeriod, FundCategory Category, FundCategoryKind Kind, Guid? CategoryId, bool IsReturnable, bool RequiresAgreement, bool RequiresMaturity, bool RequiresNiyyath)[]
        {
            ("SABIL", "Sabil", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("WAJEBAAT", "Wajebaat", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("NIYAZ", "Niyaz", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("DAREES", "Darees", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("MADRASA", "Madrasa", true, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("VOLUNTARY", "Voluntary Contribution", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("SILA_FITRA", "Sila Fitra", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("NAZURMAKAM", "Nazurmakam", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("MUTAFRIQ", "Mutafriq (Misc)", false, FundCategory.Donation, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            // QH lights up every behaviour flag - it accepts returnable + permanent contributions
            // AND issues loans, so it's the canonical example of the fund-management uplift.
            ("QARZAN", "Qarzan Hasana", true, FundCategory.Loan, FundCategoryKind.LoanFund, loanFund?.Id, true, true, true, true),
            ("CHARITY", "General Charity", false, FundCategory.Charity, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("ZAKAT", "Zakat", false, FundCategory.Charity, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
            ("COMMUNITY_SUPPORT", "Community Support", false, FundCategory.CommunitySupport, FundCategoryKind.PermanentIncome, permIncome?.Id, false, false, false, false),
        };
        foreach (var s in seeds)
        {
            var ft = new FundType(Guid.NewGuid(), tenantId, s.Code, s.Name, PaymentMode.Cash | PaymentMode.Cheque | PaymentMode.BankTransfer | PaymentMode.Upi);
            ft.SetRules(true, s.RequiresPeriod, PaymentMode.Cash | PaymentMode.Cheque | PaymentMode.BankTransfer | PaymentMode.Upi, null, s.Category);
            if (s.CategoryId is Guid catId)
                ft.SetClassification(catId, fundSubCategoryId: null, s.Kind, s.IsReturnable, s.RequiresAgreement, s.RequiresMaturity, s.RequiresNiyyath);
            ft.ConfigureAccounting(donations?.Id, null);
            db.FundTypes.Add(ft);
        }
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} fund types.", seeds.Length);
    }

    private static async Task SeedNumberingSeriesAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        var existing = await db.NumberingSeries.AsNoTracking().Select(s => s.Scope).ToListAsync(ct);
        var have = new HashSet<NumberingScope>(existing);
        int added = 0;
        if (!have.Contains(NumberingScope.Receipt))
        { db.NumberingSeries.Add(new NumberingSeries(Guid.NewGuid(), tenantId, NumberingScope.Receipt, "Default Receipt", "R-", 6, true)); added++; }
        if (!have.Contains(NumberingScope.Voucher))
        { db.NumberingSeries.Add(new NumberingSeries(Guid.NewGuid(), tenantId, NumberingScope.Voucher, "Default Voucher", "V-", 6, true)); added++; }
        if (!have.Contains(NumberingScope.Journal))
        { db.NumberingSeries.Add(new NumberingSeries(Guid.NewGuid(), tenantId, NumberingScope.Journal, "Default Journal", "J-", 6, true)); added++; }
        if (added > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded {Added} default numbering series.", added);
        }
    }

    private static async Task SeedFinancialPeriodAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var start = new DateOnly(today.Year, 4, 1);
        if (today < start) start = start.AddYears(-1);
        var end = start.AddYears(1).AddDays(-1);
        if (await db.FinancialPeriods.AnyAsync(p => p.StartDate == start, ct)) return;
        db.FinancialPeriods.Add(new FinancialPeriod(Guid.NewGuid(), tenantId, $"FY {start.Year}-{(start.Year + 1) % 100:D2}", start, end));
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded financial period {Start}–{End}.", start, end);
    }

    private static async Task SeedBankAndExpenseAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        var bankAcct = await db.Accounts.FirstOrDefaultAsync(a => a.Code == "1200", ct);
        if (!await db.BankAccounts.AnyAsync(ct) && bankAcct is not null)
        {
            var b = new BankAccount(Guid.NewGuid(), tenantId, "Main Operating Account", "Sample Bank", "000000000000");
            b.Update("Main Operating Account", "Sample Bank", "000000000000", null, null, null, "INR", bankAcct.Id, true);
            db.BankAccounts.Add(b);
        }
        if (!await db.ExpenseTypes.AnyAsync(ct))
        {
            var event_ = await db.Accounts.FirstOrDefaultAsync(a => a.Code == "5100", ct);
            var util = await db.Accounts.FirstOrDefaultAsync(a => a.Code == "5200", ct);
            var hon = await db.Accounts.FirstOrDefaultAsync(a => a.Code == "5300", ct);
            var seeds = new (string Code, string Name, Guid? AcctId, bool RequiresApproval, decimal? Threshold)[]
            {
                ("EVENT", "Event expenses", event_?.Id, false, null),
                ("UTIL", "Utilities", util?.Id, false, null),
                ("HONOR", "Honorarium", hon?.Id, true, 5000m),
            };
            foreach (var (code, name, acctId, approval, threshold) in seeds)
            {
                var et = new ExpenseType(Guid.NewGuid(), tenantId, code, name);
                et.Update(name, null, acctId, approval, threshold, true);
                db.ExpenseTypes.Add(et);
            }
        }
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded default bank account + expense types.");
    }

    /// Reconcile user-level permission claims for every user in the Administrator or SuperAdmin
    /// role. The role's claim set is the source of truth (extended every release as new
    /// permissions get added to AllPermissions); user-level claims are what the JWT actually
    /// reads, so we copy any role claim that isn't already on the user. Catches both:
    ///  - Dev seeded admins whose Seed:AdminEmail no longer matches a different installer admin
    ///  - Installer-provisioned admins (the wizard creates the user but our per-release perms
    ///    flow through Administrator role, not directly).
    /// Idempotent and additive: never strips a claim, so admin-tweaked grants survive.
    private static async Task ReconcileAdminUserPermissionsAsync(UserManager<ApplicationUser> userMgr, ILogger logger)
    {
        foreach (var roleName in new[] { "Administrator", "SuperAdmin" })
        {
            var users = await userMgr.GetUsersInRoleAsync(roleName);
            // SuperAdmin gets system.* on top of AllPermissions; tenant-level Administrator does not.
            var perms = roleName == "SuperAdmin"
                ? AllPermissions.Concat(SystemPermissions).ToArray()
                : AllPermissions;
            var totalAdded = 0;
            foreach (var u in users)
            {
                var existing = (await userMgr.GetClaimsAsync(u))
                    .Where(c => c.Type == "permission")
                    .Select(c => c.Value)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var p in perms)
                {
                    if (!existing.Contains(p))
                    {
                        await userMgr.AddClaimAsync(u, new Claim("permission", p));
                        totalAdded++;
                    }
                }
            }
            if (totalAdded > 0)
                logger.LogInformation("Reconciled {Count} new permission claim(s) across {RoleName} users.", totalAdded, roleName);
        }
    }

    /// Backfill the new ApplicationUser.UserType column from existing role membership.
    /// Member-only role -> Member. Any operator role -> Operator. Both -> Hybrid.
    /// Idempotent: only writes when the resolved type differs from the stored one, so
    /// subsequent runs are no-ops and admin overrides via the UI survive.
    private static async Task ReconcileUserTypesAsync(UserManager<ApplicationUser> userMgr, ILogger logger)
    {
        var memberUsers = (await userMgr.GetUsersInRoleAsync("Member"))
            .ToDictionary(u => u.Id, u => u);

        // Find the union of users in any operator role (anyone in Administrator, SuperAdmin,
        // or one of the seeded operator roles). The `Member` role is the only "not operator" role
        // in this seed, so we enumerate the rest and union them.
        var operatorRoleNames = new[]
        {
            "Administrator", "SuperAdmin", "DataEditor", "DataValidator",
            "EventCoordinator", "EventVolunteer",
        };
        var operatorUsers = new Dictionary<Guid, ApplicationUser>();
        foreach (var roleName in operatorRoleNames)
        {
            foreach (var u in await userMgr.GetUsersInRoleAsync(roleName))
                operatorUsers[u.Id] = u;
        }

        var changed = 0;
        // Walk the union of both sets so we cover every relevant user exactly once.
        var allIds = memberUsers.Keys.Union(operatorUsers.Keys).ToList();
        foreach (var id in allIds)
        {
            var user = memberUsers.TryGetValue(id, out var m) ? m : operatorUsers[id];
            var hasMember = memberUsers.ContainsKey(id);
            var hasOperator = operatorUsers.ContainsKey(id);
            var resolved = (hasMember, hasOperator) switch
            {
                (true, true)   => UserType.Hybrid,
                (true, false)  => UserType.Member,
                (false, true)  => UserType.Operator,
                _              => UserType.Operator, // No roles - safe default; won't have portal access either
            };
            if (user.UserType != resolved)
            {
                user.UserType = resolved;
                await userMgr.UpdateAsync(user);
                changed++;
            }
        }
        if (changed > 0)
            logger.LogInformation("Reconciled UserType on {Count} user(s).", changed);
    }

    private static async Task SeedCmsDefaultsAsync(JamaatDbContext db, ILogger logger, CancellationToken ct)
    {
        // Idempotent + additive: enumerate every default key and only insert when missing.
        // This way new keys added in later releases (e.g. notif.* in Phase C) flow into existing
        // installs, while admin-edited values are never overwritten.
        var hasPages = await db.CmsPages.AnyAsync(ct);
        var existingBlockKeys = await db.CmsBlocks.AsNoTracking().Select(b => b.Key).ToListAsync(ct);
        var existingSet = existingBlockKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (true)
        {
            var blocks = new (string Key, string Value)[]
            {
                ("login.eyebrow",   "DONATION, RECEIPT, PAYMENT & ACCOUNTING"),
                ("login.title",     "One ledger for every receipt, voucher, and fund."),
                ("login.subtitle",  "A single, auditable system for your Jamaat's day-to-day finance - from counter receipts to double-entry ledgers."),
                ("login.feature.1", "Complete audit trail on every transaction"),
                ("login.feature.2", "Bilingual receipts (English, Arabic, Hindi, Urdu)"),
                ("login.feature.3", "Automatic double-entry posting"),
                ("footer.tagline",  "Jamaat - a product of Ubrixy Technologies."),

                // Phase C - member notifications. {{ var }} placeholders are filled by
                // MemberNotifier.Substitute. Editable from the CMS admin Blocks tab.
                ("notif.commitment.due.subject", "Reminder: installment due in 3 days"),
                ("notif.commitment.due.body",    "Salaam, your installment {{installmentNo}} for commitment {{commitmentCode}} ({{fundName}}) of {{amount}} {{currency}} is due on {{dueDate}}. You can pay at the counter or via the portal."),
                ("notif.qh.state.subject",       "Qarzan Hasana update: {{loanCode}}"),
                ("notif.qh.state.body",          "Salaam, your Qarzan Hasana loan {{loanCode}} is now {{status}}. Approved amount: {{amount}}. Sign in to the portal for details."),
                ("notif.event.reminder.subject", "Reminder: {{eventTitle}} starts soon"),
                ("notif.event.reminder.body",    "Salaam, this is a reminder that {{eventTitle}} starts on {{startsAt}} at {{venue}}. Your registration code is {{registrationCode}}."),
            };
            foreach (var (k, v) in blocks)
            {
                if (!existingSet.Contains(k))
                {
                    db.CmsBlocks.Add(new CmsBlock(Guid.NewGuid(), k, v));
                }
            }
        }

        if (!hasPages)
        {
            var pages = new (string Slug, string Title, CmsPageSection Section, string Body)[]
            {
                ("terms",  "Terms of Service", CmsPageSection.Legal, DefaultTermsBody()),
                ("privacy","Privacy Policy",   CmsPageSection.Legal, DefaultPrivacyBody()),
                ("cookies","Cookies Policy",   CmsPageSection.Legal, DefaultCookiesBody()),
                ("faq",    "Frequently Asked Questions", CmsPageSection.Help, DefaultFaqBody()),
                ("about",  "About Jamaat",     CmsPageSection.Marketing, DefaultAboutBody()),
            };
            foreach (var (slug, title, section, body) in pages)
            {
                var p = new CmsPage(Guid.NewGuid(), slug, title, body, section);
                p.Update(title, body, section, isPublished: true);
                db.CmsPages.Add(p);
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded default CMS blocks and pages.");
    }

    private static string DefaultTermsBody() => @"## Terms of Service

These default Terms are placeholder copy. Replace this content from the Admin > CMS screen with your organisation's actual terms before going live.

### 1. Acceptance
By using this system you agree to be bound by these Terms.

### 2. Use of the System
You will use the system only for legitimate Jamaat administration.

### 3. Data Ownership
All data entered remains the property of your organisation.

### 4. Liability
The system is provided as-is. Refer to your service agreement for warranty and liability terms.";

    private static string DefaultPrivacyBody() => @"## Privacy Policy

This is a placeholder Privacy Policy. Replace it from Admin > CMS with your organisation's actual privacy practices.

We collect personal data (name, contact, transaction history) for the purpose of operating Jamaat administration. Data is stored on infrastructure controlled by your organisation. We do not sell or share personal data with third parties unless required by law.

For data access or deletion requests, contact your Jamaat administrator.";

    private static string DefaultCookiesBody() => @"## Cookies Policy

This system uses cookies and local storage to keep you signed in, remember your UI preferences (language, theme, sidebar state), and protect against forged requests. We do not use third-party advertising or tracking cookies.";

    private static string DefaultFaqBody() => @"## Frequently Asked Questions

### How do I reset my password?
Use the 'Forgot password' link on the login screen, or ask an administrator to reset it for you.

### How do I add a new member?
Members > Add. You will need at least a name and ITS number.

### How do I issue a receipt?
Receipts > New Receipt. Pick a fund, member, amount and confirm. The system will generate a numbered receipt and post the corresponding ledger entry.

### Where can I see all my contributions?
Open the member portal at /portal/me - it lists all receipts, commitments, loans, and event registrations associated with your account.";

    private static string DefaultAboutBody() => @"## About Jamaat

Jamaat is a community-finance platform that gives your organisation a single, auditable system for receipts, vouchers, commitments, and double-entry accounting. It is a product of Ubrixy Technologies.";

    public static readonly string[] AllPermissions =
    [
        // Members
        "member.view", "member.create", "member.update", "member.delete", "member.sync", "member.verify",
        // Families
        "family.view", "family.create", "family.update", "family.delete",
        // Commitments
        "commitment.view", "commitment.create", "commitment.update", "commitment.cancel", "commitment.waive",
        // Fund enrollments
        "enrollment.view", "enrollment.create", "enrollment.update", "enrollment.approve",
        // Qarzan Hasana
        "qh.view", "qh.create", "qh.approve_l1", "qh.approve_l2", "qh.cancel", "qh.disburse", "qh.waive",
        // Events. Granular split so the events tab in Roles & Permissions can offer real choice
        // without forcing event.manage everywhere. Existing roles that hold event.manage continue
        // to imply the sub-permissions (the API still gates on the umbrella keys for backward
        // compatibility); new roles can opt in to a narrower slice instead.
        "event.view",                      // see events, registrations, scans
        "event.manage",                    // umbrella: create, update, delete, branding, agenda, page sections
        "event.publish",                   // flip isActive / open-close registrations on a published event
        "event.scan",                      // scan QR / mark check-in at the door
        "event.checkin",                   // mark a registration as checked-in from the admin grid
        "event.registration.manage",       // confirm, cancel, waitlist registrations on behalf of attendees
        "event.export",                    // export attendees / scans to CSV
        "event.page.design",               // edit page-designer sections (covered by event.manage today)
        "event.analytics",                 // view per-event analytics dashboard
        // Receipts
        "receipt.view", "receipt.create", "receipt.confirm", "receipt.reprint", "receipt.cancel", "receipt.reverse",
        // Approve a Draft receipt (created against a fund flagged RequiresApproval) so it
        // gets numbered + posted to the GL. Distinct from receipt.confirm (which is the
        // legacy auto-confirm flag - not actually checked anywhere today).
        "receipt.approve",
        // Process return-to-contributor on a returnable receipt; .early permits before maturity.
        "receipt.return", "receipt.return.early",
        // Vouchers
        "voucher.view", "voucher.create", "voucher.approve", "voucher.cancel", "voucher.reverse",
        // Accounting
        "accounting.view", "accounting.journal", "period.open", "period.close",
        // Reports
        "reports.view", "reports.export",
        // Admin
        "admin.users", "admin.roles", "admin.masterdata", "admin.integration", "admin.audit", "admin.errorlogs",
        // Member Reliability Profile (advisory scoring; surfaced on member profile, QH approval, and admin dashboard).
        // .view is held by people who actually consult the score (admins, approvers, counters, accountants);
        // .recompute is admin-only - regular users see the lazy-cached score and shouldn't be churning compute.
        // admin.reliability gates the cross-member distribution dashboard.
        "member.reliability.view", "member.reliability.recompute", "admin.reliability",
        // Self-edit + verification queue (Phase F). Members get .self.update by default
        // (it's their own data); approvers / data-validators get .changes.approve.
        "member.self.update", "member.changes.approve",
        // Self-declared wealth (Phase G). Sensitive - kept tighter than member.view.
        "member.wealth.view",
        // Member self-service portal scope. These are intentionally distinct from the operator
        // permissions above - they are scoped to OWN data only (controllers must filter by the
        // current user's MemberId). Granted to the seeded "Member" role by default.
        "portal.access",                   // can hit /portal/me at all
        "portal.contributions.view.own",   // own receipts / past contributions
        "portal.commitments.view.own",     // own commitments
        "portal.commitments.create.own",   // create new commitment for self
        "portal.qh.view.own",              // own QH loans
        "portal.qh.request",               // submit a new QH application that goes to L1 approver
        "portal.qh.endorse_guarantor",     // endorse / decline guarantor requests addressed to me
        "portal.events.view",              // see published events on the portal
        "portal.events.register",          // register self / family for events
        "portal.login_history.view.own",   // own login attempts
        // CMS - manage marketing copy on the login screen, legal pages (terms/privacy),
        // help articles, FAQ, etc. Reads are anonymous (the login page hits /api/v1/cms/blocks
        // pre-auth) so there is no separate cms.view permission - only the write side is gated.
        "cms.manage",
    ];

    /// <summary>System-scope permissions. Distinct from <see cref="AllPermissions"/> so that
    /// regular Administrators (tenant-level) do not get system.* by default - those are reserved
    /// for the SuperAdmin role and the first installer-provisioned admin. Adding system.* to
    /// AllPermissions would leak the System Monitor to every tenant Administrator created via
    /// the admin UI, which is not what we want in a multi-tenant install.</summary>
    public static readonly string[] SystemPermissions =
    [
        "system.view",            // read aggregate dashboard tiles (server / DB summary, drives, RAM)
        "system.admin",           // umbrella permission for any future write actions (purge logs, force GC, etc.)
        "system.logs.view",       // tail the API log files
        "system.tenants.view",    // enumerate tenants with member / receipt counts
        "system.analytics.view",  // usage analytics: top pages / actions / DAU / heatmap / top users
        "system.alerts.manage",   // acknowledge / dismiss system alerts raised by the alert evaluator
        "system.audit.view",      // read the operator-audit feed (who did what at the system level)
        "system.service.manage",  // restart the JamaatApi service / force GC / runtime control actions
        "system.analytics.export",// download usage-analytics rollups as CSV
    ];
}
