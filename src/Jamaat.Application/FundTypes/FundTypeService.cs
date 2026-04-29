using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.FundTypes;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.FundTypes;

public interface IFundTypeService
{
    Task<PagedResult<FundTypeDto>> ListAsync(FundTypeListQuery q, CancellationToken ct = default);
    Task<Result<FundTypeDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<FundTypeDto>> CreateAsync(CreateFundTypeDto dto, CancellationToken ct = default);
    Task<Result<FundTypeDto>> UpdateAsync(Guid id, UpdateFundTypeDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public interface IFundTypeRepository
{
    Task<FundType?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<bool> CodeExistsAsync(string code, Guid? excludeId, CancellationToken ct = default);
    Task<PagedResult<FundTypeDto>> ListAsync(FundTypeListQuery q, CancellationToken ct = default);
    Task AddAsync(FundType e, CancellationToken ct = default);
    void Update(FundType e);
}

public sealed class FundTypeService(
    IFundTypeRepository repo, IUnitOfWork uow, ITenantContext tenant,
    JamaatDbContextFacade db,
    IValidator<CreateFundTypeDto> createV, IValidator<UpdateFundTypeDto> updateV) : IFundTypeService
{
    public Task<PagedResult<FundTypeDto>> ListAsync(FundTypeListQuery q, CancellationToken ct = default) => repo.ListAsync(q, ct);

    public async Task<Result<FundTypeDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("fundtype.not_found", "Fund type not found.");
        return await MapWithCategoryAsync(e, ct);
    }

    public async Task<Result<FundTypeDto>> CreateAsync(CreateFundTypeDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (await repo.CodeExistsAsync(dto.Code.ToUpperInvariant(), null, ct))
            return Error.Conflict("fundtype.code_duplicate", $"Code '{dto.Code}' already exists.");

        var e = new FundType(Guid.NewGuid(), tenant.TenantId, dto.Code, dto.NameEnglish, dto.AllowedPaymentModes);
        e.UpdateNames(dto.NameEnglish, dto.NameArabic, dto.NameHindi, dto.NameUrdu, dto.Description);
        e.SetRules(dto.RequiresItsNumber, dto.RequiresPeriodReference, dto.AllowedPaymentModes, dto.RulesJson, dto.Category);
        e.ConfigureAccounting(dto.CreditAccountId, null, dto.LiabilityAccountId);
        await ApplyClassificationAsync(e, dto.FundCategoryId, dto.FundSubCategoryId,
            dto.IsReturnable, dto.RequiresAgreement, dto.RequiresMaturityTracking, dto.RequiresNiyyath, dto.RequiresApproval, ct);
        e.LinkEvent(dto.EventId);

        await repo.AddAsync(e, ct);
        await uow.SaveChangesAsync(ct);
        return await MapWithCategoryAsync(e, ct);
    }

    public async Task<Result<FundTypeDto>> UpdateAsync(Guid id, UpdateFundTypeDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("fundtype.not_found", "Fund type not found.");

        e.UpdateNames(dto.NameEnglish, dto.NameArabic, dto.NameHindi, dto.NameUrdu, dto.Description);
        e.SetRules(dto.RequiresItsNumber, dto.RequiresPeriodReference, dto.AllowedPaymentModes, dto.RulesJson, dto.Category);
        e.ConfigureAccounting(dto.CreditAccountId, null, dto.LiabilityAccountId);
        if (dto.IsActive) e.Activate(); else e.Deactivate();
        await ApplyClassificationAsync(e, dto.FundCategoryId, dto.FundSubCategoryId,
            dto.IsReturnable, dto.RequiresAgreement, dto.RequiresMaturityTracking, dto.RequiresNiyyath, dto.RequiresApproval, ct);
        e.LinkEvent(dto.EventId);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return await MapWithCategoryAsync(e, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Result.Failure(Error.NotFound("fundtype.not_found", "Fund type not found."));
        e.Deactivate();
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    /// Resolve the new master FundCategory + sub-category for the given DTO ids and write them
    /// to the entity. Validates that both belong to the current tenant; if FundCategoryId is
    /// null (legacy callers), skips the write - the legacy <see cref="FundCategory"/> enum stays
    /// authoritative until the caller is migrated.
    private async Task ApplyClassificationAsync(FundType e, Guid? fundCategoryId, Guid? fundSubCategoryId,
        bool isReturnable, bool requiresAgreement, bool requiresMaturity, bool requiresNiyyath, bool requiresApproval,
        CancellationToken ct)
    {
        if (fundCategoryId is null) return;
        var category = await db.FundCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == fundCategoryId.Value, ct)
            ?? throw new InvalidOperationException("Fund category not found.");
        if (fundSubCategoryId is Guid subId)
        {
            var sub = await db.FundSubCategories.AsNoTracking().FirstOrDefaultAsync(s => s.Id == subId, ct);
            if (sub is null || sub.FundCategoryId != category.Id)
                throw new InvalidOperationException("Sub-category does not belong to the chosen category.");
        }
        e.SetClassification(category.Id, fundSubCategoryId, category.Kind,
            isReturnable, requiresAgreement, requiresMaturity, requiresNiyyath, requiresApproval);
    }

    private async Task<FundTypeDto> MapWithCategoryAsync(FundType e, CancellationToken ct)
    {
        FundCategoryEntity? cat = null;
        FundSubCategory? sub = null;
        string? eventName = null;
        if (e.FundCategoryId is Guid cid)
            cat = await db.FundCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == cid, ct);
        if (e.FundSubCategoryId is Guid sid)
            sub = await db.FundSubCategories.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sid, ct);
        if (e.EventId is Guid eid)
            eventName = await db.Events.AsNoTracking().Where(ev => ev.Id == eid).Select(ev => ev.Name).FirstOrDefaultAsync(ct);
        return Map(e, cat, sub, eventName);
    }

    internal static FundTypeDto Map(FundType e, FundCategoryEntity? cat = null, FundSubCategory? sub = null, string? eventName = null) => new(
        e.Id, e.Code, e.NameEnglish, e.NameArabic, e.NameHindi, e.NameUrdu, e.Description,
        e.IsActive, e.RequiresItsNumber, e.RequiresPeriodReference, e.Category, e.IsLoan, (int)e.AllowedPaymentModes,
        e.CreditAccountId, null, e.DefaultTemplateId, e.RulesJson,
        e.FundCategoryId, cat?.Code, cat?.Name, cat?.Kind,
        e.FundSubCategoryId, sub?.Code, sub?.Name,
        e.IsReturnable, e.RequiresAgreement, e.RequiresMaturityTracking, e.RequiresNiyyath,
        e.EventId, eventName,
        e.LiabilityAccountId, null,
        e.RequiresApproval,
        e.CreatedAtUtc);
}

public sealed class CreateFundTypeValidator : AbstractValidator<CreateFundTypeDto>
{
    public CreateFundTypeValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32).Matches(@"^[A-Za-z0-9_-]+$");
        RuleFor(x => x.NameEnglish).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1000);
    }
}

public sealed class UpdateFundTypeValidator : AbstractValidator<UpdateFundTypeDto>
{
    public UpdateFundTypeValidator()
    {
        RuleFor(x => x.NameEnglish).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1000);
    }
}
