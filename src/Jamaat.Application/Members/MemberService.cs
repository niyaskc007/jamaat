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

    public MemberService(
        IMemberRepository repo,
        IUnitOfWork uow,
        ITenantContext tenant,
        IValidator<CreateMemberDto> createValidator,
        IValidator<UpdateMemberDto> updateValidator)
    {
        _repo = repo;
        _uow = uow;
        _tenant = tenant;
        _createValidator = createValidator;
        _updateValidator = updateValidator;
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
