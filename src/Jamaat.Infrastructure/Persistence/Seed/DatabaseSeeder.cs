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
        var roles = new[]
        {
            ("Administrator", "Full access"),
            ("Accountant", "Manages receipts, vouchers, accounting"),
            ("Counter", "Issues receipts at counter"),
            ("Approver", "Approves vouchers and reversals"),
            ("Auditor", "Read-only access"),
        };
        foreach (var (name, desc) in roles)
        {
            if (await roleMgr.FindByNameAsync(name) is null)
            {
                await roleMgr.CreateAsync(new ApplicationRole { Name = name, Description = desc, TenantId = defaultTenantId });
            }
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

        // --- Admin user -----------------------------------------------------
        var adminEmail = config["Seed:AdminEmail"] ?? "admin@jamaat.local";
        var adminPassword = config["Seed:AdminPassword"] ?? "Admin@12345";

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

            // Grant the admin user every permission claim as well (so JWT claims reflect it directly)
            foreach (var perm in AllPermissions)
                await userMgr.AddClaimAsync(admin, new Claim("permission", perm));

            logger.LogInformation("Seeded admin user {Email} with password '{Password}'", adminEmail, adminPassword);
        }
        else
        {
            // Admin already exists - idempotently reconcile permission claims so that
            // permissions added in a later release flow to the existing admin user.
            var currentClaims = (await userMgr.GetClaimsAsync(admin))
                .Where(c => c.Type == "permission")
                .Select(c => c.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var added = 0;
            foreach (var perm in AllPermissions)
            {
                if (!currentClaims.Contains(perm))
                {
                    await userMgr.AddClaimAsync(admin, new Claim("permission", perm));
                    added++;
                }
            }
            if (added > 0) logger.LogInformation("Reconciled {Count} new permission claim(s) on admin user.", added);
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
        await SeedSectorsAsync(db, defaultTenantId, logger, ct);
        await SeedOrganisationsAsync(db, defaultTenantId, logger, ct);
        await SeedTestUsersAsync(userMgr, defaultTenantId, logger, config);

        // Dev-only bulk data generator - populates members/families/enrollments/commitments/events
        // so every screen has something to render. Off by default; enable via Seed:DevData=true.
        if (bool.TryParse(config["Seed:DevData"] ?? "false", out var devData) && devData)
        {
            await DevDataSeeder.SeedAsync(db, defaultTenantId, logger, ct);
            await DevDataSeeder.SeedReceiptsAsync(scope.ServiceProvider, defaultTenantId, logger, ct);
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
            }),
            ("accountant@jamaat.local", "Senior Accountant", "Accountant", new[]
            {
                "member.view", "family.view", "commitment.view",
                "enrollment.view",
                "receipt.view", "receipt.create", "receipt.confirm", "receipt.reprint", "receipt.cancel", "receipt.reverse",
                "receipt.return", "receipt.return.early",
                "voucher.view", "voucher.create", "voucher.approve", "voucher.cancel", "voucher.reverse",
                "accounting.view", "accounting.journal", "period.open", "period.close",
                "reports.view", "reports.export",
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
            }),
            ("qh-l2@jamaat.local", "QH Approver (L2)", "Approver", new[]
            {
                "member.view", "family.view",
                "qh.view", "qh.approve_l2", "qh.disburse", "qh.cancel", "qh.waive",
                "reports.view",
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
        // Events
        "event.view", "event.manage", "event.scan",
        // Receipts
        "receipt.view", "receipt.create", "receipt.confirm", "receipt.reprint", "receipt.cancel", "receipt.reverse",
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
    ];
}
