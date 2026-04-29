using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence;

public class JamaatDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>
{
    private readonly ITenantContext _tenant;
    private readonly IDomainEventDispatcher? _dispatcher;

    public JamaatDbContext(
        DbContextOptions<JamaatDbContext> options,
        ITenantContext tenant,
        IDomainEventDispatcher? dispatcher = null)
        : base(options)
    {
        _tenant = tenant;
        _dispatcher = dispatcher;
    }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Family> Families => Set<Family>();
    public DbSet<FundType> FundTypes => Set<FundType>();
    public DbSet<FundCategoryEntity> FundCategories => Set<FundCategoryEntity>();
    public DbSet<FundSubCategory> FundSubCategories => Set<FundSubCategory>();
    public DbSet<FundTypeCustomField> FundTypeCustomFields => Set<FundTypeCustomField>();
    public DbSet<TransactionLabel> TransactionLabels => Set<TransactionLabel>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ErrorLog> ErrorLogs => Set<ErrorLog>();
    public DbSet<NumberingSeries> NumberingSeries => Set<NumberingSeries>();
    public DbSet<BankAccount> BankAccounts => Set<BankAccount>();
    public DbSet<FinancialPeriod> FinancialPeriods => Set<FinancialPeriod>();
    public DbSet<ExpenseType> ExpenseTypes => Set<ExpenseType>();
    public DbSet<Currency> Currencies => Set<Currency>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<Commitment> Commitments => Set<Commitment>();
    public DbSet<CommitmentAgreementTemplate> CommitmentAgreementTemplates => Set<CommitmentAgreementTemplate>();
    public DbSet<Receipt> Receipts => Set<Receipt>();
    public DbSet<Voucher> Vouchers => Set<Voucher>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<ReprintLog> ReprintLogs => Set<ReprintLog>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Sector> Sectors => Set<Sector>();
    public DbSet<SubSector> SubSectors => Set<SubSector>();
    public DbSet<Organisation> Organisations => Set<Organisation>();
    public DbSet<MemberOrganisationMembership> MemberOrganisationMemberships => Set<MemberOrganisationMembership>();
    public DbSet<Lookup> Lookups => Set<Lookup>();
    public DbSet<FundEnrollment> FundEnrollments => Set<FundEnrollment>();
    public DbSet<QarzanHasanaLoan> QarzanHasanaLoans => Set<QarzanHasanaLoan>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventScan> EventScans => Set<EventScan>();
    public DbSet<EventRegistration> EventRegistrations => Set<EventRegistration>();
    public DbSet<EventCommunication> EventCommunications => Set<EventCommunication>();
    public DbSet<EventPageSection> EventPageSections => Set<EventPageSection>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Apply all IEntityTypeConfiguration<> in this assembly
        builder.ApplyConfigurationsFromAssembly(typeof(JamaatDbContext).Assembly);

        // Global tenant query filter on ITenantScoped entities
        foreach (var entityType in builder.Model.GetEntityTypes())
        {
            if (typeof(ITenantScoped).IsAssignableFrom(entityType.ClrType))
            {
                var method = typeof(JamaatDbContext)
                    .GetMethod(nameof(ApplyTenantFilter), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                    .MakeGenericMethod(entityType.ClrType);
                method.Invoke(this, [builder]);
            }
        }
    }

    private void ApplyTenantFilter<TEntity>(ModelBuilder builder) where TEntity : class, ITenantScoped
    {
        builder.Entity<TEntity>().HasQueryFilter(e => e.TenantId == _tenant.TenantId);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // Collect aggregate roots with pending events before save
        var aggregates = ChangeTracker.Entries()
            .Where(e => e.Entity is AggregateRoot<Guid> root && root.DomainEvents.Count > 0)
            .Select(e => (AggregateRoot<Guid>)e.Entity)
            .ToList();

        var result = await base.SaveChangesAsync(cancellationToken);

        if (_dispatcher is not null && aggregates.Count > 0)
        {
            var events = aggregates.SelectMany(a => a.DomainEvents).ToList();
            foreach (var a in aggregates) a.ClearDomainEvents();
            await _dispatcher.DispatchAsync(events, cancellationToken);
        }

        return result;
    }
}
