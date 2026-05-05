using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Jamaat.Application.Persistence;

/// <summary>
/// Thin facade the Application layer uses to access DbContext without depending on Infrastructure.
/// Infrastructure registers an implementation that delegates to JamaatDbContext.
/// </summary>
public abstract class JamaatDbContextFacade
{
    public abstract DbSet<Receipt> Receipts { get; }
    public abstract DbSet<Voucher> Vouchers { get; }
    public abstract DbSet<LedgerEntry> Entries { get; }
    public abstract DbSet<FinancialPeriod> FinancialPeriods { get; }
    public abstract DbSet<FundType> FundTypes { get; }
    public abstract DbSet<FundCategoryEntity> FundCategories { get; }
    public abstract DbSet<FundSubCategory> FundSubCategories { get; }
    public abstract DbSet<FundTypeCustomField> FundTypeCustomFields { get; }
    public abstract DbSet<TransactionLabel> TransactionLabels { get; }
    public abstract DbSet<PostDatedCheque> PostDatedCheques { get; }
    public abstract DbSet<ExpenseType> ExpenseTypes { get; }
    public abstract DbSet<Account> Accounts { get; }
    public abstract DbSet<Member> Members { get; }
    public abstract DbSet<BankAccount> BankAccounts { get; }
    public abstract DbSet<Jamaat.Domain.Entities.NumberingSeries> NumberingSeries { get; }
    public abstract DbSet<ErrorLog> ErrorLogs { get; }
    public abstract DbSet<AuditLog> AuditLogs { get; }
    public abstract DbSet<NotificationLog> NotificationLogs { get; }
    public abstract DbSet<ReprintLog> ReprintLogs { get; }
    public abstract DbSet<Currency> Currencies { get; }
    public abstract DbSet<ExchangeRate> ExchangeRates { get; }
    public abstract DbSet<Commitment> Commitments { get; }
    public abstract DbSet<CommitmentAgreementTemplate> CommitmentAgreementTemplates { get; }
    public abstract DbSet<Family> Families { get; }
    public abstract DbSet<FamilyMemberLink> FamilyMemberLinks { get; }
    public abstract DbSet<Tenant> Tenants { get; }
    public abstract DbSet<Sector> Sectors { get; }
    public abstract DbSet<SubSector> SubSectors { get; }
    public abstract DbSet<Organisation> Organisations { get; }
    public abstract DbSet<MemberOrganisationMembership> MemberOrganisationMemberships { get; }
    public abstract DbSet<Lookup> Lookups { get; }
    public abstract DbSet<FundEnrollment> FundEnrollments { get; }
    public abstract DbSet<QarzanHasanaLoan> QarzanHasanaLoans { get; }
    public abstract DbSet<Event> Events { get; }
    public abstract DbSet<EventScan> EventScans { get; }
    public abstract DbSet<EventRegistration> EventRegistrations { get; }
    public abstract DbSet<EventCommunication> EventCommunications { get; }
    public abstract DbSet<EventPageSection> EventPageSections { get; }
    public abstract DbSet<MemberBehaviorSnapshot> MemberBehaviorSnapshots { get; }
    public abstract DbSet<QarzanHasanaGuarantorConsent> QarzanHasanaGuarantorConsents { get; }
    public abstract DbSet<MemberEducation> MemberEducations { get; }
    public abstract DbSet<MemberChangeRequest> MemberChangeRequests { get; }
    public abstract DbSet<MemberAsset> MemberAssets { get; }
    public abstract DbSet<CmsPage> CmsPages { get; }
    public abstract DbSet<CmsBlock> CmsBlocks { get; }
    public abstract DbSet<MemberApplication> MemberApplications { get; }
    public abstract DbSet<PushSubscription> PushSubscriptions { get; }
    public abstract DatabaseFacade Database { get; }

    // Aliases used by some helpers
    public DbSet<FinancialPeriod> Periods => FinancialPeriods;
    public DbSet<FundType> Funds => FundTypes;

    public Task<int> SaveChangesAsync(CancellationToken ct = default) => DatabaseSaveChangesAsync(ct);
    protected abstract Task<int> DatabaseSaveChangesAsync(CancellationToken ct);

    /// <summary>
    /// Forces the change tracker to treat an entity (typically a newly-constructed owned entity added to a tracked parent)
    /// as a fresh insert. Workaround for EF OwnsMany behaviour where mutations on already-tracked owned collections
    /// sometimes mark new items as Modified.
    /// </summary>
    public abstract void MarkAdded(object entity);
}
