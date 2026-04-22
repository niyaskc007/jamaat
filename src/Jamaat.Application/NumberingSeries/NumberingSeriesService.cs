using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Contracts.NumberingSeries;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using JmDomain = Jamaat.Domain.Entities;

namespace Jamaat.Application.NumberingSeries;

public interface INumberingSeriesService
{
    Task<PagedResult<NumberingSeriesDto>> ListAsync(NumberingSeriesListQuery q, CancellationToken ct = default);
    Task<Result<NumberingSeriesDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<NumberingSeriesDto>> CreateAsync(CreateNumberingSeriesDto dto, CancellationToken ct = default);
    Task<Result<NumberingSeriesDto>> UpdateAsync(Guid id, UpdateNumberingSeriesDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public interface INumberingSeriesRepository
{
    Task<JmDomain.NumberingSeries?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<PagedResult<NumberingSeriesDto>> ListAsync(NumberingSeriesListQuery q, CancellationToken ct = default);
    Task AddAsync(JmDomain.NumberingSeries e, CancellationToken ct = default);
    void Update(JmDomain.NumberingSeries e);
}

public sealed class NumberingSeriesService(
    INumberingSeriesRepository repo, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateNumberingSeriesDto> createV, IValidator<UpdateNumberingSeriesDto> updateV) : INumberingSeriesService
{
    public Task<PagedResult<NumberingSeriesDto>> ListAsync(NumberingSeriesListQuery q, CancellationToken ct = default) => repo.ListAsync(q, ct);

    public async Task<Result<NumberingSeriesDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        return e is null ? Error.NotFound("numseries.not_found", "Numbering series not found.") : Map(e, null);
    }

    public async Task<Result<NumberingSeriesDto>> CreateAsync(CreateNumberingSeriesDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var e = new JmDomain.NumberingSeries(Guid.NewGuid(), tenant.TenantId, dto.Scope, dto.Name, dto.Prefix, dto.PadLength, dto.YearReset, dto.FundTypeId);
        await repo.AddAsync(e, ct);
        await uow.SaveChangesAsync(ct);
        return Map(e, null);
    }

    public async Task<Result<NumberingSeriesDto>> UpdateAsync(Guid id, UpdateNumberingSeriesDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("numseries.not_found", "Numbering series not found.");
        e.Update(dto.Name, dto.Prefix, dto.PadLength, dto.YearReset, dto.IsActive);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return Map(e, null);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Result.Failure(Error.NotFound("numseries.not_found", "Numbering series not found."));
        e.Update(e.Name, e.Prefix, e.PadLength, e.YearReset, false);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    internal static NumberingSeriesDto Map(JmDomain.NumberingSeries e, string? fundTypeName) =>
        new(e.Id, e.Scope, e.Name, e.FundTypeId, fundTypeName, e.Prefix, e.PadLength, e.YearReset,
            e.CurrentValue, e.CurrentYear, e.IsActive,
            Preview(e));

    private static string Preview(JmDomain.NumberingSeries e)
    {
        var next = (e.CurrentValue + 1).ToString(System.Globalization.CultureInfo.InvariantCulture).PadLeft(e.PadLength, '0');
        return e.YearReset ? $"{e.Prefix}{e.CurrentYear % 100:D2}-{next}" : $"{e.Prefix}{next}";
    }
}

public sealed class CreateNumberingSeriesValidator : AbstractValidator<CreateNumberingSeriesDto>
{
    public CreateNumberingSeriesValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Prefix).NotEmpty().MaximumLength(32);
        RuleFor(x => x.PadLength).InclusiveBetween(1, 12);
        RuleFor(x => x.Scope).IsInEnum();
    }
}

public sealed class UpdateNumberingSeriesValidator : AbstractValidator<UpdateNumberingSeriesDto>
{
    public UpdateNumberingSeriesValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Prefix).NotEmpty().MaximumLength(32);
        RuleFor(x => x.PadLength).InclusiveBetween(1, 12);
    }
}
