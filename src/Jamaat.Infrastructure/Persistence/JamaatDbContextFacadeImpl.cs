using Jamaat.Application.Persistence;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Jamaat.Infrastructure.Persistence;

public sealed class JamaatDbContextFacadeImpl(JamaatDbContext db) : JamaatDbContextFacade
{
    public override DbSet<Receipt> Receipts => db.Receipts;
    public override DbSet<Voucher> Vouchers => db.Vouchers;
    public override DbSet<LedgerEntry> Entries => db.LedgerEntries;
    public override DbSet<FinancialPeriod> FinancialPeriods => db.FinancialPeriods;
    public override DbSet<FundType> FundTypes => db.FundTypes;
    public override DbSet<FundCategoryEntity> FundCategories => db.FundCategories;
    public override DbSet<FundSubCategory> FundSubCategories => db.FundSubCategories;
    public override DbSet<FundTypeCustomField> FundTypeCustomFields => db.FundTypeCustomFields;
    public override DbSet<TransactionLabel> TransactionLabels => db.TransactionLabels;
    public override DbSet<ExpenseType> ExpenseTypes => db.ExpenseTypes;
    public override DbSet<Account> Accounts => db.Accounts;
    public override DbSet<Member> Members => db.Members;
    public override DbSet<BankAccount> BankAccounts => db.BankAccounts;
    public override DbSet<Jamaat.Domain.Entities.NumberingSeries> NumberingSeries => db.NumberingSeries;
    public override DbSet<ErrorLog> ErrorLogs => db.ErrorLogs;
    public override DbSet<AuditLog> AuditLogs => db.AuditLogs;
    public override DbSet<ReprintLog> ReprintLogs => db.ReprintLogs;
    public override DbSet<Currency> Currencies => db.Currencies;
    public override DbSet<ExchangeRate> ExchangeRates => db.ExchangeRates;
    public override DbSet<Commitment> Commitments => db.Commitments;
    public override DbSet<CommitmentAgreementTemplate> CommitmentAgreementTemplates => db.CommitmentAgreementTemplates;
    public override DbSet<Family> Families => db.Families;
    public override DbSet<Tenant> Tenants => db.Tenants;
    public override DbSet<Sector> Sectors => db.Sectors;
    public override DbSet<SubSector> SubSectors => db.SubSectors;
    public override DbSet<Organisation> Organisations => db.Organisations;
    public override DbSet<MemberOrganisationMembership> MemberOrganisationMemberships => db.MemberOrganisationMemberships;
    public override DbSet<Lookup> Lookups => db.Lookups;
    public override DbSet<FundEnrollment> FundEnrollments => db.FundEnrollments;
    public override DbSet<QarzanHasanaLoan> QarzanHasanaLoans => db.QarzanHasanaLoans;
    public override DbSet<Event> Events => db.Events;
    public override DbSet<EventScan> EventScans => db.EventScans;
    public override DbSet<EventRegistration> EventRegistrations => db.EventRegistrations;
    public override DbSet<EventCommunication> EventCommunications => db.EventCommunications;
    public override DbSet<EventPageSection> EventPageSections => db.EventPageSections;
    public override DatabaseFacade Database => db.Database;
    protected override Task<int> DatabaseSaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);

    public override void MarkAdded(object entity)
    {
        var entry = db.Entry(entity);
        if (entry.State != Microsoft.EntityFrameworkCore.EntityState.Added)
            entry.State = Microsoft.EntityFrameworkCore.EntityState.Added;
    }
}
