using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Commitments;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Commitments;

public interface ICommitmentAgreementTemplateService
{
    Task<PagedResult<CommitmentAgreementTemplateDto>> ListAsync(CommitmentAgreementTemplateListQuery q, CancellationToken ct = default);
    Task<Result<CommitmentAgreementTemplateDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<CommitmentAgreementTemplateDto>> CreateAsync(CreateCommitmentAgreementTemplateDto dto, CancellationToken ct = default);
    Task<Result<CommitmentAgreementTemplateDto>> UpdateAsync(Guid id, UpdateCommitmentAgreementTemplateDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetPlaceholdersAsync(CancellationToken ct = default);
    RenderAgreementResponse Render(RenderAgreementRequest req);
}

public sealed class CommitmentAgreementTemplateService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateCommitmentAgreementTemplateDto> createV,
    IValidator<UpdateCommitmentAgreementTemplateDto> updateV)
    : ICommitmentAgreementTemplateService
{
    public async Task<PagedResult<CommitmentAgreementTemplateDto>> ListAsync(CommitmentAgreementTemplateListQuery q, CancellationToken ct = default)
    {
        IQueryable<CommitmentAgreementTemplate> query = db.CommitmentAgreementTemplates.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(t => EF.Functions.Like(t.Name, $"%{s}%") || EF.Functions.Like(t.Code, $"%{s}%"));
        }
        if (q.FundTypeId is not null) query = query.Where(t => t.FundTypeId == q.FundTypeId);
        if (!string.IsNullOrWhiteSpace(q.Language)) query = query.Where(t => t.Language == q.Language);
        if (q.Active is not null) query = query.Where(t => t.IsActive == q.Active);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(t => t.IsDefault).ThenBy(t => t.Code)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(t => new CommitmentAgreementTemplateDto(
                t.Id, t.Code, t.Name,
                t.FundTypeId,
                db.FundTypes.Where(f => f.Id == t.FundTypeId).Select(f => f.Code).FirstOrDefault(),
                db.FundTypes.Where(f => f.Id == t.FundTypeId).Select(f => f.NameEnglish).FirstOrDefault(),
                t.Language, t.BodyMarkdown, t.Version, t.IsDefault, t.IsActive, t.CreatedAtUtc))
            .ToListAsync(ct);
        return new PagedResult<CommitmentAgreementTemplateDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<CommitmentAgreementTemplateDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var t = await db.CommitmentAgreementTemplates.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Error.NotFound("agreement_template.not_found", "Template not found.");
        var fund = t.FundTypeId is null ? null
            : await db.FundTypes.AsNoTracking().Where(f => f.Id == t.FundTypeId).Select(f => new { f.Code, f.NameEnglish }).FirstOrDefaultAsync(ct);
        return new CommitmentAgreementTemplateDto(t.Id, t.Code, t.Name, t.FundTypeId,
            fund?.Code, fund?.NameEnglish, t.Language, t.BodyMarkdown, t.Version, t.IsDefault, t.IsActive, t.CreatedAtUtc);
    }

    public async Task<Result<CommitmentAgreementTemplateDto>> CreateAsync(CreateCommitmentAgreementTemplateDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var code = dto.Code.ToUpperInvariant();
        if (await db.CommitmentAgreementTemplates.AnyAsync(t => t.Code == code, ct))
            return Error.Conflict("agreement_template.code_duplicate", $"Template code '{code}' already exists.");

        if (dto.FundTypeId is Guid ftId &&
            !await db.FundTypes.AnyAsync(f => f.Id == ftId, ct))
            return Error.Validation("agreement_template.fund_type_invalid", "Fund type not found.");

        var t = new CommitmentAgreementTemplate(Guid.NewGuid(), tenant.TenantId, code, dto.Name, dto.BodyMarkdown);
        t.Update(dto.Name, dto.BodyMarkdown, dto.Language, dto.FundTypeId, dto.IsDefault, true);
        if (dto.IsDefault) await ClearOtherDefaultsAsync(dto.FundTypeId, t.Id, ct);
        db.CommitmentAgreementTemplates.Add(t);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(t.Id, ct);
    }

    public async Task<Result<CommitmentAgreementTemplateDto>> UpdateAsync(Guid id, UpdateCommitmentAgreementTemplateDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var t = await db.CommitmentAgreementTemplates.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Error.NotFound("agreement_template.not_found", "Template not found.");
        if (dto.FundTypeId is Guid ftId &&
            !await db.FundTypes.AnyAsync(f => f.Id == ftId, ct))
            return Error.Validation("agreement_template.fund_type_invalid", "Fund type not found.");

        t.Update(dto.Name, dto.BodyMarkdown, dto.Language, dto.FundTypeId, dto.IsDefault, dto.IsActive);
        if (dto.IsDefault) await ClearOtherDefaultsAsync(dto.FundTypeId, t.Id, ct);
        db.CommitmentAgreementTemplates.Update(t);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(t.Id, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var t = await db.CommitmentAgreementTemplates.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Result.Failure(Error.NotFound("agreement_template.not_found", "Template not found."));

        var inUse = await db.Commitments.AnyAsync(c => c.AgreementTemplateId == id, ct);
        if (inUse)
        {
            t.Update(t.Name, t.BodyMarkdown, t.Language, t.FundTypeId, t.IsDefault, false);
            db.CommitmentAgreementTemplates.Update(t);
        }
        else
        {
            db.CommitmentAgreementTemplates.Remove(t);
        }
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public Task<IReadOnlyList<string>> GetPlaceholdersAsync(CancellationToken ct = default)
        => Task.FromResult(AgreementRenderer.KnownPlaceholders);

    public RenderAgreementResponse Render(RenderAgreementRequest req)
        => new(AgreementRenderer.Render(req.BodyMarkdown, req.Values));

    private async Task ClearOtherDefaultsAsync(Guid? fundTypeId, Guid keepId, CancellationToken ct)
    {
        var others = await db.CommitmentAgreementTemplates
            .Where(t => t.Id != keepId && t.FundTypeId == fundTypeId && t.IsDefault)
            .ToListAsync(ct);
        foreach (var o in others)
        {
            o.Update(o.Name, o.BodyMarkdown, o.Language, o.FundTypeId, false, o.IsActive);
            db.CommitmentAgreementTemplates.Update(o);
        }
    }
}

public sealed class CreateCommitmentAgreementTemplateValidator : AbstractValidator<CreateCommitmentAgreementTemplateDto>
{
    public CreateCommitmentAgreementTemplateValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.BodyMarkdown).NotEmpty();
        RuleFor(x => x.Language).NotEmpty().MaximumLength(10);
    }
}

public sealed class UpdateCommitmentAgreementTemplateValidator : AbstractValidator<UpdateCommitmentAgreementTemplateDto>
{
    public UpdateCommitmentAgreementTemplateValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.BodyMarkdown).NotEmpty();
        RuleFor(x => x.Language).NotEmpty().MaximumLength(10);
    }
}
