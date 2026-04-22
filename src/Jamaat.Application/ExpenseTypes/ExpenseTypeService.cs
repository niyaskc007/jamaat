using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Contracts.ExpenseTypes;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.ExpenseTypes;

public interface IExpenseTypeService
{
    Task<PagedResult<ExpenseTypeDto>> ListAsync(ExpenseTypeListQuery q, CancellationToken ct = default);
    Task<Result<ExpenseTypeDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<ExpenseTypeDto>> CreateAsync(CreateExpenseTypeDto dto, CancellationToken ct = default);
    Task<Result<ExpenseTypeDto>> UpdateAsync(Guid id, UpdateExpenseTypeDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class ExpenseTypeService(
    Persistence.JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateExpenseTypeDto> createV, IValidator<UpdateExpenseTypeDto> updateV) : IExpenseTypeService
{
    public async Task<PagedResult<ExpenseTypeDto>> ListAsync(ExpenseTypeListQuery q, CancellationToken ct = default)
    {
        IQueryable<ExpenseType> query = db.ExpenseTypes.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%") || EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);
        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(x => x.Code)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => new ExpenseTypeDto(
                x.Id, x.Code, x.Name, x.Description,
                x.DebitAccountId,
                db.Accounts.Where(a => a.Id == x.DebitAccountId).Select(a => a.Name).FirstOrDefault(),
                x.RequiresApproval, x.ApprovalThreshold, x.IsActive))
            .ToListAsync(ct);
        return new PagedResult<ExpenseTypeDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<ExpenseTypeDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.ExpenseTypes.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("expensetype.not_found", "Not found.");
        return Map(e, null);
    }

    public async Task<Result<ExpenseTypeDto>> CreateAsync(CreateExpenseTypeDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (await db.ExpenseTypes.AnyAsync(x => x.Code == dto.Code.ToUpperInvariant(), ct))
            return Error.Conflict("expensetype.code_duplicate", $"Code '{dto.Code}' already exists.");
        var e = new ExpenseType(Guid.NewGuid(), tenant.TenantId, dto.Code, dto.Name);
        e.Update(dto.Name, dto.Description, dto.DebitAccountId, dto.RequiresApproval, dto.ApprovalThreshold, true);
        db.ExpenseTypes.Add(e);
        await uow.SaveChangesAsync(ct);
        return Map(e, null);
    }

    public async Task<Result<ExpenseTypeDto>> UpdateAsync(Guid id, UpdateExpenseTypeDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var e = await db.ExpenseTypes.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("expensetype.not_found", "Not found.");
        e.Update(dto.Name, dto.Description, dto.DebitAccountId, dto.RequiresApproval, dto.ApprovalThreshold, dto.IsActive);
        db.ExpenseTypes.Update(e);
        await uow.SaveChangesAsync(ct);
        return Map(e, null);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.ExpenseTypes.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Result.Failure(Error.NotFound("expensetype.not_found", "Not found."));
        e.Update(e.Name, e.Description, e.DebitAccountId, e.RequiresApproval, e.ApprovalThreshold, false);
        db.ExpenseTypes.Update(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static ExpenseTypeDto Map(ExpenseType e, string? acctName) =>
        new(e.Id, e.Code, e.Name, e.Description, e.DebitAccountId, acctName,
            e.RequiresApproval, e.ApprovalThreshold, e.IsActive);
}

public sealed class CreateExpenseTypeValidator : AbstractValidator<CreateExpenseTypeDto>
{
    public CreateExpenseTypeValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}
public sealed class UpdateExpenseTypeValidator : AbstractValidator<UpdateExpenseTypeDto>
{
    public UpdateExpenseTypeValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}
