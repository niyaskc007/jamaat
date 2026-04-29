using Jamaat.Application.Persistence;
using Jamaat.Contracts.FundTypes;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.FundTypes;

public interface IFundTypeCustomFieldService
{
    Task<IReadOnlyList<FundTypeCustomFieldDto>> ListAsync(Guid fundTypeId, bool? activeOnly, CancellationToken ct = default);
    Task<Result<FundTypeCustomFieldDto>> CreateAsync(CreateFundTypeCustomFieldDto dto, CancellationToken ct = default);
    Task<Result<FundTypeCustomFieldDto>> UpdateAsync(Guid id, UpdateFundTypeCustomFieldDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class FundTypeCustomFieldService(JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant) : IFundTypeCustomFieldService
{
    public async Task<IReadOnlyList<FundTypeCustomFieldDto>> ListAsync(Guid fundTypeId, bool? activeOnly, CancellationToken ct = default)
    {
        var q = db.FundTypeCustomFields.AsNoTracking().Where(f => f.FundTypeId == fundTypeId);
        if (activeOnly == true) q = q.Where(f => f.IsActive);
        var rows = await q.OrderBy(f => f.SortOrder).ThenBy(f => f.Label).ToListAsync(ct);
        return rows.Select(Map).ToList();
    }

    public async Task<Result<FundTypeCustomFieldDto>> CreateAsync(CreateFundTypeCustomFieldDto dto, CancellationToken ct = default)
    {
        // Validate the basics — keys must be code-friendly so frontend code can read them off the JSON.
        if (string.IsNullOrWhiteSpace(dto.FieldKey)) return Error.Validation("custom_field.key_required", "Field key is required.");
        var key = dto.FieldKey.Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(key, "^[A-Za-z][A-Za-z0-9_]*$"))
            return Error.Validation("custom_field.key_invalid", "Field key must start with a letter; letters/digits/underscore only.");
        if (string.IsNullOrWhiteSpace(dto.Label)) return Error.Validation("custom_field.label_required", "Label is required.");

        if (!await db.FundTypes.AnyAsync(f => f.Id == dto.FundTypeId, ct))
            return Error.NotFound("fundtype.not_found", "Fund type not found.");

        if (await db.FundTypeCustomFields.AnyAsync(f => f.FundTypeId == dto.FundTypeId && f.FieldKey == key, ct))
            return Error.Conflict("custom_field.duplicate", $"A custom field with key '{key}' already exists on this fund type.");

        var entity = new FundTypeCustomField(Guid.NewGuid(), tenant.TenantId, dto.FundTypeId, key, dto.Label, dto.FieldType);
        entity.Update(dto.Label, dto.FieldType, dto.IsRequired, dto.HelpText, dto.OptionsCsv, dto.DefaultValue, dto.SortOrder, isActive: true);
        db.FundTypeCustomFields.Add(entity);
        await uow.SaveChangesAsync(ct);
        return Map(entity);
    }

    public async Task<Result<FundTypeCustomFieldDto>> UpdateAsync(Guid id, UpdateFundTypeCustomFieldDto dto, CancellationToken ct = default)
    {
        var entity = await db.FundTypeCustomFields.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (entity is null) return Error.NotFound("custom_field.not_found", "Custom field not found.");
        entity.Update(dto.Label, dto.FieldType, dto.IsRequired, dto.HelpText, dto.OptionsCsv, dto.DefaultValue, dto.SortOrder, dto.IsActive);
        db.FundTypeCustomFields.Update(entity);
        await uow.SaveChangesAsync(ct);
        return Map(entity);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await db.FundTypeCustomFields.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("custom_field.not_found", "Custom field not found."));
        // We don't keep historical references on receipts when the field is deleted — but the
        // value is still in CustomFieldsJson if any older receipt captured it. Operators should
        // deactivate rather than delete to preserve schema-of-record semantics.
        db.FundTypeCustomFields.Remove(entity);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static FundTypeCustomFieldDto Map(FundTypeCustomField f) => new(
        f.Id, f.FundTypeId, f.FieldKey, f.Label, f.HelpText, f.FieldType, f.IsRequired,
        f.OptionsCsv, f.DefaultValue, f.SortOrder, f.IsActive, f.CreatedAtUtc);
}
