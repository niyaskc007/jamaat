using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Members;

public sealed record MemberProfileDto(
    Guid Id,
    string ItsNumber,
    string FullName,
    string? FullNameArabic,
    string? FullNameHindi,
    string? FullNameUrdu,
    string? Title,
    string? FirstPrefix, int? PrefixYear, string? FirstName,
    string? FatherPrefix, string? FatherName, string? FatherSurname,
    string? SpousePrefix, string? SpouseName, string? Surname,
    string? TanzeemFileNo,
    Guid? FamilyId, string? FamilyName, string? FamilyCode, FamilyRole? FamilyRole,
    string? FatherItsNumber, string? MotherItsNumber, string? SpouseItsNumber,
    DateOnly? DateOfBirth, int? AgeSnapshot, int? Age,
    Gender Gender, MaritalStatus MaritalStatus, BloodGroup BloodGroup,
    WarakatulTarkhisStatus WarakatulTarkhisStatus,
    MisaqStatus MisaqStatus, DateOnly? MisaqDate,
    DateOnly? DateOfNikah, string? DateOfNikahHijri,
    string? Phone, string? WhatsAppNo, string? Email,
    // Social profile URLs (v2)
    string? LinkedInUrl, string? FacebookUrl, string? InstagramUrl, string? TwitterUrl, string? WebsiteUrl,
    string? AddressLine, string? Building, string? Street, string? Area,
    string? City, string? State, string? Pincode,
    HousingOwnership HousingOwnership, TypeOfHouse TypeOfHouse,
    string? Category, string? Idara, string? Vatan, string? Nationality,
    string? Jamaat, string? Jamiaat,
    Guid? SectorId, string? SectorCode, string? SectorName,
    Guid? SubSectorId, string? SubSectorCode, string? SubSectorName,
    Qualification Qualification, string? LanguagesCsv, string? HunarsCsv,
    string? Occupation, string? SubOccupation, string? SubOccupation2,
    string? QuranSanad, bool QadambosiSharaf, bool RaudatTaheraZiyarat, bool KarbalaZiyarat, int AsharaMubarakaCount,
    // Hajj + Umrah (v2)
    HajjStatus HajjStatus, int? HajjYear, int UmrahCount,
    VerificationStatus DataVerificationStatus, DateOnly? DataVerifiedOn, string? DataVerifiedByUserName,
    VerificationStatus PhotoVerificationStatus, DateOnly? PhotoVerifiedOn, string? PhotoVerifiedByUserName,
    string? PhotoUrl,
    Guid? LastScannedEventId, string? LastScannedEventName, string? LastScannedPlace, DateTimeOffset? LastScannedAtUtc,
    MemberStatus Status, string? InactiveReason,
    DateTimeOffset CreatedAtUtc, DateTimeOffset? UpdatedAtUtc);

public sealed record UpdateIdentityDto(
    string FullName, string? FullNameArabic, string? FullNameHindi, string? FullNameUrdu,
    string? Title, string? FirstPrefix, int? PrefixYear, string? FirstName,
    string? FatherPrefix, string? FatherName, string? FatherSurname,
    string? SpousePrefix, string? SpouseName, string? Surname,
    string? TanzeemFileNo);

public sealed record UpdatePersonalDto(
    DateOnly? DateOfBirth, int? AgeSnapshot,
    Gender Gender, MaritalStatus MaritalStatus, BloodGroup BloodGroup,
    WarakatulTarkhisStatus WarakatulTarkhisStatus,
    MisaqStatus MisaqStatus, DateOnly? MisaqDate,
    DateOnly? DateOfNikah, string? DateOfNikahHijri);

public sealed record UpdateContactDto(
    string? Phone, string? WhatsAppNo, string? Email,
    // Social profile URLs - all optional, basic length validation only.
    string? LinkedInUrl = null, string? FacebookUrl = null, string? InstagramUrl = null,
    string? TwitterUrl = null, string? WebsiteUrl = null);

public sealed record UpdateAddressDto(
    string? AddressLine, string? Building, string? Street, string? Area,
    string? City, string? State, string? Pincode,
    HousingOwnership HousingOwnership, TypeOfHouse TypeOfHouse);

public sealed record UpdateOriginDto(
    string? Category, string? Idara, string? Vatan, string? Nationality,
    string? Jamaat, string? Jamiaat, Guid? SectorId, Guid? SubSectorId);

public sealed record UpdateEducationWorkDto(
    Qualification Qualification, string? LanguagesCsv, string? HunarsCsv,
    string? Occupation, string? SubOccupation, string? SubOccupation2);

public sealed record UpdateReligiousCredentialsDto(
    string? QuranSanad, bool QadambosiSharaf, bool RaudatTaheraZiyarat,
    bool KarbalaZiyarat, int AsharaMubarakaCount,
    // Hajj + Umrah (v2 additions). Year only meaningful when HajjStatus != NotPerformed.
    HajjStatus HajjStatus = HajjStatus.NotPerformed,
    int? HajjYear = null,
    int UmrahCount = 0);

public sealed record UpdateFamilyRefsDto(string? FatherItsNumber, string? MotherItsNumber, string? SpouseItsNumber);

public sealed record VerifyRequestDto(VerificationStatus Status);

public sealed record BulkVerifyRequestDto(IReadOnlyCollection<Guid> MemberIds, VerificationStatus Status);
public sealed record BulkVerifyResultDto(int UpdatedCount, int NotFoundCount, IReadOnlyCollection<Guid> NotFoundIds);

public sealed record UploadPhotoDto(string? PhotoUrl);

public sealed record MemberContributionSummaryDto(
    Guid MemberId,
    decimal TotalReceipts,
    decimal TotalOutstandingCommitments,
    decimal TotalOutstandingQarzanHasana,
    int ActiveCommitmentCount,
    int ActiveEnrollmentCount,
    int ActiveLoanCount);
