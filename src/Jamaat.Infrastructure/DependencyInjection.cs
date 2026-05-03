using FluentValidation;
using Jamaat.Application.Accounting;
using Jamaat.Application.Accounts;
using Jamaat.Application.BankAccounts;
using Jamaat.Application.Commitments;
using Jamaat.Application.Currencies;
using Jamaat.Application.ErrorLogs;
using Jamaat.Application.Events;
using Jamaat.Application.ExpenseTypes;
using Jamaat.Application.Families;
using Jamaat.Application.FundEnrollments;
using Jamaat.Application.FundTypes;
using Jamaat.Application.Lookups;
using Jamaat.Application.Members;
using Jamaat.Application.Members.Reliability;
using Jamaat.Application.NumberingSeries;
using Jamaat.Application.Organisations;
using Jamaat.Application.Persistence;
using Jamaat.Application.QarzanHasana;
using Jamaat.Application.Receipts;
using Jamaat.Application.Sectors;
using Jamaat.Application.SystemMonitor;
using Jamaat.Application.Tenants;
using Jamaat.Application.Vouchers;
using Jamaat.Domain.Abstractions;
using Jamaat.Infrastructure.Accounting;
using Jamaat.Infrastructure.Common;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.MultiTenancy;
using Jamaat.Infrastructure.Pdf;
using Jamaat.Infrastructure.Persistence;
using Jamaat.Infrastructure.Persistence.Interceptors;
using Jamaat.Infrastructure.Persistence.Repositories;
using Jamaat.Infrastructure.Storage;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Jamaat.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddJamaatInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var connectionString = config.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<TenantContext>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());
        services.AddScoped<CorrelationContext>();
        services.AddScoped<ICorrelationContext>(sp => sp.GetRequiredService<CorrelationContext>());
        services.AddScoped<IRequestContext>(sp => sp.GetRequiredService<CorrelationContext>());

        services.AddScoped<AuditInterceptor>();
        services.AddScoped<IDomainEventDispatcher, DomainEventDispatcher>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<JamaatDbContextFacade, JamaatDbContextFacadeImpl>();

        services.AddDbContext<JamaatDbContext>((sp, opt) =>
        {
            opt.UseSqlServer(connectionString, sql =>
            {
                sql.MigrationsHistoryTable("__EFMigrationsHistory", "dbo");
                // Note: no EnableRetryOnFailure - incompatible with user-initiated transactions
                // used by the posting engine. Wrap in CreateExecutionStrategy() if retries needed.
            });
            opt.AddInterceptors(sp.GetRequiredService<AuditInterceptor>());
        });

        services.AddIdentityCore<ApplicationUser>(opt =>
        {
            opt.Password.RequiredLength = 8;
            opt.Password.RequireNonAlphanumeric = false;
            opt.User.RequireUniqueEmail = true;
            opt.SignIn.RequireConfirmedEmail = false;
        })
            .AddRoles<ApplicationRole>()
            .AddEntityFrameworkStores<JamaatDbContext>()
            .AddDefaultTokenProviders();

        services.Configure<JwtOptions>(config.GetSection(JwtOptions.SectionName));
        services.Configure<Application.Identity.TemporaryPasswordOptions>(
            config.GetSection(Application.Identity.TemporaryPasswordOptions.SectionName));
        services.AddScoped<ITokenService, JwtTokenService>();
        services.AddScoped<Identity.ILoginAuditService, Identity.LoginAuditService>();
        services.AddScoped<Identity.ITemporaryPasswordService, Identity.TemporaryPasswordService>();
        services.AddScoped<Application.Members.IMemberLoginProvisioningService, Identity.MemberLoginProvisioningService>();
        // Geolocation: singleton because the MaxMind reader holds an mmap-style file handle that
        // benefits from being shared across requests. Reload() is exposed on the concrete impl so
        // the admin upload endpoint can swap the .mmdb without an app restart.
        services.Configure<Application.Identity.GeolocationOptions>(
            config.GetSection(Application.Identity.GeolocationOptions.SectionName));
        services.AddSingleton<Identity.MaxMindGeolocationService>();
        services.AddSingleton<Application.Identity.IGeolocationService>(sp =>
            sp.GetRequiredService<Identity.MaxMindGeolocationService>());

        // Repositories
        services.AddScoped<IMemberRepository, MemberRepository>();
        services.AddScoped<IErrorLogRepository, ErrorLogRepository>();
        services.AddScoped<IFundTypeRepository, FundTypeRepository>();
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<INumberingSeriesRepository, NumberingSeriesRepository>();
        services.AddScoped<IBankAccountRepository, BankAccountRepository>();
        services.AddScoped<IReceiptRepository, ReceiptRepository>();
        services.AddScoped<IVoucherRepository, VoucherRepository>();

        // Core accounting services
        services.AddScoped<INumberingService, NumberingService>();
        services.AddScoped<IPostingService, PostingService>();
        services.AddScoped<IFxConverter, FxConverter>();

        // Application services
        services.AddScoped<IMemberService, MemberService>();
        services.AddScoped<IErrorLogService, ErrorLogService>();
        services.AddScoped<IFundTypeService, FundTypeService>();
        services.AddScoped<Application.FundCategories.IFundCategoryService, Application.FundCategories.FundCategoryService>();
        services.AddScoped<Application.FundTypes.IFundTypeCustomFieldService, Application.FundTypes.FundTypeCustomFieldService>();
        services.AddScoped<Application.TransactionLabels.ITransactionLabelService, Application.TransactionLabels.TransactionLabelService>();
        services.AddScoped<Application.PostDatedCheques.IPostDatedChequeService, Application.PostDatedCheques.PostDatedChequeService>();
        services.AddScoped<IAccountService, AccountService>();
        services.AddScoped<INumberingSeriesService, NumberingSeriesService>();
        services.AddScoped<IBankAccountService, BankAccountService>();
        services.AddScoped<IReceiptService, ReceiptService>();
        services.AddScoped<IVoucherService, VoucherService>();
        services.AddScoped<IExpenseTypeService, ExpenseTypeService>();
        services.AddScoped<ILedgerService, LedgerService>();
        services.AddScoped<IPeriodService, PeriodService>();
        services.AddScoped<IReportsService, ReportsService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<ICurrencyService, CurrencyService>();
        services.AddScoped<IExchangeRateService, ExchangeRateService>();
        services.AddScoped<IFamilyService, FamilyService>();
        services.AddScoped<ICommitmentAgreementTemplateService, CommitmentAgreementTemplateService>();
        services.AddScoped<ICommitmentService, CommitmentService>();

        // Phase 1-3 additions
        services.AddScoped<ISectorService, SectorService>();
        services.AddScoped<ISubSectorService, SubSectorService>();
        services.AddScoped<IOrganisationService, OrganisationService>();
        services.AddScoped<IMembershipService, MembershipService>();
        services.AddScoped<ILookupService, LookupService>();
        services.AddScoped<IMemberProfileService, MemberProfileService>();
        services.AddScoped<IMemberChangeRequestService, MemberChangeRequestService>();
        services.AddScoped<IReliabilityService, ReliabilityService>();
        services.AddScoped<IFundEnrollmentService, FundEnrollmentService>();
        services.AddScoped<IQarzanHasanaService, QarzanHasanaService>();
        services.AddScoped<IEventService, EventService>();
        services.AddScoped<IEventRegistrationService, EventRegistrationService>();
        services.AddScoped<IEventPortalService, EventPortalService>();
        services.AddScoped<IEventPageDesignerService, EventPageDesignerService>();
        services.AddScoped<ITenantService, TenantService>();
        services.AddScoped<ISystemService, SystemMonitor.SystemService>();

        // PDF renderers
        services.AddSingleton<IReceiptPdfRenderer, ReceiptPdfRenderer>();
        services.AddSingleton<IVoucherPdfRenderer, VoucherPdfRenderer>();
        services.AddSingleton<IQhAgreementPdfRenderer, QhAgreementPdfRenderer>();

        // Photo storage (local file-system default; swap for Azure Blob later)
        services.Configure<PhotoStorageOptions>(config.GetSection(PhotoStorageOptions.SectionName));
        services.AddSingleton<IPhotoStorage, LocalFileSystemPhotoStorage>();
        services.Configure<EventAssetStorageOptions>(config.GetSection(EventAssetStorageOptions.SectionName));
        services.AddSingleton<IEventAssetStorage, LocalFileSystemEventAssetStorage>();
        services.Configure<Application.Receipts.ReceiptDocumentStorageOptions>(
            config.GetSection(Application.Receipts.ReceiptDocumentStorageOptions.SectionName));
        services.AddSingleton<Application.Receipts.IReceiptDocumentStorage, Storage.LocalFileSystemReceiptDocumentStorage>();

        services.Configure<Application.QarzanHasana.QarzanHasanaDocumentStorageOptions>(
            config.GetSection(Application.QarzanHasana.QarzanHasanaDocumentStorageOptions.SectionName));
        services.AddSingleton<Application.QarzanHasana.IQarzanHasanaDocumentStorage, Storage.LocalFileSystemQarzanHasanaDocumentStorage>();

        // Notifications - one sender that adapts based on config. Default behaviour (Notifications:Enabled=false
        // or no SMTP host) is log-only: every notification is written to NotificationLog without delivery.
        // Audit trail is captured from day one; admins flip the switch when SMTP is ready.
        services.Configure<Notifications.NotificationSenderOptions>(
            config.GetSection(Notifications.NotificationSenderOptions.SectionName));
        services.AddScoped<Domain.Abstractions.INotificationSender, Notifications.NotificationSender>();
        services.AddScoped<Application.Notifications.INotificationQueryService, Application.Notifications.NotificationQueryService>();

        // Pluggable SMS / WhatsApp - admins pick the active provider in the integration panel
        // and supply credentials. Every provider is registered; CompositeSmsSender delegates to
        // whichever matches SmsOptions.Provider at runtime, so swapping providers is a config
        // change with no redeploy.
        services.Configure<Application.Notifications.SmsOptions>(
            config.GetSection(Application.Notifications.SmsOptions.SectionName));
        services.Configure<Application.Notifications.WhatsAppOptions>(
            config.GetSection(Application.Notifications.WhatsAppOptions.SectionName));
        services.AddHttpClient();
        services.AddScoped<Application.Notifications.ISmsSender, Notifications.TwilioSmsSender>();
        services.AddScoped<Application.Notifications.ISmsSender, Notifications.UnifonicSmsSender>();
        services.AddScoped<Application.Notifications.ISmsSender, Notifications.InfobipSmsSender>();
        services.AddScoped<Application.Notifications.IWhatsAppSender, Notifications.TwilioWhatsAppSender>();
        // Composite sender that picks the active provider per request. Registered LAST so DI's
        // last-wins resolution pulls the composite when a single ISmsSender is requested by
        // domain code; explicit IEnumerable<ISmsSender> resolution still gets all providers.
        services.AddScoped<Notifications.CompositeSmsSender>();
        services.AddScoped<Notifications.CompositeWhatsAppSender>();

        // Excel exporter / reader - ClosedXML-backed, stateless, safe as singletons.
        services.AddSingleton<Application.Common.IExcelExporter, Export.ClosedXmlExcelExporter>();
        services.AddSingleton<Application.Common.IExcelReader, Export.ClosedXmlExcelReader>();

        // FluentValidation validators
        services.AddValidatorsFromAssembly(typeof(IMemberService).Assembly, includeInternalTypes: false);

        return services;
    }
}
