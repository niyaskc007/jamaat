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
    Task<Result<BulkVerifyResultDto>> VerifyDataBulkAsync(BulkVerifyRequestDto dto, CancellationToken ct = default);
    Task<Result<MemberProfileDto>> SetPhotoUrlAsync(Guid id, UploadPhotoDto dto, CancellationToken ct = default);
    Task<Result<MemberContributionSummaryDto>> GetContributionSummaryAsync(Guid id, CancellationToken ct = default);

    // --- Multi-education (item 6) -------------------------------------------
    Task<Result<IReadOnlyList<MemberEducationDto>>> ListEducationsAsync(Guid memberId, CancellationToken ct = default);
    Task<Result<MemberEducationDto>> AddEducationAsync(Guid memberId, AddMemberEducationDto dto, CancellationToken ct = default);
    Task<Result<MemberEducationDto>> UpdateEducationAsync(Guid memberId, Guid id, UpdateMemberEducationDto dto, CancellationToken ct = default);
    Task<Result> DeleteEducationAsync(Guid memberId, Guid id, CancellationToken ct = default);

    // --- Wealth (item C) ---------------------------------------------------
    Task<Result<IReadOnlyList<MemberAssetDto>>> ListAssetsAsync(Guid memberId, CancellationToken ct = default);
    Task<Result<MemberAssetDto>> AddAssetAsync(Guid memberId, AddMemberAssetDto dto, CancellationToken ct = default);
    Task<Result<MemberAssetDto>> UpdateAssetAsync(Guid memberId, Guid id, UpdateMemberAssetDto dto, CancellationToken ct = default);
    Task<Result> DeleteAssetAsync(Guid memberId, Guid id, CancellationToken ct = default);
}

public sealed class MemberProfileService(
    JamaatDbContextFacade db, IUnitOfWork uow, ICurrentUser currentUser, IClock clock,
    ITenantContext tenant) : IMemberProfileService
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
            dto.SpousePrefix, dto.SpouseName, dto.Surname,
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
        m.UpdateContact(dto.Phone, dto.WhatsAppNo, dto.Email,
            dto.LinkedInUrl, dto.FacebookUrl, dto.InstagramUrl, dto.TwitterUrl, dto.WebsiteUrl);
        db.Members.Update(m);
        await uow.SaveChangesAsync(ct);
        return await LoadProfileAsync(id, ct);
    }

    public async Task<Result<MemberProfileDto>> UpdateAddressAsync(Guid id, UpdateAddressDto dto, CancellationToken ct = default)
    {
        var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (m is null) return Error.NotFound("member.not_found", "Member not found.");
        m.UpdateAddress(dto.AddressLine, dto.Building, dto.Street, dto.Area, dto.City, dto.State, dto.Pincode,
            dto.HousingOwnership, dto.TypeOfHouse,
            dto.NumBedrooms, dto.NumBathrooms, dto.NumKitchens, dto.NumLivingRooms,
            dto.NumStories, dto.NumAirConditioners,
            dto.BuiltUpAreaSqft, dto.LandAreaSqft, dto.PropertyAgeYears,
            dto.HasElevator, dto.HasParking, dto.HasGarden,
            dto.EstimatedMarketValue, dto.PropertyNotes);
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
            dto.KarbalaZiyarat, dto.AsharaMubarakaCount,
            dto.HajjStatus, dto.HajjYear, dto.UmrahCount);
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

    public async Task<Result<BulkVerifyResultDto>> VerifyDataBulkAsync(BulkVerifyRequestDto dto, CancellationToken ct = default)
    {
        // Dedupe + cap to keep one request from dominating the thread pool or audit log.
        var ids = dto.MemberIds.Distinct().Take(500).ToArray();
        if (ids.Length == 0) return Error.Validation("member.bulk.empty", "No member ids supplied.");

        var now = DateOnly.FromDateTime(clock.UtcNow.UtcDateTime);
        var userId = currentUser.UserId;

        var members = await db.Members.Where(m => ids.Contains(m.Id) && !m.IsDeleted).ToListAsync(ct);
        var found = members.Select(m => m.Id).ToHashSet();
        var missing = ids.Where(id => !found.Contains(id)).ToArray();

        foreach (var m in members)
        {
            m.VerifyData(dto.Status, userId, now);
            db.Members.Update(m);
        }
        await uow.SaveChangesAsync(ct);

        return new BulkVerifyResultDto(members.Count, missing.Length, missing);
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
            m.SpousePrefix, m.SpouseName, m.Surname,
            m.TanzeemFileNo,
            m.FamilyId, familyName, familyCode, m.FamilyRole,
            m.FatherItsNumber, m.MotherItsNumber, m.SpouseItsNumber,
            m.DateOfBirth, m.AgeSnapshot, m.ComputeAge(today),
            m.Gender, m.MaritalStatus, m.BloodGroup,
            m.WarakatulTarkhisStatus,
            m.MisaqStatus, m.MisaqDate,
            m.DateOfNikah, m.DateOfNikahHijri,
            m.Phone, m.WhatsAppNo, m.Email,
            m.LinkedInUrl, m.FacebookUrl, m.InstagramUrl, m.TwitterUrl, m.WebsiteUrl,
            m.AddressLine, m.Building, m.Street, m.Area,
            m.City, m.State, m.Pincode,
            m.HousingOwnership, m.TypeOfHouse,
            m.NumBedrooms, m.NumBathrooms, m.NumKitchens, m.NumLivingRooms,
            m.NumStories, m.NumAirConditioners,
            m.BuiltUpAreaSqft, m.LandAreaSqft, m.PropertyAgeYears,
            m.HasElevator, m.HasParking, m.HasGarden,
            m.EstimatedMarketValue, m.PropertyNotes,
            m.Category, m.Idara, m.Vatan, m.Nationality,
            m.Jamaat, m.Jamiaat,
            m.SectorId, sectorCode, sectorName,
            m.SubSectorId, subCode, subName,
            m.Qualification, m.LanguagesCsv, m.HunarsCsv,
            m.Occupation, m.SubOccupation, m.SubOccupation2,
            m.QuranSanad, m.QadambosiSharaf, m.RaudatTaheraZiyarat, m.KarbalaZiyarat, m.AsharaMubarakaCount,
            m.HajjStatus, m.HajjYear, m.UmrahCount,
            m.DataVerificationStatus, m.DataVerifiedOn, null,
            m.PhotoVerificationStatus, m.PhotoVerifiedOn, null,
            m.PhotoUrl,
            m.LastScannedEventId, m.LastScannedEventName, m.LastScannedPlace, m.LastScannedAtUtc,
            m.Status, m.InactiveReason,
            m.CreatedAtUtc, m.UpdatedAtUtc);
    }

    // --- Multi-education methods ---------------------------------------------

    public async Task<Result<IReadOnlyList<MemberEducationDto>>> ListEducationsAsync(Guid memberId, CancellationToken ct = default)
    {
        if (!await db.Members.AsNoTracking().AnyAsync(m => m.Id == memberId, ct))
            return Error.NotFound("member.not_found", "Member not found.");
        var rows = await db.MemberEducations.AsNoTracking()
            .Where(e => e.MemberId == memberId)
            .OrderByDescending(e => e.IsHighest)
            .ThenByDescending(e => e.YearCompleted)
            .Select(e => new MemberEducationDto(
                e.Id, e.MemberId, e.Level, e.Degree, e.Institution, e.YearCompleted,
                e.Specialization, e.IsHighest))
            .ToListAsync(ct);
        return rows;
    }

    public async Task<Result<MemberEducationDto>> AddEducationAsync(Guid memberId, AddMemberEducationDto dto, CancellationToken ct = default)
    {
        if (!await db.Members.AsNoTracking().AnyAsync(m => m.Id == memberId, ct))
            return Error.NotFound("member.not_found", "Member not found.");
        // Only one row may be flagged "highest" per member; clear the flag elsewhere if this
        // entry claims it. Cleaner than a DB constraint and keeps existing rows valid.
        if (dto.IsHighest)
        {
            await db.MemberEducations
                .Where(e => e.MemberId == memberId && e.IsHighest)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.IsHighest, false), ct);
        }
        var e = new MemberEducation(Guid.NewGuid(), tenant.TenantId, memberId,
            dto.Level, dto.Degree, dto.Institution, dto.YearCompleted, dto.Specialization, dto.IsHighest);
        db.MemberEducations.Add(e);
        await uow.SaveChangesAsync(ct);
        return new MemberEducationDto(e.Id, e.MemberId, e.Level, e.Degree, e.Institution, e.YearCompleted, e.Specialization, e.IsHighest);
    }

    public async Task<Result<MemberEducationDto>> UpdateEducationAsync(Guid memberId, Guid id, UpdateMemberEducationDto dto, CancellationToken ct = default)
    {
        var e = await db.MemberEducations.FirstOrDefaultAsync(x => x.Id == id && x.MemberId == memberId, ct);
        if (e is null) return Error.NotFound("education.not_found", "Education entry not found for this member.");
        if (dto.IsHighest && !e.IsHighest)
        {
            await db.MemberEducations
                .Where(x => x.MemberId == memberId && x.IsHighest && x.Id != id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsHighest, false), ct);
        }
        e.Update(dto.Level, dto.Degree, dto.Institution, dto.YearCompleted, dto.Specialization, dto.IsHighest);
        db.MemberEducations.Update(e);
        await uow.SaveChangesAsync(ct);
        return new MemberEducationDto(e.Id, e.MemberId, e.Level, e.Degree, e.Institution, e.YearCompleted, e.Specialization, e.IsHighest);
    }

    public async Task<Result> DeleteEducationAsync(Guid memberId, Guid id, CancellationToken ct = default)
    {
        var e = await db.MemberEducations.FirstOrDefaultAsync(x => x.Id == id && x.MemberId == memberId, ct);
        if (e is null) return Result.Failure(Error.NotFound("education.not_found", "Education entry not found for this member."));
        db.MemberEducations.Remove(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    // --- Wealth methods ------------------------------------------------------

    public async Task<Result<IReadOnlyList<MemberAssetDto>>> ListAssetsAsync(Guid memberId, CancellationToken ct = default)
    {
        if (!await db.Members.AsNoTracking().AnyAsync(m => m.Id == memberId, ct))
            return Error.NotFound("member.not_found", "Member not found.");
        var rows = await db.MemberAssets.AsNoTracking()
            .Where(a => a.MemberId == memberId)
            .OrderByDescending(a => a.EstimatedValue ?? 0)
            .Select(a => new MemberAssetDto(a.Id, a.MemberId, a.Kind, a.Description,
                a.EstimatedValue, a.Currency, a.Notes, a.DocumentUrl))
            .ToListAsync(ct);
        return rows;
    }

    public async Task<Result<MemberAssetDto>> AddAssetAsync(Guid memberId, AddMemberAssetDto dto, CancellationToken ct = default)
    {
        if (!await db.Members.AsNoTracking().AnyAsync(m => m.Id == memberId, ct))
            return Error.NotFound("member.not_found", "Member not found.");
        var a = new MemberAsset(Guid.NewGuid(), tenant.TenantId, memberId,
            dto.Kind, dto.Description, dto.EstimatedValue, dto.Currency, dto.Notes, null);
        db.MemberAssets.Add(a);
        await uow.SaveChangesAsync(ct);
        return new MemberAssetDto(a.Id, a.MemberId, a.Kind, a.Description, a.EstimatedValue, a.Currency, a.Notes, a.DocumentUrl);
    }

    public async Task<Result<MemberAssetDto>> UpdateAssetAsync(Guid memberId, Guid id, UpdateMemberAssetDto dto, CancellationToken ct = default)
    {
        var a = await db.MemberAssets.FirstOrDefaultAsync(x => x.Id == id && x.MemberId == memberId, ct);
        if (a is null) return Error.NotFound("asset.not_found", "Asset not found for this member.");
        a.Update(dto.Kind, dto.Description, dto.EstimatedValue, dto.Currency, dto.Notes);
        db.MemberAssets.Update(a);
        await uow.SaveChangesAsync(ct);
        return new MemberAssetDto(a.Id, a.MemberId, a.Kind, a.Description, a.EstimatedValue, a.Currency, a.Notes, a.DocumentUrl);
    }

    public async Task<Result> DeleteAssetAsync(Guid memberId, Guid id, CancellationToken ct = default)
    {
        var a = await db.MemberAssets.FirstOrDefaultAsync(x => x.Id == id && x.MemberId == memberId, ct);
        if (a is null) return Result.Failure(Error.NotFound("asset.not_found", "Asset not found for this member."));
        db.MemberAssets.Remove(a);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }
}
