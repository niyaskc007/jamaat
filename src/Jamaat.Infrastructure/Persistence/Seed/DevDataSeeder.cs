using Jamaat.Application.Members.Reliability;
using Jamaat.Application.Receipts;
using Jamaat.Application.Vouchers;
using Jamaat.Contracts.Receipts;
using Jamaat.Contracts.Vouchers;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Domain.ValueObjects;
using Jamaat.Infrastructure.MultiTenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Persistence.Seed;

/// Development-only seed to populate the DB with enough realistic rows to make the
/// lists, profiles, dashboards and reports feel alive. Idempotent: skips itself if
/// there are already enough members (i.e. an operator has started entering real data).
///
/// Gated by <c>Seed:DevData=true</c> so it never fires in production.
///
/// Master-data scope: members, families, fund enrollments, commitments, events.
/// <see cref="SeedReceiptsAsync"/> is opt-in and routes through the real ReceiptService so
/// every fake receipt actually posts to the ledger (numbering, audit, FX all included).
public static class DevDataSeeder
{
    public static async Task SeedAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        // If there are already a handful of members, assume real data is in play and bail.
        var existingMemberCount = await db.Members.CountAsync(ct);
        if (existingMemberCount >= 10)
        {
            logger.LogDebug("DevDataSeeder skipped - {Count} members already exist.", existingMemberCount);
            return;
        }

        var rng = new Random(4242); // deterministic seed → repeatable dev datasets
        var fundTypes = await db.FundTypes.Where(f => f.Category != FundCategory.Loan).ToListAsync(ct);
        if (fundTypes.Count == 0)
        {
            logger.LogWarning("DevDataSeeder: no non-loan fund types present yet, skipping.");
            return;
        }

        var members = new List<Member>();
        var itsStart = 40123000; // ensures no collision with any real ITS numbers

        foreach (var (first, last, arabic, phone, email) in SampleIdentities)
        {
            if (!ItsNumber.TryCreate((itsStart + members.Count).ToString(), out var its)) continue;
            var fullName = $"{first} {last}";
            var m = new Member(Guid.NewGuid(), tenantId, its, fullName);
            m.UpdateName(fullName, arabic, null, null);
            m.UpdateContact(phone, phone, email);
            // Spread data verification across the pool so the verifier persona has actual work.
            var idx = members.Count;
            var status = (idx % 5) switch
            {
                0 => VerificationStatus.Verified,
                1 => VerificationStatus.Verified,
                2 => VerificationStatus.Pending,
                3 => VerificationStatus.Rejected,
                _ => VerificationStatus.NotStarted,
            };
            if (status != VerificationStatus.NotStarted)
                m.VerifyData(status, null, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-rng.Next(1, 60))));
            members.Add(m);
        }
        db.Members.AddRange(members);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("DevDataSeeder: seeded {Count} members.", members.Count);

        // The AuditInterceptor stamps CreatedAtUtc=now on every Added entity, so the seeded
        // members all look brand-new. The reliability scorer then refuses to grade them
        // (under the 90-day tenure floor) and the admin dashboard reports everyone as Unrated.
        // Backdate via raw SQL to a 4-24 month spread so we end up with a realistic tenure
        // distribution and a populated grade chart.
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE dbo.[Member] SET CreatedAtUtc = DATEADD(month, -(4 + ABS(CHECKSUM(Id)) % 21), SYSDATETIMEOFFSET()) WHERE TenantId = {0}",
            tenantId);

        // --- Families ---------------------------------------------------------
        // Grab first ~18 members and group them into 6 families of 3 each.
        var families = new List<Family>();
        for (var i = 0; i < 6 && i * 3 + 2 < members.Count; i++)
        {
            var head = members[i * 3];
            var name = $"{head.FullName.Split(' ').Last()} family";
            var fam = new Family(Guid.NewGuid(), tenantId, $"F-{i + 1:D3}", name, head.Id);
            fam.UpdateDetails(name, head.Phone, head.Email, $"House {i + 1}, Hakimi Compound", null);
            fam.SetHead(head.Id, head.ItsNumber.Value);
            families.Add(fam);
        }
        db.Families.AddRange(families);
        await db.SaveChangesAsync(ct);

        // Link the family members after both parents exist (FamilyId FK). Also wire
        // parental ITS refs so the FamilyTree view in the UI has meaningful relationships
        // to render: position 1 = head, position 2 = spouse (set spouse-ITS on both),
        // position 3 = child (Father ITS = head's ITS).
        for (var i = 0; i < families.Count; i++)
        {
            var headIdx = i * 3;
            var spouseIdx = i * 3 + 1;
            var childIdx = i * 3 + 2;
            var head = headIdx < members.Count ? members[headIdx] : null;
            var spouse = spouseIdx < members.Count ? members[spouseIdx] : null;
            var child = childIdx < members.Count ? members[childIdx] : null;

            if (head is not null) { head.LinkFamily(families[i].Id); db.Members.Update(head); }
            if (spouse is not null)
            {
                spouse.LinkFamily(families[i].Id);
                if (head is not null) spouse.UpdateFamilyRefs(spouse.FatherItsNumber, spouse.MotherItsNumber, head.ItsNumber.Value);
                db.Members.Update(spouse);
            }
            if (child is not null)
            {
                child.LinkFamily(families[i].Id);
                child.UpdateFamilyRefs(
                    fatherIts: head?.ItsNumber.Value,
                    motherIts: spouse?.ItsNumber.Value,
                    spouseIts: null);
                db.Members.Update(child);
            }
            // Set spouse ITS on the head too (mutual link).
            if (head is not null && spouse is not null)
            {
                head.UpdateFamilyRefs(head.FatherItsNumber, head.MotherItsNumber, spouse.ItsNumber.Value);
                db.Members.Update(head);
            }
        }
        await db.SaveChangesAsync(ct);
        logger.LogInformation("DevDataSeeder: seeded {Count} families with relationship links.", families.Count);

        // --- Fund enrollments -------------------------------------------------
        // Mix of Draft + Active so the approvers have something to click.
        var enrollments = new List<FundEnrollment>();
        for (var i = 0; i < 10 && i < members.Count; i++)
        {
            var fund = fundTypes[i % fundTypes.Count];
            var code = $"FE-{i + 1:D3}";
            var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-rng.Next(30, 180)));
            var e = new FundEnrollment(Guid.NewGuid(), tenantId, code, members[i].Id, fund.Id,
                subType: null, FundEnrollmentRecurrence.Monthly, start);
            if (i % 3 != 0) e.Approve(Guid.Empty, "dev-seed", DateTimeOffset.UtcNow.AddDays(-rng.Next(1, 30)));
            enrollments.Add(e);
        }
        db.FundEnrollments.AddRange(enrollments);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("DevDataSeeder: seeded {Count} fund enrollments.", enrollments.Count);

        // --- Commitments ------------------------------------------------------
        // Build each commitment through its full lifecycle in-memory (Draft -> ReplaceSchedule ->
        // AcceptAgreement -> Active, plus a few back-paid past-due installments) BEFORE handing the
        // entity to EF. Doing this on a yet-untracked aggregate makes EF emit INSERTs for the
        // commitment + all owned installments in one shot - the alternative (save Draft, reload,
        // mutate) trips the OwnsMany change-tracker into UPDATE-of-non-existent-row errors.
        var commitments = new List<Commitment>();
        var todayDate = DateOnly.FromDateTime(DateTime.UtcNow);
        for (var i = 0; i < 5 && i < members.Count; i++)
        {
            var fund = fundTypes[i % fundTypes.Count];
            var member = members[members.Count - 1 - i]; // pick tail so they differ from enrollments
            var total = (i + 1) * 1200m;
            const int n = 12;
            // Backdate startDate so half the installments fall before today and half after; the
            // Receivables Aging dashboard then shows non-empty buckets in both halves.
            var startDate = todayDate.AddMonths(-(n / 2));
            var c = new Commitment(
                Guid.NewGuid(), tenantId, $"C-{i + 1:D3}",
                CommitmentPartyType.Member, member.Id, null,
                member.FullName, fund.Id, fund.NameEnglish,
                "AED", total,
                CommitmentFrequency.Monthly, n,
                startDate,
                allowPartialPayments: true,
                allowAutoAdvance: false);

            var perInst = Math.Round(total / n, 2);
            var schedule = new List<CommitmentInstallment>();
            for (var k = 0; k < n; k++)
                schedule.Add(new CommitmentInstallment(Guid.NewGuid(), k + 1, startDate.AddMonths(k), perInst));
            c.ReplaceSchedule(schedule);

            c.AcceptAgreement(
                templateId: null, templateVersion: null, renderedText: "Seeded agreement (dev).",
                userId: Guid.Empty, userName: "dev-seed", at: DateTimeOffset.UtcNow,
                ipAddress: "127.0.0.1", userAgent: "dev-seed",
                method: AgreementAcceptanceMethod.Admin);

            // Pay a varying number of past-due installments. The last paid one is partial half the
            // time so the InstallmentStatus column shows a Pending/Partial/Paid mix.
            var pastDue = c.Installments.Where(x => x.DueDate <= todayDate).OrderBy(x => x.InstallmentNo).ToList();
            if (pastDue.Count > 0)
            {
                var toPay = rng.Next(1, pastDue.Count + 1);
                for (var k = 0; k < toPay; k++)
                {
                    var inst = pastDue[k];
                    var partial = k == toPay - 1 && rng.Next(2) == 0;
                    var amt = partial ? Math.Round(inst.ScheduledAmount / 2m, 2) : inst.ScheduledAmount;
                    c.RecordPaymentOnInstallment(inst.Id, amt, inst.DueDate.AddDays(rng.Next(0, 5)));
                }
            }
            c.RefreshOverdueStatuses(todayDate);

            commitments.Add(c);
        }
        db.Commitments.AddRange(commitments);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("DevDataSeeder: seeded {Count} commitments with schedules + agreements + back-pay.", commitments.Count);

        // --- Events -----------------------------------------------------------
        var events = new List<Event>
        {
            new(Guid.NewGuid(), tenantId, "urs-mubarak-1447", "Urs Mubarak 1447",
                EventCategory.Urs, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(45)), "Hakimi Masjid"),
            new(Guid.NewGuid(), tenantId, "ashara-mubaraka-1447", "Ashara Mubaraka 1447",
                EventCategory.AsharaMubaraka, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-20)), "Hakimi Masjid"),
            new(Guid.NewGuid(), tenantId, "monthly-community-iftar", "Monthly Community Iftar",
                EventCategory.Community, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3)), "Hakimi Masjid"),
        };
        // Populate the full core block so the portal page has something to show.
        foreach (var ev in events)
        {
            ev.UpdateCore(
                ev.Name, nameArabic: null,
                tagline: "Seeded sample event - safe to delete.",
                description: null,
                ev.Category, ev.EventDate, hijri: null,
                startsAtUtc: null, endsAtUtc: null,
                place: ev.Place, venueAddress: null,
                lat: null, lng: null,
                contactPhone: null, contactEmail: null,
                notes: null, isActive: true);
        }
        db.Events.AddRange(events);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("DevDataSeeder: seeded {Count} events.", events.Count);
    }

    /// Seeds confirmed receipts via <see cref="IReceiptService.CreateAndConfirmAsync"/> so each
    /// one runs through the same numbering, ledger-posting, and audit-interceptor path as the
    /// real Counter flow. We use the service rather than direct entity inserts because the
    /// dashboard charts and accounting reports depend on the ledger entries those produce.
    public static async Task SeedReceiptsAsync(IServiceProvider sp, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        // Need a service scope of our own - DI scopes per request, but the seeder is a one-shot.
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<JamaatDbContext>();

        // CRITICAL: set the TenantContext *before* any query - the EF global query filter
        // strips rows when no tenant is bound, which would falsely look like an empty DB.
        var tenantCtx = scope.ServiceProvider.GetRequiredService<TenantContext>();
        tenantCtx.SetTenant(tenantId);

        // Skip if already seeded - any Confirmed receipt above the noise threshold means the
        // dashboard will look populated; bulk-adding more would just duplicate the noise.
        var existing = await db.Receipts.CountAsync(r => r.Status == Domain.Enums.ReceiptStatus.Confirmed, ct);
        if (existing >= 20)
        {
            logger.LogDebug("DevDataSeeder: receipts already seeded ({Count}), skipping.", existing);
            return;
        }

        // Find dev-seeded members + non-loan funds. We use a deterministic Random so re-runs in
        // empty DBs produce the same dataset.
        var members = await db.Members.AsNoTracking().Take(20).Select(m => m.Id).ToListAsync(ct);
        var fundIds = await db.FundTypes.AsNoTracking()
            .Where(f => f.Category != FundCategory.Loan && f.IsActive)
            .Select(f => f.Id)
            .Take(6)
            .ToListAsync(ct);
        if (members.Count == 0 || fundIds.Count == 0)
        {
            logger.LogWarning("DevDataSeeder: cannot seed receipts - need members and non-loan funds.");
            return;
        }

        var svc = scope.ServiceProvider.GetRequiredService<IReceiptService>();

        var rng = new Random(7777);
        var seeded = 0;
        var failed = 0;
        // Spread receipts over the last 60 days so charts have a meaningful trend line.
        for (var i = 0; i < 60; i++)
        {
            var member = members[rng.Next(members.Count)];
            var fund = fundIds[rng.Next(fundIds.Count)];
            var amount = (decimal)(50 + rng.Next(0, 950)); // 50–1000
            var date = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-rng.Next(0, 60)));
            // Mix payment modes: 60% Cash, 30% Cheque, 10% Bank Transfer.
            var roll = rng.Next(100);
            var mode = roll < 60 ? PaymentMode.Cash : roll < 90 ? PaymentMode.Cheque : PaymentMode.BankTransfer;
            Guid? bankAccountId = null;
            if (mode != PaymentMode.Cash)
            {
                bankAccountId = await db.BankAccounts.AsNoTracking().Where(b => b.IsActive).Select(b => (Guid?)b.Id).FirstOrDefaultAsync(ct);
            }
            var dto = new CreateReceiptDto(
                ReceiptDate: date,
                MemberId: member,
                PaymentMode: mode,
                BankAccountId: bankAccountId,
                ChequeNumber: mode == PaymentMode.Cheque ? $"DEV{1000 + i}" : null,
                ChequeDate: mode == PaymentMode.Cheque ? date : null,
                PaymentReference: mode == PaymentMode.BankTransfer ? $"TXN-{rng.Next(100000, 999999)}" : null,
                Remarks: null,
                Lines: new[]
                {
                    new CreateReceiptLineDto(fund, amount, Purpose: "Seeded contribution", PeriodReference: null),
                });
            var r = await svc.CreateAndConfirmAsync(dto, ct);
            if (r.IsSuccess) seeded++; else failed++;
        }
        logger.LogInformation("DevDataSeeder: seeded {Seeded} confirmed receipts ({Failed} failed).", seeded, failed);
    }

    /// Runs the second-pass enrichments after <see cref="SeedAsync"/> + <see cref="SeedReceiptsAsync"/> have
    /// laid the foundation: mints a realistic spread of QH loans across the lifecycle, raises a
    /// handful of expense vouchers via the real <see cref="IVoucherService"/> (so they post to the
    /// ledger), and snapshots every member's reliability profile from the actual journal data. Each
    /// sub-step is independently idempotent.
    public static async Task EnrichDevDataAsync(IServiceProvider sp, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<JamaatDbContext>();
        var tenantCtx = scope.ServiceProvider.GetRequiredService<TenantContext>();
        tenantCtx.SetTenant(tenantId);

        await SeedQhLoansAsync(db, tenantId, logger, ct);
        await SeedVouchersAsync(scope.ServiceProvider, logger, ct);
        await SeedReliabilitySnapshotsAsync(scope.ServiceProvider, logger, ct);
    }

    /// Seed ten Qarzan Hasana loans spread across the lifecycle so the QH Portfolio dashboard's
    /// status pie, repayment trend, top-borrowers table, and upcoming-installments list all
    /// surface non-trivial data. We drive each loan through its real domain methods so the
    /// resulting rows are indistinguishable from operator-created loans.
    private static async Task SeedQhLoansAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        var existing = await db.QarzanHasanaLoans.CountAsync(ct);
        if (existing >= 5)
        {
            logger.LogDebug("SeedQhLoansAsync: skipped - {Count} loans already exist.", existing);
            return;
        }

        var members = await db.Members.AsNoTracking().Take(20).ToListAsync(ct);
        if (members.Count < 4)
        {
            logger.LogWarning("SeedQhLoansAsync: need at least 4 members for borrower + guarantors.");
            return;
        }

        // (amountRequested, amountApproved, n, monthsAgo, paidCount, partialNext, stopAt, label)
        // stopAt: 1=PendingLevel1, 2=PendingLevel2, 3=Approved (schedule set), 4=Active+Disbursed, 5=Completed
        var profiles = new (decimal Req, decimal App, int N, int MonthsAgo, int PaidCount, decimal PartialNext, int StopAt, string Label)[]
        {
            (8000m, 7000m, 12, 8, 7, 0m, 4, "Active-on-track"),
            (5000m, 5000m, 10, 5, 4, 250m, 4, "Active-partial"),
            (12000m, 10000m, 12, 12, 12, 0m, 5, "Completed"),
            (6000m, 6000m, 12, 6, 3, 0m, 4, "Active-with-overdue"),
            (4000m, 4000m, 8, 3, 3, 0m, 4, "Active-current"),
            (10000m, 10000m, 12, 1, 1, 0m, 4, "Active-just-disbursed"),
            (15000m, 15000m, 12, 0, 0, 0m, 3, "Approved-not-disbursed"),
            (3000m, 0m, 6, 0, 0, 0m, 1, "PendingLevel1"),
            (7000m, 7000m, 10, 0, 0, 0m, 2, "PendingLevel2"),
            (9000m, 9000m, 12, 4, 2, 0m, 4, "Active-newer"),
        };

        var schemes = new[] { QarzanHasanaScheme.MohammadiScheme, QarzanHasanaScheme.HussainScheme, QarzanHasanaScheme.Other };

        var rng = new Random(9090);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var loans = new List<QarzanHasanaLoan>();

        for (var i = 0; i < profiles.Length; i++)
        {
            var p = profiles[i];
            var borrower = members[i % members.Count];
            var g1 = members[(i + 1) % members.Count];
            var g2 = members[(i + 2) % members.Count];
            if (g1.Id == borrower.Id) g1 = members[(i + 3) % members.Count];
            if (g2.Id == borrower.Id || g2.Id == g1.Id) g2 = members[(i + 4) % members.Count];

            var startDate = today.AddMonths(-p.MonthsAgo);
            var loan = new QarzanHasanaLoan(Guid.NewGuid(), tenantId, $"QH-{i + 1:D4}",
                borrower.Id, schemes[i % schemes.Length], p.Req, p.N, "AED", startDate, g1.Id, g2.Id);
            loan.UpdateDraft(
                amountRequested: p.Req, installmentsRequested: p.N,
                cashflowUrl: null, goldSlipUrl: null, goldAmount: null, startDate: startDate,
                guarantor1: g1.Id, guarantor2: g2.Id, familyId: null,
                purpose: "Household / business need (dev seed)",
                repaymentPlan: "Monthly salary deduction",
                sourceOfIncome: "Primary employment + spouse income",
                otherObligations: null,
                monthlyIncome: 5000m, monthlyExpenses: 3500m, monthlyExistingEmis: 0m,
                goldWeightGrams: null, goldPurityKarat: null, goldHeldAt: null,
                incomeSources: "SALARY");
            loan.AcknowledgeGuarantors("dev-seed", DateTimeOffset.UtcNow);

            if (p.StopAt >= 1)
            {
                loan.Submit();
            }
            if (p.StopAt >= 2)
            {
                loan.ApproveLevel1(Guid.Empty, "dev-seed-l1",
                    DateTimeOffset.UtcNow.AddDays(-rng.Next(1, 15)),
                    p.App, p.N, "Seeded L1 approval");
            }
            if (p.StopAt >= 3)
            {
                loan.ApproveLevel2(Guid.Empty, "dev-seed-l2",
                    DateTimeOffset.UtcNow.AddDays(-rng.Next(0, 5)),
                    "Seeded L2 approval");

                var perInst = Math.Round(p.App / p.N, 2);
                var schedule = new List<QarzanHasanaInstallment>();
                for (var k = 0; k < p.N; k++)
                    schedule.Add(new QarzanHasanaInstallment(Guid.NewGuid(), k + 1, startDate.AddMonths(k), perInst));
                loan.SetSchedule(schedule);
            }
            if (p.StopAt >= 4)
            {
                loan.MarkDisbursed(voucherId: null, disbursedOn: startDate);
                var insts = loan.Installments.OrderBy(x => x.InstallmentNo).ToList();
                for (var k = 0; k < p.PaidCount && k < insts.Count; k++)
                {
                    var inst = insts[k];
                    loan.RecordRepayment(inst.Id, inst.ScheduledAmount, inst.DueDate.AddDays(rng.Next(-2, 5)));
                }
                if (p.PartialNext > 0 && p.PaidCount < insts.Count)
                {
                    var inst = insts[p.PaidCount];
                    loan.RecordRepayment(inst.Id, p.PartialNext, inst.DueDate.AddDays(rng.Next(-2, 5)));
                }
            }

            loans.Add(loan);
        }

        db.QarzanHasanaLoans.AddRange(loans);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("SeedQhLoansAsync: seeded {Count} QH loans across mixed lifecycle states.", loans.Count);
    }

    /// Raise a handful of expense vouchers through <see cref="IVoucherService"/> so the Treasury /
    /// Compliance dashboards have non-zero pending counts and the ledger has matching debit entries.
    /// We deliberately use the service (not direct entity inserts) because numbering, FX, ledger
    /// posting, and notifications are all triggered there.
    private static async Task SeedVouchersAsync(IServiceProvider sp, ILogger logger, CancellationToken ct)
    {
        var db = sp.GetRequiredService<JamaatDbContext>();
        var existing = await db.Vouchers.CountAsync(ct);
        if (existing >= 5)
        {
            logger.LogDebug("SeedVouchersAsync: skipped - {Count} vouchers already exist.", existing);
            return;
        }

        var expenseTypes = await db.ExpenseTypes.AsNoTracking().Where(e => e.IsActive).ToListAsync(ct);
        if (expenseTypes.Count == 0)
        {
            logger.LogWarning("SeedVouchersAsync: no active ExpenseTypes - skipping.");
            return;
        }
        var bankAccountId = await db.BankAccounts.AsNoTracking().Where(b => b.IsActive).Select(b => (Guid?)b.Id).FirstOrDefaultAsync(ct);

        var svc = sp.GetRequiredService<IVoucherService>();
        var rng = new Random(6363);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var profiles = new (PaymentMode Mode, int DaysAgo, int LineCount, decimal MinAmt, decimal MaxAmt, string PayTo, string Purpose)[]
        {
            (PaymentMode.Cash, 3, 1, 200m, 800m, "Hakimi Provisions", "Iftari supplies"),
            (PaymentMode.Cash, 8, 1, 100m, 400m, "Local courier", "Document delivery"),
            (PaymentMode.Cheque, 12, 2, 600m, 2200m, "Al Madina Catering", "Monthly Niyaz catering"),
            (PaymentMode.Cheque, 20, 1, 1500m, 4500m, "Saifee Property Management", "Hall rent - Urs Mubarak"),
            (PaymentMode.BankTransfer, 5, 2, 300m, 1800m, "Hakim Audio Visual", "AV equipment hire"),
            (PaymentMode.BankTransfer, 15, 1, 800m, 3200m, "Burhani Maintenance", "Masjid plumbing repairs"),
            (PaymentMode.Cash, 1, 1, 50m, 250m, "Petty cash topup", "Office consumables"),
            (PaymentMode.Cheque, 2, 1, 2000m, 6000m, "Mufaddal Travel", "Member relief travel"),
        };

        var seeded = 0;
        var failed = 0;
        for (var i = 0; i < profiles.Length; i++)
        {
            var p = profiles[i];
            var date = today.AddDays(-p.DaysAgo);
            var lines = new List<CreateVoucherLineDto>();
            for (var k = 0; k < p.LineCount; k++)
            {
                var et = expenseTypes[(i + k) % expenseTypes.Count];
                var amount = Math.Round(p.MinAmt + (decimal)rng.NextDouble() * (p.MaxAmt - p.MinAmt), 2);
                lines.Add(new CreateVoucherLineDto(et.Id, amount, $"Seeded line {k + 1}"));
            }
            var dto = new CreateVoucherDto(
                VoucherDate: date,
                PayTo: p.PayTo,
                PayeeItsNumber: null,
                Purpose: p.Purpose,
                PaymentMode: p.Mode,
                BankAccountId: p.Mode == PaymentMode.Cash ? null : bankAccountId,
                ChequeNumber: p.Mode == PaymentMode.Cheque ? $"DEV{2000 + i}" : null,
                ChequeDate: p.Mode == PaymentMode.Cheque ? date : null,
                DrawnOnBank: p.Mode == PaymentMode.Cheque ? "ENBD" : null,
                PaymentDate: p.Mode == PaymentMode.Cash ? date : null,
                Remarks: null,
                Lines: lines,
                Currency: null);
            var r = await svc.CreateAsync(dto, ct);
            if (r.IsSuccess) seeded++; else failed++;
        }
        logger.LogInformation("SeedVouchersAsync: seeded {Seeded} vouchers ({Failed} failed).", seeded, failed);
    }

    /// Snapshot every member's reliability profile by calling the real
    /// <see cref="IReliabilityService.RecomputeAsync"/>. We use the service, not fabricated JSON,
    /// so the seeded snapshots reflect actual contribution / commitment / loan history. After this
    /// runs the admin Reliability dashboard's grade distribution + top-reliable + needs-attention
    /// sections all light up.
    private static async Task SeedReliabilitySnapshotsAsync(IServiceProvider sp, ILogger logger, CancellationToken ct)
    {
        var db = sp.GetRequiredService<JamaatDbContext>();
        var svc = sp.GetRequiredService<IReliabilityService>();
        var memberIds = await db.Members.AsNoTracking().Select(m => m.Id).ToListAsync(ct);
        if (memberIds.Count == 0)
        {
            logger.LogDebug("SeedReliabilitySnapshotsAsync: no members - nothing to snapshot.");
            return;
        }

        var ok = 0;
        var failed = 0;
        foreach (var memberId in memberIds)
        {
            var r = await svc.RecomputeAsync(memberId, ct);
            if (r.IsSuccess) ok++; else failed++;
        }
        logger.LogInformation("SeedReliabilitySnapshotsAsync: computed {Ok} snapshots ({Failed} failed).", ok, failed);
    }

    /// Name pool - Bohra/Arabic-leaning first names + common family surnames seen in the community.
    /// Kept compact but varied enough to populate AntD Table search realistically.
    private static readonly (string First, string Last, string Arabic, string? Phone, string? Email)[] SampleIdentities =
    [
        ("Mufaddal", "Saifuddin", "مفضل سيف الدين", "+971501000001", "mufaddal.s@example.com"),
        ("Husain", "Najmuddin", "حسين نجم الدين", "+971501000002", "husain.n@example.com"),
        ("Aliasger", "Kalimuddin", "علي أصغر كليم الدين", "+971501000003", null),
        ("Yusuf", "Qadri", "يوسف القادري", "+971501000004", "yusuf.q@example.com"),
        ("Fatema", "Zahra", "فاطمة الزهراء", "+971501000005", "fatema.z@example.com"),
        ("Saifee", "Husaini", "سيفي حسيني", "+971501000006", "saifee.h@example.com"),
        ("Shabbir", "Mohammedali", "شبير محمد علي", "+971501000007", null),
        ("Khatoon", "Abbas", "خاتون عباس", "+971501000008", "khatoon.a@example.com"),
        ("Idris", "Adenwala", "إدريس عدنوالا", "+971501000009", "idris.a@example.com"),
        ("Burhanuddin", "Mamuji", "برهان الدين مامو جي", "+971501000010", "burhan.m@example.com"),
        ("Taher", "Rangwala", "طاهر رانجوالا", "+971501000011", null),
        ("Rashida", "Contractor", "راشدة كنتراكتور", "+971501000012", "rashida.c@example.com"),
        ("Quaid", "Johar", "قائد جوهر", "+971501000013", "quaid.j@example.com"),
        ("Sakina", "Yusufi", "سكينة يوسفي", "+971501000014", "sakina.y@example.com"),
        ("Ammaar", "Sadiq", "عمار صديق", "+971501000015", "ammaar.s@example.com"),
        ("Zainab", "Kapoor", "زينب كابور", "+971501000016", null),
        ("Qutbuddin", "Colombowala", "قطب الدين كولمبووالا", "+971501000017", "qutbuddin.c@example.com"),
        ("Abdul", "Tayyab", "عبد الطيب", "+971501000018", "abdul.t@example.com"),
        ("Zehra", "Mandviwala", "زهرة مندوي والا", "+971501000019", "zehra.m@example.com"),
        ("Najmuddin", "Chinwala", "نجم الدين شينوالا", "+971501000020", null),
        ("Shaheen", "Rampurwala", "شاهين رامبورواالا", "+971501000021", "shaheen.r@example.com"),
        ("Moiz", "Lakdawala", "معز لكداوالا", "+971501000022", "moiz.l@example.com"),
        ("Arwa", "Ezzy", "أروى عزي", "+971501000023", "arwa.e@example.com"),
        ("Juzer", "Bawasaheba", "جوزر بواساهيبا", "+971501000024", null),
        ("Maryam", "Poonawala", "مريم بوناوالا", "+971501000025", "maryam.p@example.com"),
    ];
}
