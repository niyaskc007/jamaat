using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Members;

public interface IMemberProfileService
{
    Task<Result<MemberProfileDto>> GetProfileAsync(Guid id, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdateIdentityAsync(Guid id, UpdateIdentityDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdatePersonalAsync(Guid id, UpdatePersonalDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdateContactAsync(Guid id, UpdateContactDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdateAddressAsync(Guid id, UpdateAddressDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdateOriginAsync(Guid id, UpdateOriginDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdateEducationWorkAsync(Guid id, UpdateEducationWorkDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdateReligiousCredentialsAsync(Guid id, UpdateReligiousCredentialsDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> UpdateFamilyRefsAsync(Guid id, UpdateFamilyRefsDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> VerifyDataAsync(Guid id, VerifyRequestDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> VerifyPhotoAsync(Guid id, VerifyRequestDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> SetPhotoUrlAsync(Guid id, UploadPhotoDto dto, CancellationToken ct = default);
    Task<Result<MemberContributionSummaryDto>> GetContributionSummaryAsync(Guid id, CancellationToken ct = default);
}

public sealed class MemberProfileService(
    JamaatDbContextFacade db, IUnitOfWork uow, ICurrentUser currentUser, IClock clock) : IMemberProfileService
{
    public Task<Result<MemberProfileDto>> GetProfileAsync(Guid id, CancellationToken ct = default)
        => LoadProfileAsync(id, ct);

    public async Task<Result<MemberProfileDto>> UpdateIdentityAsync(Guid id, UpdateIdentityDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdateIdentity(dto.FullName, dto.FullNameArabic, dto.FullNameHindi, dto.FullNameUrdu,
            dto.Title, dto.FirstPrefix, dto.PrefixYear, dto.FirstName,
            dto.FatherPrefix, dto.FatherName, dto.FatherSurname,
            dto.HusbandPrefix, dto.HusbandName, dto.Surname,
            dto.TanzeemFileNo);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdatePersonalAsync(Guid id, UpdatePersonalDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdatePersonal(dto.DateOfBirth, dto.AgeSnapshot, dto.Gender, dto.MaritalStatus, dto.BloodGroup,
            dto.WarakatulTarkhisStatus, dto.MisaqStatus, dto.MisaqDate, dto.DateOfNikah, dto.DateOfNikahHijri);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdateContactAsync(Guid id, UpdateContactDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdateContact(dto.Phone, dto.WhatsAppNo, dto.Email);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdateAddressAsync(Guid id, UpdateAddressDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdateAddress(dto.AddressLine, dto.Building, dto.Street, dto.Area, dto.City, dto.State, dto.Pincode,
            dto.HousingOwnership, dto.TypeOfHouse);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdateOriginAsync(Guid id, UpdateOriginDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        if (dto.SectorId is Guid sid && !await db.Sectors.AnyAsync(s => s.Id == sid, ct))
            return Error.Validation("sector.not_found", "Sector not found.");
        if (dto.SubSectorId is Guid ssid && !await db.SubSectors.AnyAsync(s => s.Id == ssid, ct))
            return Error.Validation("subsector.not_found", "Sub-sector not found.");
        m.UpdateOrigin(dto.Category, dto.Idara, dto.Vatan, dto.Nationality,
            dto.Jamaat, dto.Jamiaat, dto.SectorId, dto.SubSectorId);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdateEducationWorkAsync(Guid id, UpdateEducationWorkDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdateEducationWork(dto.Qualification, dto.LanguagesCsv, dto.HunarsCsv,
            dto.Occupation, dto.SubOccupation, dto.SubOccupation2);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdateReligiousCredentialsAsync(Guid id, UpdateReligiousCredentialsDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdateReligiousCredentials(dto.QuranSanad, dto.QadambosiSharaf, dto.RaudatTaheraZiyarat,
            dto.KarbalaZiyarat, dto.AsharaMubarakaCount);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdateFamilyRefsAsync(Guid id, UpdateFamilyRefsDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdateFamilyRefs(dto.FatherItsNumber, dto.MotherItsNumber, dto.SpouseItsNumber);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> VerifyDataAsync(Guid id, VerifyRequestDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.VerifyData(dto.Status, currentUser.UserId, DateOnly.FromDateTime(clock.UtcNow.UtcDateTime));
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> VerifyPhotoAsync(Guid id, VerifyRequestDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.VerifyPhoto(dto.Status, currentUser.UserId, DateOnly.FromDateTime(clock.UtcNow.UtcDateTime));
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> SetPhotoUrlAsync(Guid id, UploadPhotoDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.SetPhotoUrl(dto.PhotoUrl);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberContributionSummaryDto>> GetContributionSummaryAsync(Guid id, CancellationToken ct = default)
    {
        if (!await db.Members.AnyAsync(x => x.Id == id && !x.IsDeleted, ct))
            return Error.NotFound("member.not_found", "Member not found.");
        var totalReceipts = await db.Receipts.Where(r => r.MemberId == id && r.Status == Domain.Enums.ReceiptStatus.Confirmed)
            .SumAsync(r => (decimal?)r.AmountTotal, ct) ?? 0m;
        var commitments = await db.Commitments.Where(c => c.MemberId == id && c.Status == Domain.Enums.CommitmentStatus.Active)
            .ToListAsync(ct);
        var loans = await db.QarzanHasanaLoans
            .Where(l => l.MemberId == id && (l.Status == QarzanHasanaStatus.Active || l.Status == QarzanHasanaStatus.Disbursed))
            .ToListAsync(ct);
        var enrollments = await db.FundEnrollments.CountAsync(e => e.MemberId == id && e.Status == FundEnrollmentStatus.Active, ct);

        return new MemberContributionSummaryDto(
            id,
            totalReceipts,
            commitments.Sum(c => c.RemainingAmount),
            loans.Sum(l => l.AmountOutstanding),
            commitments.Count,
            enrollments,
            loans.Count);
    }

    private async Task<Result<MemberProfileDto>> LoadProfileAsync(Guid id, CancellationToken ct)
    {
        var m = await db.Members.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");

        string? familyName = null, familyCode = null;
        if (m.FamilyId is Guid fId)
        {
            var f = await db.Families.AsNoTracking().Where(x => x.Id == fId)
                .Select(x => new { x.FamilyName, x.Code }).FirstOrDefaultAsync(ct);
            if (f is not null) { familyName = f.FamilyName; familyCode = f.Code; }
        }
        string? sectorCode = null, sectorName = null;
        if (m.SectorId is Guid sid)
        {
            var s = await db.Sectors.AsNoTracking().Where(x => x.Id == sid).Select(x => new { x.Code, x.Name }).FirstOrDefaultAsync(ct);
            if (s is not null) { sectorCode = s.Code; sectorName = s.Name; }
        }
        string? subCode = null, subName = null;
        if (m.SubSectorId is Guid ssid)
        {
            var s = await db.SubSectors.AsNoTracking().Where(x => x.Id == ssid).Select(x => new { x.Code, x.Name }).FirstOrDefaultAsync(ct);
            if (s is not null) { subCode = s.Code; subName = s.Name; }
        }

        var today = DateOnly.FromDateTime(clock.UtcNow.UtcDateTime);
        return new MemberProfileDto(
            m.Id, m.ItsNumber.Value,
            m.FullName, m.FullNameArabic, m.FullNameHindi, m.FullNameUrdu,
            m.Title,
            m.FirstPrefix, m.PrefixYear, m.FirstName,
            m.FatherPrefix, m.FatherName, m.FatherSurname,
            m.HusbandPrefix, m.HusbandName, m.Surname,
            m.TanzeemFileNo,
            m.FamilyId, familyName, familyCode, m.FamilyRole,
            m.FatherItsNumber, m.MotherItsNumber, m.SpouseItsNumber,
            m.DateOfBirth, m.AgeSnapshot, m.ComputeAge(today),
            m.Gender, m.MaritalStatus, m.BloodGroup,
            m.WarakatulTarkhisStatus,
            m.MisaqStatus, m.MisaqDate,
            m.DateOfNikah, m.DateOfNikahHijri,
            m.Phone, m.WhatsAppNo, m.Email,
            m.AddressLine, m.Building, m.Street, m.Area,
            m.City, m.State, m.Pincode,
            m.HousingOwnership, m.TypeOfHouse,
            m.Category, m.Idara, m.Vatan, m.Nationality,
            m.Jamaat, m.Jamiaat,
            m.SectorId, sectorCode, sectorName,
            m.SubSectorId, subCode, subName,
            m.Qualification, m.LanguagesCsv, m.HunarsCsv,
            m.Occupation, m.SubOccupation, m.SubOccupation2,
            m.QuranSanad, m.QadambosiSharaf, m.RaudatTaheraZiyarat, m.KarbalaZiyarat, m.AsharaMubarakaCount,
            m.DataVerificationStatus, m.DataVerifiedOn, null,
            m.PhotoVerificationStatus, m.PhotoVerifiedOn, null,
            m.PhotoUrl,
            m.LastScannedEventId, m.LastScannedEventName, m.LastScannedPlace, m.LastScannedAtUtc,
            m.Status, m.InactiveReason,
            m.CreatedAtUtc, m.UpdatedAtUtc);
    }
}
