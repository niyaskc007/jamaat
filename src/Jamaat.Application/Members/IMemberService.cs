using Jamaat.Application.Common;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Common;

namespace Jamaat.Application.Members;

public interface IMemberService
{
    Task<PagedResult<MemberDto>> ListAsync(MemberListQuery query, CancellationToken ct = default);
    Task<Result<MemberDto>> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Result<MemberDto>> CreateAsync(CreateMemberDto dto, CancellationToken ct = default);
    Task<Result<MemberDto>> UpdateAsync(Guid id, UpdateMemberDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
    /// <summary>Bulk-import members from an XLSX upload - used as the "ITS sync via Excel" workflow.</summary>
    /// <remarks>
    /// Upserts by ITS number: existing rows are updated in place, new rows are created.
    /// Per-row validation is collected in the result; rows with errors are skipped while
    /// the rest commit in one transaction.
    /// </remarks>
    Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default);
}
