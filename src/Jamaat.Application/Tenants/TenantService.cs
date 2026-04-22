using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Tenants;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Tenants;

public interface ITenantService
{
    Task<Result<TenantDto>> GetCurrentAsync(CancellationToken ct = default);
    Task<Result<TenantDto>> UpdateCurrentAsync(UpdateTenantDto dto, CancellationToken ct = default);
}

public sealed class TenantService(JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant) : ITenantService
{
    public async Task<Result<TenantDto>> GetCurrentAsync(CancellationToken ct = default)
    {
        var t = await db.Tenants.AsNoTracking().IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == tenant.TenantId, ct);
        if (t is null) return Error.NotFound("tenant.not_found", "Tenant not found.");
        return Map(t);
    }

    public async Task<Result<TenantDto>> UpdateCurrentAsync(UpdateTenantDto dto, CancellationToken ct = default)
    {
        var t = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == tenant.TenantId, ct);
        if (t is null) return Error.NotFound("tenant.not_found", "Tenant not found.");
        if (string.IsNullOrWhiteSpace(dto.Name)) return Error.Validation("tenant.name_required", "Tenant name is required.");
        t.UpdateDetails(dto.Name, dto.Address, dto.Phone, dto.Email);
        t.SetJamiaat(dto.JamiaatCode, dto.JamiaatName);
        db.Tenants.Update(t);
        await uow.SaveChangesAsync(ct);
        return Map(t);
    }

    private static TenantDto Map(Jamaat.Domain.Entities.Tenant t) => new(
        t.Id, t.Code, t.Name, t.IsActive, t.BaseCurrency, t.Address, t.Phone, t.Email, t.LogoPath,
        t.JamiaatCode, t.JamiaatName, t.CreatedAtUtc, t.UpdatedAtUtc);
}
