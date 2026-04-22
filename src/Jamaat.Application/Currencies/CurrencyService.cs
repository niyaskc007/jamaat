using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Currencies;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Currencies;

public interface ICurrencyService
{
    Task<IReadOnlyList<CurrencyDto>> ListAsync(bool? active, CancellationToken ct = default);
    Task<Result<CurrencyDto>> CreateAsync(CreateCurrencyDto dto, CancellationToken ct = default);
    Task<Result<CurrencyDto>> UpdateAsync(Guid id, UpdateCurrencyDto dto, CancellationToken ct = default);
    Task<Result<CurrencyDto>> SetBaseAsync(Guid id, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class CurrencyService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateCurrencyDto> createV, IValidator<UpdateCurrencyDto> updateV) : ICurrencyService
{
    public async Task<IReadOnlyList<CurrencyDto>> ListAsync(bool? active, CancellationToken ct = default)
    {
        IQueryable<Currency> q = db.Currencies.AsNoTracking();
        if (active is not null) q = q.Where(c => c.IsActive == active);
        return await q.OrderByDescending(c => c.IsBase).ThenBy(c => c.Code)
            .Select(c => new CurrencyDto(c.Id, c.Code, c.Name, c.Symbol, c.DecimalPlaces, c.IsActive, c.IsBase))
            .ToListAsync(ct);
    }

    public async Task<Result<CurrencyDto>> CreateAsync(CreateCurrencyDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var code = dto.Code.ToUpperInvariant();
        if (await db.Currencies.AnyAsync(c => c.Code == code, ct))
            return Error.Conflict("currency.code_duplicate", $"Currency '{code}' already exists.");
        var c = new Currency(Guid.NewGuid(), tenant.TenantId, code, dto.Name, dto.Symbol, dto.DecimalPlaces);
        db.Currencies.Add(c);
        await uow.SaveChangesAsync(ct);
        return Map(c);
    }

    public async Task<Result<CurrencyDto>> UpdateAsync(Guid id, UpdateCurrencyDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var c = await db.Currencies.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Error.NotFound("currency.not_found", "Currency not found.");
        c.Update(dto.Name, dto.Symbol, dto.DecimalPlaces, dto.IsActive);
        db.Currencies.Update(c);
        await uow.SaveChangesAsync(ct);
        return Map(c);
    }

    public async Task<Result<CurrencyDto>> SetBaseAsync(Guid id, CancellationToken ct = default)
    {
        var target = await db.Currencies.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (target is null) return Error.NotFound("currency.not_found", "Currency not found.");
        var all = await db.Currencies.ToListAsync(ct);
        foreach (var c in all) c.UnmarkBase();
        target.MarkBase();
        foreach (var c in all) db.Currencies.Update(c);

        // Also sync tenant.BaseCurrency for new transactions
        var t = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == tenant.TenantId, ct);
        if (t is not null)
        {
            typeof(Tenant).GetProperty(nameof(Tenant.BaseCurrency))!.SetValue(t, target.Code);
            db.Tenants.Update(t);
        }
        await uow.SaveChangesAsync(ct);
        return Map(target);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var c = await db.Currencies.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Result.Failure(Error.NotFound("currency.not_found", "Currency not found."));
        if (c.IsBase) return Result.Failure(Error.Business("currency.cannot_delete_base", "Cannot deactivate the base currency."));
        c.Update(c.Name, c.Symbol, c.DecimalPlaces, false);
        db.Currencies.Update(c);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static CurrencyDto Map(Currency c) => new(c.Id, c.Code, c.Name, c.Symbol, c.DecimalPlaces, c.IsActive, c.IsBase);
}

public interface IExchangeRateService
{
    Task<IReadOnlyList<ExchangeRateDto>> ListAsync(string? from, string? to, DateOnly? asOf, CancellationToken ct = default);
    Task<Result<ExchangeRateDto>> CreateAsync(CreateExchangeRateDto dto, CancellationToken ct = default);
    Task<Result<ExchangeRateDto>> UpdateAsync(Guid id, UpdateExchangeRateDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class ExchangeRateService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateExchangeRateDto> createV, IValidator<UpdateExchangeRateDto> updateV) : IExchangeRateService
{
    public async Task<IReadOnlyList<ExchangeRateDto>> ListAsync(string? from, string? to, DateOnly? asOf, CancellationToken ct = default)
    {
        IQueryable<ExchangeRate> q = db.ExchangeRates.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(from)) q = q.Where(r => r.FromCurrency == from.ToUpperInvariant());
        if (!string.IsNullOrWhiteSpace(to)) q = q.Where(r => r.ToCurrency == to.ToUpperInvariant());
        if (asOf is not null) q = q.Where(r => r.EffectiveFrom <= asOf && (r.EffectiveTo == null || r.EffectiveTo >= asOf));
        return await q.OrderByDescending(r => r.EffectiveFrom).ThenBy(r => r.FromCurrency).ThenBy(r => r.ToCurrency)
            .Select(r => new ExchangeRateDto(r.Id, r.FromCurrency, r.ToCurrency, r.Rate, r.EffectiveFrom, r.EffectiveTo, r.Source, r.IsActive))
            .ToListAsync(ct);
    }

    public async Task<Result<ExchangeRateDto>> CreateAsync(CreateExchangeRateDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (dto.FromCurrency.ToUpperInvariant() == dto.ToCurrency.ToUpperInvariant())
            return Error.Validation("rate.same_currency", "From and To currencies must differ.");
        var r = new ExchangeRate(Guid.NewGuid(), tenant.TenantId, dto.FromCurrency, dto.ToCurrency, dto.Rate, dto.EffectiveFrom, dto.EffectiveTo, dto.Source);
        db.ExchangeRates.Add(r);
        await uow.SaveChangesAsync(ct);
        return Map(r);
    }

    public async Task<Result<ExchangeRateDto>> UpdateAsync(Guid id, UpdateExchangeRateDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var r = await db.ExchangeRates.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Error.NotFound("rate.not_found", "Exchange rate not found.");
        r.Update(dto.Rate, dto.EffectiveFrom, dto.EffectiveTo, dto.Source, dto.IsActive);
        db.ExchangeRates.Update(r);
        await uow.SaveChangesAsync(ct);
        return Map(r);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var r = await db.ExchangeRates.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Result.Failure(Error.NotFound("rate.not_found", "Exchange rate not found."));
        r.Update(r.Rate, r.EffectiveFrom, r.EffectiveTo, r.Source, false);
        db.ExchangeRates.Update(r);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static ExchangeRateDto Map(ExchangeRate r) => new(r.Id, r.FromCurrency, r.ToCurrency, r.Rate, r.EffectiveFrom, r.EffectiveTo, r.Source, r.IsActive);
}

public sealed class CreateCurrencyValidator : AbstractValidator<CreateCurrencyDto>
{
    public CreateCurrencyValidator()
    {
        RuleFor(x => x.Code).NotEmpty().Length(3).Matches(@"^[A-Za-z]{3}$");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Symbol).NotEmpty().MaximumLength(8);
        RuleFor(x => x.DecimalPlaces).InclusiveBetween(0, 4);
    }
}
public sealed class UpdateCurrencyValidator : AbstractValidator<UpdateCurrencyDto>
{
    public UpdateCurrencyValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Symbol).NotEmpty().MaximumLength(8);
        RuleFor(x => x.DecimalPlaces).InclusiveBetween(0, 4);
    }
}
public sealed class CreateExchangeRateValidator : AbstractValidator<CreateExchangeRateDto>
{
    public CreateExchangeRateValidator()
    {
        RuleFor(x => x.FromCurrency).NotEmpty().Length(3);
        RuleFor(x => x.ToCurrency).NotEmpty().Length(3);
        RuleFor(x => x.Rate).GreaterThan(0);
        RuleFor(x => x.EffectiveFrom).NotEmpty();
    }
}
public sealed class UpdateExchangeRateValidator : AbstractValidator<UpdateExchangeRateDto>
{
    public UpdateExchangeRateValidator()
    {
        RuleFor(x => x.Rate).GreaterThan(0);
        RuleFor(x => x.EffectiveFrom).NotEmpty();
    }
}
