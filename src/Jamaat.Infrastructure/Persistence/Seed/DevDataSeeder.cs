using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Persistence.Seed;

/// Development-only seed to populate the DB with enough realistic rows to make the
/// lists, profiles, dashboards and reports feel alive. Idempotent: skips itself if
/// there are already enough members (i.e. an operator has started entering real data).
///
/// Gated by <c>Seed:DevData=true</c> so it never fires in production.
///
/// Intentionally narrow scope: members, families, fund enrollments, commitments, events.
/// Skips receipts/vouchers/QH — those require ledger posting, numbering, and FX that are
/// safer to exercise via the real services in manual testing rather than bulk-generating.
public static class DevDataSeeder
{
    public static async Task SeedAsync(JamaatDbContext db, Guid tenantId, ILogger logger, CancellationToken ct)
    {
        // If there are already a handful of members, assume real data is in play and bail.
        var existingMemberCount = await db.Members.CountAsync(ct);
        if (existingMemberCount >= 10)
        {
            logger.LogDebug("DevDataSeeder skipped — {Count} members already exist.", existingMemberCount);
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

        // Link the family members after both parents exist (FamilyId FK).
        for (var i = 0; i < families.Count; i++)
        {
            for (var j = 0; j < 3; j++)
            {
                var idx = i * 3 + j;
                if (idx >= members.Count) break;
                members[idx].LinkFamily(families[i].Id);
                db.Members.Update(members[idx]);
            }
        }
        await db.SaveChangesAsync(ct);
        logger.LogInformation("DevDataSeeder: seeded {Count} families.", families.Count);

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
        var commitments = new List<Commitment>();
        for (var i = 0; i < 5 && i < members.Count; i++)
        {
            var fund = fundTypes[i % fundTypes.Count];
            var member = members[members.Count - 1 - i]; // pick tail so they differ from enrollments
            var total = (i + 1) * 1200m;
            var c = new Commitment(
                Guid.NewGuid(), tenantId, $"C-{i + 1:D3}",
                CommitmentPartyType.Member, member.Id, null,
                member.FullName, fund.Id, fund.NameEnglish,
                "AED", total,
                CommitmentFrequency.Monthly, 12,
                DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-rng.Next(0, 60))),
                allowPartialPayments: true,
                allowAutoAdvance: false);
            commitments.Add(c);
        }
        db.Commitments.AddRange(commitments);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("DevDataSeeder: seeded {Count} commitments.", commitments.Count);

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
                tagline: "Seeded sample event — safe to delete.",
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

    /// Name pool — Bohra/Arabic-leaning first names + common family surnames seen in the community.
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
