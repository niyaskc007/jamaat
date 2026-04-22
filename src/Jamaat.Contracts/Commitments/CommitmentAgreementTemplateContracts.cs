namespace Jamaat.Contracts.Commitments;

public sealed record CommitmentAgreementTemplateDto(
    Guid Id, string Code, string Name,
    Guid? FundTypeId, string? FundTypeCode, string? FundTypeName,
    string Language, string BodyMarkdown, int Version,
    bool IsDefault, bool IsActive, DateTimeOffset CreatedAtUtc);

public sealed record CreateCommitmentAgreementTemplateDto(
    string Code, string Name, string BodyMarkdown,
    string Language = "en", Guid? FundTypeId = null, bool IsDefault = false);

public sealed record UpdateCommitmentAgreementTemplateDto(
    string Name, string BodyMarkdown, string Language,
    Guid? FundTypeId, bool IsDefault, bool IsActive);

public sealed record CommitmentAgreementTemplateListQuery(
    int Page = 1, int PageSize = 25,
    string? Search = null, Guid? FundTypeId = null,
    string? Language = null, bool? Active = null);

/// <summary>Preview the rendered body with supplied placeholder values.</summary>
public sealed record RenderAgreementRequest(
    string BodyMarkdown,
    Dictionary<string, string> Values);

public sealed record RenderAgreementResponse(string RenderedText);
