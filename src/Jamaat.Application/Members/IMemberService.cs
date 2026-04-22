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
}
