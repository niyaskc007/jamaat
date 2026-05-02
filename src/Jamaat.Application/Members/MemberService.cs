using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Domain.ValueObjects;

namespace Jamaat.Application.Members;

public sealed class MemberService : IMemberService
{
    private readonly IMemberRepository _repo;
    private readonly IUnitOfWork _uow;
    private readonly ITenantContext _tenant;
    private readonly IValidator<CreateMemberDto> _createValidator;
    private readonly IValidator<UpdateMemberDto> _updateValidator;
    private readonly IExcelReader _excelReader;
    private readonly IMemberLoginProvisioningService? _loginProvisioning;

    public MemberService(
        IMemberRepository repo,
        IUnitOfWork uow,
        ITenantContext tenant,
        IValidator<CreateMemberDto> createValidator,
        IValidator<UpdateMemberDto> updateValidator,
        IExcelReader excelReader,
        IMemberLoginProvisioningService? loginProvisioning = null)
    {
        _repo = repo;
        _uow = uow;
        _tenant = tenant;
        _createValidator = createValidator;
        _updateValidator = updateValidator;
        _excelReader = excelReader;
        _loginProvisioning = loginProvisioning;
    }

    public async Task<PagedResult<MemberDto>> ListAsync(MemberListQuery query, CancellationToken ct = default)
    {
        var pagedQuery = new MemberPageRequest
        {
            Page = query.Page,
            PageSize = query.PageSize,
            SortBy = query.SortBy,
            SortDir = Enum.TryParse<SortDirection>(query.SortDir, true, out var d) ? d : SortDirection.Asc,
            Search = query.Search,
            Status = query.Status,
            DataVerificationStatus = query.DataVerificationStatus,
        };
        return await _repo.ListAsync(pagedQuery, ct);
    }

    public async Task<Result<MemberDto>> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return Error.NotFound("member.not_found", "Member not found.");
        return Map(entity);
    }

    public async Task<Result<MemberDto>> CreateAsync(CreateMemberDto dto, CancellationToken ct = default)
    {
        await _createValidator.ValidateAndThrowAsync(dto, ct);

        if (!ItsNumber.TryCreate(dto.ItsNumber, out var its))
            return Error.Validation("member.its_invalid", "ITS number is invalid.");

        if (await _repo.ItsExistsAsync(its, null, ct))
            return Error.Conflict("member.its_duplicate", $"A member with ITS {its} already exists.");

        var member = new Member(Guid.NewGuid(), _tenant.TenantId, its, dto.FullName);
        member.UpdateName(dto.FullName, dto.FullNameArabic, dto.FullNameHindi, dto.FullNameUrdu);
        member.UpdateContact(dto.Phone, null, dto.Email);
        member.UpdateAddress(dto.Address, null, null, null, null, null, null, Jamaat.Domain.Enums.HousingOwnership.Unknown, Jamaat.Domain.Enums.TypeOfHouse.Unknown);
        if (dto.FamilyId is not null) member.LinkFamily(dto.FamilyId.Value);

        await _repo.AddAsync(member, ct);
        await _uow.SaveChangesAsync(ct);

        // Best-effort self-service login provisioning. If this throws (Identity unavailable,
        // role-claim hiccup), we do not fail the Member create - admins can re-provision later
        // via the bulk-enable flow. The failure is logged inside the service.
        if (_loginProvisioning is not null)
        {
            try { _ = await _loginProvisioning.ProvisionAsync(member, ct); }
            catch { /* swallowed - logged inside the service */ }
        }

        return Map(member);
    }

    public async Task<Result<MemberDto>> UpdateAsync(Guid id, UpdateMemberDto dto, CancellationToken ct = default)
    {
        await _updateValidator.ValidateAndThrowAsync(dto, ct);

        var member = await _repo.GetByIdAsync(id, ct);
        if (member is null) return Error.NotFound("member.not_found", "Member not found.");

        member.UpdateName(dto.FullName, dto.FullNameArabic, dto.FullNameHindi, dto.FullNameUrdu);
        member.UpdateContact(dto.Phone, null, dto.Email);
        member.UpdateAddress(dto.Address, null, null, null, null, null, null, Jamaat.Domain.Enums.HousingOwnership.Unknown, Jamaat.Domain.Enums.TypeOfHouse.Unknown);
        if (dto.FamilyId is not null) member.LinkFamily(dto.FamilyId.Value);
        member.ChangeStatus(dto.Status);

        _repo.Update(member);
        await _uow.SaveChangesAsync(ct);
        return Map(member);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var member = await _repo.GetByIdAsync(id, ct);
        if (member is null) return Result.Failure(Error.NotFound("member.not_found", "Member not found."));
        // Soft-delete: flip status to Inactive. Never hard-delete financial actors.
        member.ChangeStatus(MemberStatus.Inactive);
        _repo.Update(member);
        await _uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default)
    {
        // Each row → either an UPSERT by ITS number, or a per-row error. We accumulate
        // entities in memory and commit once at the end so a single SaveChanges runs.
        var rows = _excelReader.Read(xlsxStream);
        var errors = new List<ImportRowError>();
        var committed = 0;

        // Pre-load existing members for upsert. Small enough to fit in memory; if a Jamaat
        // grows past tens of thousands, this should switch to per-row lookups.
        var existing = await _repo.ListAsync(
            new MemberPageRequest { Page = 1, PageSize = 100_000 }, ct);
        var byIts = existing.Items.ToDictionary(m => m.ItsNumber, StringComparer.Ordinal);

        foreach (var row in rows)
        {
            try
            {
                var itsRaw = row.Get("ITS", "ItsNumber", "ITS Number") ?? "";
                if (string.IsNullOrWhiteSpace(itsRaw)) { errors.Add(new(row.RowNumber, "ITS is required.", "ITS")); continue; }
                if (!ItsNumber.TryCreate(itsRaw, out var its)) { errors.Add(new(row.RowNumber, $"ITS '{itsRaw}' is invalid (expected 8 digits).", "ITS")); continue; }

                var fullName = row.Get("Full name", "FullName", "Name");
                if (string.IsNullOrWhiteSpace(fullName)) { errors.Add(new(row.RowNumber, "Full name is required.", "Full name")); continue; }

                var arabic = row.Get("Arabic", "Full name (Arabic)", "FullNameArabic");
                var hindi = row.Get("Hindi", "FullNameHindi");
                var urdu = row.Get("Urdu", "FullNameUrdu");
                var phone = row.Get("Phone", "Mobile");
                var email = row.Get("Email");
                var address = row.Get("Address");

                if (byIts.TryGetValue(its.Value, out var existingDto))
                {
                    // Upsert: update by id
                    var entity = await _repo.GetByIdAsync(existingDto.Id, ct);
                    if (entity is null) { errors.Add(new(row.RowNumber, "Member disappeared mid-import.")); continue; }
                    entity.UpdateName(fullName, arabic, hindi, urdu);
                    entity.UpdateContact(phone, phone, email);
                    if (!string.IsNullOrWhiteSpace(address))
                        entity.UpdateAddress(address, null, null, null, null, null, null, HousingOwnership.Unknown, TypeOfHouse.Unknown);
                    _repo.Update(entity);
                }
                else
                {
                    var member = new Member(Guid.NewGuid(), _tenant.TenantId, its, fullName);
                    member.UpdateName(fullName, arabic, hindi, urdu);
                    member.UpdateContact(phone, phone, email);
                    if (!string.IsNullOrWhiteSpace(address))
                        member.UpdateAddress(address, null, null, null, null, null, null, HousingOwnership.Unknown, TypeOfHouse.Unknown);
                    await _repo.AddAsync(member, ct);
                    // Track so a duplicate ITS within the same upload is detected as error.
                    byIts[its.Value] = Map(member);
                }
                committed++;
            }
            catch (Exception ex)
            {
                errors.Add(new(row.RowNumber, ex.Message));
            }
        }

        if (committed > 0) await _uow.SaveChangesAsync(ct);

        // Auto-provision logins for any newly-added Members (idempotent - existing users skipped).
        // Best-effort: a provisioning failure does not roll back the import.
        if (committed > 0 && _loginProvisioning is not null)
        {
            try { _ = await _loginProvisioning.BackfillTenantAsync(ct); } catch { /* logged inside */ }
        }

        return new ImportResult(rows.Count, committed, errors);
    }

    private static MemberDto Map(Member m) => new(
        m.Id,
        m.ItsNumber.Value,
        m.FullName,
        m.FullNameArabic,
        m.FullNameHindi,
        m.FullNameUrdu,
        m.FamilyId,
        m.Phone,
        m.Email,
        m.AddressLine,
        m.Status,
        m.ExternalUserId,
        m.LastSyncedAtUtc,
        m.CreatedAtUtc,
        m.UpdatedAtUtc,
        m.DataVerificationStatus,
        m.DataVerifiedOn);
}

public sealed record MemberPageRequest : PagedQuery
{
    public MemberStatus? Status { get; init; }
    public VerificationStatus? DataVerificationStatus { get; init; }
}

public interface IMemberRepository
{
    Task<Member?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<bool> ItsExistsAsync(ItsNumber its, Guid? excludeId, CancellationToken ct = default);
    Task<PagedResult<MemberDto>> ListAsync(MemberPageRequest query, CancellationToken ct = default);
    Task AddAsync(Member member, CancellationToken ct = default);
    void Update(Member member);
}
