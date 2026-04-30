using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;
using Jamaat.Domain.ValueObjects;

namespace Jamaat.Domain.Entities;

public sealed class Member : AggregateRoot<Guid>, ITenantScoped, IAuditable, ISoftDeletable
{
    private Member() { }

    public Member(Guid id, Guid tenantId, ItsNumber itsNumber, string fullName)
    {
        Id = id;
        TenantId = tenantId;
        ItsNumber = itsNumber;
        FullName = fullName;
        Status = MemberStatus.Active;
    }

    public Guid TenantId { get; private set; }
    public ItsNumber ItsNumber { get; private set; } = default!;

    // --- Name composition ---------------------------------------------------
    public string FullName { get; private set; } = default!;
    public string? FullNameArabic { get; private set; }
    public string? FullNameHindi { get; private set; }
    public string? FullNameUrdu { get; private set; }
    public string? FirstPrefix { get; private set; }
    public int? PrefixYear { get; private set; }
    public string? FirstName { get; private set; }
    public string? FatherPrefix { get; private set; }
    public string? FatherName { get; private set; }
    public string? FatherSurname { get; private set; }
    /// <summary>Prefix for the spouse's name. Renamed from HusbandPrefix in v2 - the
    /// underlying column is gender-neutral now. UI labels it "Husband" / "Wife" based on
    /// the member's gender so it reads naturally; data is the same field underneath.</summary>
    public string? SpousePrefix { get; private set; }
    /// <summary>Spouse's first name. Renamed from HusbandName in v2.</summary>
    public string? SpouseName { get; private set; }
    public string? Surname { get; private set; }
    public string? Title { get; private set; }

    // --- Family & biological relationships ----------------------------------
    public Guid? FamilyId { get; private set; }
    public FamilyRole? FamilyRole { get; private set; }
    public string? FatherItsNumber { get; private set; }
    public string? MotherItsNumber { get; private set; }
    public string? SpouseItsNumber { get; private set; }

    // --- Personal -----------------------------------------------------------
    public DateOnly? DateOfBirth { get; private set; }
    /// Stored fallback when DOB is not known (legacy imports). Prefer DOB; Age is computed from DOB when present.
    public int? AgeSnapshot { get; private set; }
    public Gender Gender { get; private set; }
    public MaritalStatus MaritalStatus { get; private set; }
    public BloodGroup BloodGroup { get; private set; }
    public WarakatulTarkhisStatus WarakatulTarkhisStatus { get; private set; }
    public MisaqStatus MisaqStatus { get; private set; }
    public DateOnly? MisaqDate { get; private set; }
    public DateOnly? DateOfNikah { get; private set; }
    /// Hijri-date string alongside Gregorian (e.g., "15 Rabiul Akhar 1431H.").
    public string? DateOfNikahHijri { get; private set; }

    // --- Contact ------------------------------------------------------------
    public string? Phone { get; private set; }
    public string? WhatsAppNo { get; private set; }
    public string? Email { get; private set; }

    // --- Social links (v2 additions) ---------------------------------------
    public string? LinkedInUrl { get; private set; }
    public string? FacebookUrl { get; private set; }
    public string? InstagramUrl { get; private set; }
    public string? TwitterUrl { get; private set; }
    public string? WebsiteUrl { get; private set; }

    // --- Address (structured) ----------------------------------------------
    public string? AddressLine { get; private set; }
    public string? Building { get; private set; }
    public string? Street { get; private set; }
    public string? Area { get; private set; }
    public string? City { get; private set; }
    public string? State { get; private set; }
    public string? Pincode { get; private set; }
    public HousingOwnership HousingOwnership { get; private set; }
    public TypeOfHouse TypeOfHouse { get; private set; }

    // --- Community / Origin -------------------------------------------------
    public string? Category { get; private set; }
    public string? Idara { get; private set; }
    public string? Vatan { get; private set; }
    public string? Nationality { get; private set; }
    public string? Jamaat { get; private set; }
    public string? Jamiaat { get; private set; }
    public Guid? SectorId { get; private set; }
    public Guid? SubSectorId { get; private set; }

    // --- Education / Work ---------------------------------------------------
    public Qualification Qualification { get; private set; }
    /// CSV of languages (e.g., "Lisaan -ud- Dawat, English, Arabic, Urdu").
    public string? LanguagesCsv { get; private set; }
    /// CSV of skills/interests.
    public string? HunarsCsv { get; private set; }
    public string? Occupation { get; private set; }
    public string? SubOccupation { get; private set; }
    public string? SubOccupation2 { get; private set; }

    // --- Religious credentials ---------------------------------------------
    public string? QuranSanad { get; private set; }
    public bool QadambosiSharaf { get; private set; }
    public bool RaudatTaheraZiyarat { get; private set; }
    public bool KarbalaZiyarat { get; private set; }
    public int AsharaMubarakaCount { get; private set; }

    // --- Hajj + Umrah (v2 additions) ---------------------------------------
    /// <summary>Hajj status: NotPerformed / Performed / MultipleTimes. Defaults to NotPerformed.</summary>
    public HajjStatus HajjStatus { get; private set; }
    /// <summary>Year of the most recent Hajj when HajjStatus != NotPerformed.</summary>
    public int? HajjYear { get; private set; }
    /// <summary>Number of Umrahs performed. 0 means none on record.</summary>
    public int UmrahCount { get; private set; }

    // --- Verification -------------------------------------------------------
    public VerificationStatus DataVerificationStatus { get; private set; }
    public DateOnly? DataVerifiedOn { get; private set; }
    public Guid? DataVerifiedByUserId { get; private set; }
    public VerificationStatus PhotoVerificationStatus { get; private set; }
    public DateOnly? PhotoVerifiedOn { get; private set; }
    public Guid? PhotoVerifiedByUserId { get; private set; }
    public string? PhotoUrl { get; private set; }

    // --- Event-scan snapshot (updated by EventScan aggregate) --------------
    public Guid? LastScannedEventId { get; private set; }
    public string? LastScannedEventName { get; private set; }
    public string? LastScannedPlace { get; private set; }
    public DateTimeOffset? LastScannedAtUtc { get; private set; }

    // --- Registry metadata -------------------------------------------------
    public string? TanzeemFileNo { get; private set; }

    // --- Status / sync -----------------------------------------------------
    public MemberStatus Status { get; private set; }
    public string? InactiveReason { get; private set; }
    public string? ExternalUserId { get; private set; }
    public DateTimeOffset? LastSyncedAtUtc { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTimeOffset? DeletedAtUtc { get; private set; }
    public Guid? DeletedByUserId { get; private set; }

    // --- Behaviour ---------------------------------------------------------

    public void UpdateIdentity(string fullName, string? arabic, string? hindi, string? urdu,
        string? title, string? firstPrefix, int? prefixYear, string? firstName,
        string? fatherPrefix, string? fatherName, string? fatherSurname,
        string? spousePrefix, string? spouseName, string? surname,
        string? tanzeemFileNo)
    {
        if (string.IsNullOrWhiteSpace(fullName)) throw new ArgumentException("Full name required.", nameof(fullName));
        FullName = fullName;
        FullNameArabic = arabic; FullNameHindi = hindi; FullNameUrdu = urdu;
        Title = title;
        FirstPrefix = firstPrefix; PrefixYear = prefixYear; FirstName = firstName;
        FatherPrefix = fatherPrefix; FatherName = fatherName; FatherSurname = fatherSurname;
        SpousePrefix = spousePrefix; SpouseName = spouseName; Surname = surname;
        TanzeemFileNo = tanzeemFileNo;
    }

    public void UpdatePersonal(DateOnly? dob, int? ageSnapshot, Gender gender,
        MaritalStatus maritalStatus, BloodGroup bloodGroup,
        WarakatulTarkhisStatus warakat, MisaqStatus misaq, DateOnly? misaqDate,
        DateOnly? dateOfNikah, string? dateOfNikahHijri)
    {
        DateOfBirth = dob;
        AgeSnapshot = ageSnapshot;
        Gender = gender;
        MaritalStatus = maritalStatus;
        BloodGroup = bloodGroup;
        WarakatulTarkhisStatus = warakat;
        MisaqStatus = misaq;
        MisaqDate = misaqDate;
        DateOfNikah = dateOfNikah;
        DateOfNikahHijri = dateOfNikahHijri;
    }

    public void UpdateContact(string? phone, string? whatsApp, string? email,
        string? linkedIn = null, string? facebook = null, string? instagram = null,
        string? twitter = null, string? website = null)
    {
        Phone = phone;
        WhatsAppNo = whatsApp;
        Email = email;
        LinkedInUrl = NullIfBlank(linkedIn);
        FacebookUrl = NullIfBlank(facebook);
        InstagramUrl = NullIfBlank(instagram);
        TwitterUrl = NullIfBlank(twitter);
        WebsiteUrl = NullIfBlank(website);
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Legacy helper retained while MemberService is being migrated to the structured API.</summary>
    public void UpdateName(string fullName, string? arabic, string? hindi, string? urdu)
    {
        if (string.IsNullOrWhiteSpace(fullName)) throw new ArgumentException("Full name required.", nameof(fullName));
        FullName = fullName;
        FullNameArabic = arabic;
        FullNameHindi = hindi;
        FullNameUrdu = urdu;
    }

    public void UpdateAddress(string? addressLine, string? building, string? street, string? area,
        string? city, string? state, string? pincode,
        HousingOwnership ownership, TypeOfHouse typeOfHouse)
    {
        AddressLine = addressLine;
        Building = building;
        Street = street;
        Area = area;
        City = city;
        State = state;
        Pincode = pincode;
        HousingOwnership = ownership;
        TypeOfHouse = typeOfHouse;
    }

    public void UpdateOrigin(string? category, string? idara, string? vatan, string? nationality,
        string? jamaat, string? jamiaat, Guid? sectorId, Guid? subSectorId)
    {
        Category = category;
        Idara = idara;
        Vatan = vatan;
        Nationality = nationality;
        Jamaat = jamaat;
        Jamiaat = jamiaat;
        SectorId = sectorId;
        SubSectorId = subSectorId;
    }

    public void UpdateEducationWork(Qualification qualification, string? languagesCsv, string? hunarsCsv,
        string? occupation, string? subOccupation, string? subOccupation2)
    {
        Qualification = qualification;
        LanguagesCsv = languagesCsv;
        HunarsCsv = hunarsCsv;
        Occupation = occupation;
        SubOccupation = subOccupation;
        SubOccupation2 = subOccupation2;
    }

    public void UpdateReligiousCredentials(string? quranSanad, bool qadambosi, bool raudatTahera,
        bool karbala, int asharaCount,
        HajjStatus hajjStatus = HajjStatus.NotPerformed, int? hajjYear = null, int umrahCount = 0)
    {
        QuranSanad = quranSanad;
        QadambosiSharaf = qadambosi;
        RaudatTaheraZiyarat = raudatTahera;
        KarbalaZiyarat = karbala;
        AsharaMubarakaCount = Math.Max(0, asharaCount);
        HajjStatus = hajjStatus;
        // Year only meaningful when Hajj has actually been performed.
        HajjYear = hajjStatus == HajjStatus.NotPerformed ? null : hajjYear;
        UmrahCount = Math.Max(0, umrahCount);
    }

    public void UpdateFamilyRefs(string? fatherIts, string? motherIts, string? spouseIts)
    {
        FatherItsNumber = fatherIts;
        MotherItsNumber = motherIts;
        SpouseItsNumber = spouseIts;
    }

    public void ChangeStatus(MemberStatus status, string? reason = null)
    {
        Status = status;
        InactiveReason = reason;
    }

    public void LinkFamily(Guid familyId, FamilyRole? role = null)
    {
        FamilyId = familyId;
        FamilyRole = role;
    }

    public void UnlinkFamily()
    {
        FamilyId = null;
        FamilyRole = null;
    }

    public void SetFamilyRole(FamilyRole role) => FamilyRole = role;

    public void VerifyData(VerificationStatus status, Guid? userId, DateOnly on)
    {
        DataVerificationStatus = status;
        DataVerifiedByUserId = userId;
        DataVerifiedOn = on;
    }

    public void VerifyPhoto(VerificationStatus status, Guid? userId, DateOnly on, string? photoUrl = null)
    {
        PhotoVerificationStatus = status;
        PhotoVerifiedByUserId = userId;
        PhotoVerifiedOn = on;
        if (photoUrl is not null) PhotoUrl = photoUrl;
    }

    public void SetPhotoUrl(string? url) => PhotoUrl = url;

    public void RecordEventScan(Guid eventId, string eventName, string? place, DateTimeOffset at)
    {
        LastScannedEventId = eventId;
        LastScannedEventName = eventName;
        LastScannedPlace = place;
        LastScannedAtUtc = at;
    }

    public void MarkSynced(string? externalId, DateTimeOffset at)
    {
        ExternalUserId = externalId;
        LastSyncedAtUtc = at;
    }

    public void SoftDelete(Guid? userId, DateTimeOffset at)
    {
        IsDeleted = true;
        DeletedByUserId = userId;
        DeletedAtUtc = at;
    }

    /// <summary>Compute age (years) from DOB if available, falling back to the stored snapshot.</summary>
    public int? ComputeAge(DateOnly today)
    {
        if (DateOfBirth is not { } dob) return AgeSnapshot;
        var age = today.Year - dob.Year;
        if (today < dob.AddYears(age)) age--;
        return age;
    }
}
