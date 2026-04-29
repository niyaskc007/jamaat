using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Contracts.Accounts;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;

namespace Jamaat.Application.Accounts;

public interface IAccountService
{
    Task<PagedResult<AccountDto>> ListAsync(AccountListQuery q, CancellationToken ct = default);
    Task<List<AccountTreeNodeDto>> TreeAsync(CancellationToken ct = default);
    Task<Result<AccountDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<AccountDto>> CreateAsync(CreateAccountDto dto, CancellationToken ct = default);
    Task<Result<AccountDto>> UpdateAsync(Guid id, UpdateAccountDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public interface IAccountRepository
{
    Task<Account?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<bool> CodeExistsAsync(string code, Guid? excludeId, CancellationToken ct = default);
    Task<bool> HasChildrenAsync(Guid id, CancellationToken ct = default);
    Task<PagedResult<AccountDto>> ListAsync(AccountListQuery q, CancellationToken ct = default);
    Task<List<AccountDto>> AllAsync(CancellationToken ct = default);
    Task AddAsync(Account e, CancellationToken ct = default);
    void Update(Account e);
}

public sealed class AccountService(
    IAccountRepository repo, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateAccountDto> createV, IValidator<UpdateAccountDto> updateV) : IAccountService
{
    public Task<PagedResult<AccountDto>> ListAsync(AccountListQuery q, CancellationToken ct = default) => repo.ListAsync(q, ct);

    public async Task<List<AccountTreeNodeDto>> TreeAsync(CancellationToken ct = default)
    {
        var all = await repo.AllAsync(ct);
        return BuildTree(all, null);
    }

    public async Task<Result<AccountDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        return e is null ? Error.NotFound("account.not_found", "Account not found.") : Map(e);
    }

    public async Task<Result<AccountDto>> CreateAsync(CreateAccountDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (await repo.CodeExistsAsync(dto.Code, null, ct))
            return Error.Conflict("account.code_duplicate", $"Account code '{dto.Code}' already exists.");

        var e = new Account(Guid.NewGuid(), tenant.TenantId, dto.Code, dto.Name, dto.Type, dto.ParentId);
        if (dto.IsControl) e.MarkControl();
        await repo.AddAsync(e, ct);
        await uow.SaveChangesAsync(ct);
        return Map(e);
    }

    public async Task<Result<AccountDto>> UpdateAsync(Guid id, UpdateAccountDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("account.not_found", "Account not found.");
        if (dto.ParentId == id) return Error.Validation("account.self_parent", "An account cannot be its own parent.");
        if (e.Code != dto.Code && await repo.CodeExistsAsync(dto.Code, id, ct))
            return Error.Conflict("account.code_duplicate", $"Account code '{dto.Code}' already exists.");

        // Use reflection-free approach - Account has no SetAll method yet. Mutate via internals only exposed here.
        typeof(Account).GetProperty(nameof(Account.Code))!.SetValue(e, dto.Code);
        typeof(Account).GetProperty(nameof(Account.Name))!.SetValue(e, dto.Name);
        typeof(Account).GetProperty(nameof(Account.Type))!.SetValue(e, dto.Type);
        typeof(Account).GetProperty(nameof(Account.ParentId))!.SetValue(e, dto.ParentId);
        typeof(Account).GetProperty(nameof(Account.IsControl))!.SetValue(e, dto.IsControl);
        typeof(Account).GetProperty(nameof(Account.IsActive))!.SetValue(e, dto.IsActive);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return Map(e);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Result.Failure(Error.NotFound("account.not_found", "Account not found."));
        if (await repo.HasChildrenAsync(id, ct))
            return Result.Failure(Error.Conflict("account.has_children", "Cannot deactivate an account that has child accounts."));
        e.Deactivate();
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static List<AccountTreeNodeDto> BuildTree(List<AccountDto> all, Guid? parentId)
    {
        return all.Where(a => a.ParentId == parentId)
            .OrderBy(a => a.Code)
            .Select(a => new AccountTreeNodeDto(a.Id, a.Code, a.Name, a.Type, a.ParentId, a.IsControl, a.IsActive, BuildTree(all, a.Id)))
            .ToList();
    }

    internal static AccountDto Map(Account e) => new(e.Id, e.Code, e.Name, e.Type, e.ParentId, null, e.IsControl, e.IsActive);
}

public sealed class CreateAccountValidator : AbstractValidator<CreateAccountDto>
{
    public CreateAccountValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Type).IsInEnum();
    }
}

public sealed class UpdateAccountValidator : AbstractValidator<UpdateAccountDto>
{
    public UpdateAccountValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Type).IsInEnum();
    }
}
