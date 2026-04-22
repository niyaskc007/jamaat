namespace Jamaat.Contracts.Sectors;

public sealed record SectorDto(
    Guid Id, string Code, string Name,
    Guid? MaleInchargeMemberId, string? MaleInchargeItsNumber, string? MaleInchargeName,
    Guid? FemaleInchargeMemberId, string? FemaleInchargeItsNumber, string? FemaleInchargeName,
    string? Notes, bool IsActive, int SubSectorCount, int MemberCount, DateTimeOffset CreatedAtUtc);

public sealed record CreateSectorDto(string Code, string Name, Guid? MaleInchargeMemberId = null, Guid? FemaleInchargeMemberId = null, string? Notes = null);
public sealed record UpdateSectorDto(string Name, Guid? MaleInchargeMemberId, Guid? FemaleInchargeMemberId, string? Notes, bool IsActive);

public sealed record SubSectorDto(
    Guid Id, Guid SectorId, string SectorCode, string SectorName,
    string Code, string Name,
    Guid? MaleInchargeMemberId, string? MaleInchargeName,
    Guid? FemaleInchargeMemberId, string? FemaleInchargeName,
    string? Notes, bool IsActive, int MemberCount, DateTimeOffset CreatedAtUtc);

public sealed record CreateSubSectorDto(Guid SectorId, string Code, string Name, Guid? MaleInchargeMemberId = null, Guid? FemaleInchargeMemberId = null, string? Notes = null);
public sealed record UpdateSubSectorDto(string Name, Guid? MaleInchargeMemberId, Guid? FemaleInchargeMemberId, string? Notes, bool IsActive);

public sealed record SectorListQuery(int Page = 1, int PageSize = 50, string? Search = null, bool? Active = null);
public sealed record SubSectorListQuery(int Page = 1, int PageSize = 50, Guid? SectorId = null, string? Search = null, bool? Active = null);
