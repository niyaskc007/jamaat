using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Contracts.BankAccounts;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;

namespace Jamaat.Application.BankAccounts;

public interface IBankAccountService
{
    Task<PagedResult<BankAccountDto>> ListAsync(BankAccountListQuery q, CancellationToken ct = default);
    Task<Result<BankAccountDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<BankAccountDto>> CreateAsync(CreateBankAccountDto dto, CancellationToken ct = default);
    Task<Result<BankAccountDto>> UpdateAsync(Guid id, UpdateBankAccountDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public interface IBankAccountRepository
{
    Task<BankAccount?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<bool> AccountNumberExistsAsync(string number, Guid? excludeId, CancellationToken ct = default);
    Task<PagedResult<BankAccountDto>> ListAsync(BankAccountListQuery q, CancellationToken ct = default);
    Task AddAsync(BankAccount e, CancellationToken ct = default);
    void Update(BankAccount e);
}

public sealed class BankAccountService(
    IBankAccountRepository repo, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateBankAccountDto> createV, IValidator<UpdateBankAccountDto> updateV) : IBankAccountService
{
    public Task<PagedResult<BankAccountDto>> ListAsync(BankAccountListQuery q, CancellationToken ct = default) => repo.ListAsync(q, ct);

    public async Task<Result<BankAccountDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        return e is null ? Error.NotFound("bank.not_found", "Bank account not found.") : Map(e, null);
    }

    public async Task<Result<BankAccountDto>> CreateAsync(CreateBankAccountDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (await repo.AccountNumberExistsAsync(dto.AccountNumber, null, ct))
            return Error.Conflict("bank.acctno_duplicate", $"Account number '{dto.AccountNumber}' already exists.");

        var e = new BankAccount(Guid.NewGuid(), tenant.TenantId, dto.Name, dto.BankName, dto.AccountNumber, dto.AccountingAccountId);
        e.Update(dto.Name, dto.BankName, dto.AccountNumber, dto.Branch, dto.Ifsc, dto.SwiftCode, dto.Currency, dto.AccountingAccountId, true);
        await repo.AddAsync(e, ct);
        await uow.SaveChangesAsync(ct);
        return Map(e, null);
    }

    public async Task<Result<BankAccountDto>> UpdateAsync(Guid id, UpdateBankAccountDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("bank.not_found", "Bank account not found.");
        if (e.AccountNumber != dto.AccountNumber && await repo.AccountNumberExistsAsync(dto.AccountNumber, id, ct))
            return Error.Conflict("bank.acctno_duplicate", $"Account number '{dto.AccountNumber}' already exists.");
        e.Update(dto.Name, dto.BankName, dto.AccountNumber, dto.Branch, dto.Ifsc, dto.SwiftCode, dto.Currency, dto.AccountingAccountId, dto.IsActive);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return Map(e, null);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Result.Failure(Error.NotFound("bank.not_found", "Bank account not found."));
        e.Update(e.Name, e.BankName, e.AccountNumber, e.Branch, e.Ifsc, e.SwiftCode, e.Currency, e.AccountingAccountId, false);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    internal static BankAccountDto Map(BankAccount e, string? accountingAccountName) =>
        new(e.Id, e.Name, e.BankName, e.AccountNumber, e.Branch, e.Ifsc, e.SwiftCode, e.Currency,
            e.AccountingAccountId, accountingAccountName, e.IsActive);
}

public sealed class CreateBankAccountValidator : AbstractValidator<CreateBankAccountDto>
{
    public CreateBankAccountValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.BankName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AccountNumber).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Currency).NotEmpty().Length(3);
    }
}

public sealed class UpdateBankAccountValidator : AbstractValidator<UpdateBankAccountDto>
{
    public UpdateBankAccountValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.BankName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AccountNumber).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Currency).NotEmpty().Length(3);
    }
}
