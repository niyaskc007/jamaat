namespace Jamaat.Contracts.Tenants;

public sealed record TenantDto(
    Guid Id, string Code, string Name, bool IsActive,
    string? BaseCurrency, string? Address, string? Phone, string? Email, string? LogoPath,
    string? JamiaatCode, string? JamiaatName,
    DateTimeOffset CreatedAtUtc, DateTimeOffset? UpdatedAtUtc);

public sealed record UpdateTenantDto(
    string Name, string? Address, string? Phone, string? Email,
    string? JamiaatCode, string? JamiaatName);
