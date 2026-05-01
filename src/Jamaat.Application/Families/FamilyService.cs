using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Families;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Families;

public interface IFamilyService
{
    Task<PagedResult<FamilyDto>> ListAsync(FamilyListQuery q, CancellationToken ct = default);
    Task<Result<FamilyDetailDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<FamilyDto>> CreateAsync(CreateFamilyDto dto, CancellationToken ct = default);
    Task<Result<FamilyDto>> UpdateAsync(Guid id, UpdateFamilyDto dto, CancellationToken ct = default);
    Task<Result> AssignMemberAsync(Guid familyId, AssignMemberToFamilyDto dto, CancellationToken ct = default);
    Task<Result> RemoveMemberAsync(Guid familyId, Guid memberId, CancellationToken ct = default);
    /// <summary>Remove an extended-kinship link without touching the linked member's household.</summary>
    Task<Result> RemoveLinkAsync(Guid familyId, Guid linkId, CancellationToken ct = default);
    Task<Result> TransferHeadshipAsync(Guid familyId, TransferHeadshipDto dto, CancellationToken ct = default);
    /// <summary>Spin a member (and optionally a spouse) out of <paramref name="sourceFamilyId"/> into
    /// a new household with the spun-off member as head. Lineage ITS pointers are left intact so the
    /// extended tree still bridges the two families.</summary>
    Task<Result<FamilyDto>> SpinOffAsync(Guid sourceFamilyId, SpinOffFamilyDto dto, CancellationToken ct = default);
    /// <summary>Build the extended descendant tree rooted at <paramref name="familyId"/>'s head. Crosses
    /// household boundaries by walking <c>FatherItsNumber</c> / <c>MotherItsNumber</c> in reverse.</summary>
    Task<Result<FamilyExtendedTreeDto>> GetExtendedTreeAsync(Guid familyId, CancellationToken ct = default);
    /// <summary>Bulk-import families from XLSX. Each row references a head ITS - that member must already exist.</summary>
    Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default);
}

public sealed class FamilyService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateFamilyDto> createV, IValidator<UpdateFamilyDto> updateV,
    IExcelReader excelReader) : IFamilyService
{
    public async Task<PagedResult<FamilyDto>> ListAsync(FamilyListQuery q, CancellationToken ct = default)
    {
        IQueryable<Family> query = db.Families.AsNoTracking();
        if (q.Active is not null) query = query.Where(f => f.IsActive == q.Active);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(f => EF.Functions.Like(f.FamilyName, $"%{s}%") || EF.Functions.Like(f.Code, $"%{s}%"));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(f => f.FamilyName)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(f => new FamilyDto(
                f.Id, f.Code, f.FamilyName, f.HeadMemberId, f.HeadItsNumber,
                db.Members.Where(m => m.Id == f.HeadMemberId).Select(m => m.FullName).FirstOrDefault(),
                f.ContactPhone, f.ContactEmail, f.Address, f.Notes, f.IsActive,
                db.Members.Count(m => m.FamilyId == f.Id && !m.IsDeleted),
                f.CreatedAtUtc))
            .ToListAsync(ct);
        return new PagedResult<FamilyDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<FamilyDetailDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var f = await db.Families.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (f is null) return Error.NotFound("family.not_found", "Family not found.");
        var members = await db.Members.AsNoTracking()
            .Where(m => m.FamilyId == id && !m.IsDeleted)
            .OrderBy(m => m.FamilyRole)
            .Select(m => new FamilyMemberDto(m.Id, m.ItsNumber.Value, m.FullName, m.FamilyRole, m.Id == f.HeadMemberId))
            .ToListAsync(ct);
        var headName = members.FirstOrDefault(m => m.IsHead)?.FullName;

        // Extended-kinship links: relatives whose primary household is elsewhere. Join to
        // Members to surface the linked member's name + ITS, then to Families to resolve their
        // current household code/name for the "Lives in F-XXX" tag in the UI.
        var links = await (
            from l in db.FamilyMemberLinks.AsNoTracking().Where(l => l.FamilyId == id)
            join m in db.Members.AsNoTracking() on l.MemberId equals m.Id
            join cf in db.Families.AsNoTracking() on m.FamilyId equals cf.Id into cfg
            from cf in cfg.DefaultIfEmpty()
            orderby l.Role, m.FullName
            select new FamilyExtendedLinkDto(
                l.Id, l.MemberId, m.ItsNumber.Value, m.FullName, l.Role,
                m.FamilyId, cf == null ? null : cf.Code, cf == null ? null : cf.FamilyName))
            .ToListAsync(ct);

        return new FamilyDetailDto(
            new FamilyDto(f.Id, f.Code, f.FamilyName, f.HeadMemberId, f.HeadItsNumber, headName,
                f.ContactPhone, f.ContactEmail, f.Address, f.Notes, f.IsActive, members.Count, f.CreatedAtUtc),
            members,
            links);
    }

    public async Task<Result<FamilyDto>> CreateAsync(CreateFamilyDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var head = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.HeadMemberId && !m.IsDeleted, ct);
        if (head is null) return Error.NotFound("member.not_found", "Head member not found.");

        var code = await NextCodeAsync(ct);
        var family = new Family(Guid.NewGuid(), tenant.TenantId, code, dto.FamilyName, head.Id);
        family.UpdateDetails(dto.FamilyName, dto.ContactPhone, dto.ContactEmail, dto.Address, dto.Notes);
        family.SetHead(head.Id, head.ItsNumber.Value);
        db.Families.Add(family);
        head.LinkFamily(family.Id, FamilyRole.Head);
        db.Members.Update(head);
        await uow.SaveChangesAsync(ct);

        return new FamilyDto(family.Id, family.Code, family.FamilyName, family.HeadMemberId, family.HeadItsNumber,
            head.FullName, family.ContactPhone, family.ContactEmail, family.Address, family.Notes, family.IsActive, 1, family.CreatedAtUtc);
    }

    public async Task<Result<FamilyDto>> UpdateAsync(Guid id, UpdateFamilyDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (family is null) return Error.NotFound("family.not_found", "Family not found.");
        family.UpdateDetails(dto.FamilyName, dto.ContactPhone, dto.ContactEmail, dto.Address, dto.Notes);
        if (dto.IsActive) family.Activate(); else family.Deactivate();
        db.Families.Update(family);
        await uow.SaveChangesAsync(ct);
        var head = await db.Members.Where(m => m.Id == family.HeadMemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct);
        var count = await db.Members.CountAsync(m => m.FamilyId == family.Id && !m.IsDeleted, ct);
        return new FamilyDto(family.Id, family.Code, family.FamilyName, family.HeadMemberId, family.HeadItsNumber, head,
            family.ContactPhone, family.ContactEmail, family.Address, family.Notes, family.IsActive, count, family.CreatedAtUtc);
    }

    public async Task<Result> AssignMemberAsync(Guid familyId, AssignMemberToFamilyDto dto, CancellationToken ct = default)
    {
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct);
        if (family is null) return Result.Failure(Error.NotFound("family.not_found", "Family not found."));
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.MemberId && !m.IsDeleted, ct);
        if (member is null) return Result.Failure(Error.NotFound("member.not_found", "Member not found."));

        // Active-status guard applies to both household and link paths - suspended/deceased
        // relatives shouldn't be added to anyone's roster or relationship graph.
        if (member.Status != Domain.Enums.MemberStatus.Active)
            return Result.Failure(Error.Business("member.not_active",
                $"Member status is {member.Status}; only Active members can be added to a family."));

        // Extended-kinship branch: record a link without touching the member's household.
        // Used when the operator picks "uncle / aunt / niece / etc. who lives elsewhere".
        // No FamilyId change, no role overwrite on the member - just a (Family, Member, Role)
        // row that the family detail page surfaces under "Extended family".
        if (dto.LinkOnly)
        {
            // Linking the head as anything is meaningless - they're already canonically Head.
            if (family.HeadMemberId == member.Id)
                return Result.Failure(Error.Business("link.is_head",
                    "This member is the head of this family - extended links to the head are redundant."));
            // Head role is reserved for the household path (managed via TransferHeadship).
            if (dto.Role == FamilyRole.Head)
                return Result.Failure(Error.Business("link.head_role",
                    "Use a non-head role for an extended link; head is reserved for household members."));
            // A member who lives in this family already shouldn't also be linked as extended -
            // the household roster captures them. Avoid the double-count.
            if (member.FamilyId == familyId)
                return Result.Failure(Error.Business("link.already_in_household",
                    "This member already lives in this family. Edit their role from the household roster instead."));
            // Dedupe per (Family, Member): the unique index would catch this anyway, but a
            // friendly business error beats a 500 from a constraint violation.
            var exists = await db.FamilyMemberLinks
                .AnyAsync(l => l.FamilyId == familyId && l.MemberId == member.Id, ct);
            if (exists)
                return Result.Failure(Error.Business("link.exists",
                    "An extended-family link to this member already exists. Remove the existing link first to change the role."));

            var link = new FamilyMemberLink(Guid.NewGuid(), tenant.TenantId, familyId, member.Id, dto.Role);
            db.FamilyMemberLinks.Add(link);
            await uow.SaveChangesAsync(ct);
            return Result.Success();
        }

        // Household branch (the original behaviour) - moves the member into this household.

        // The head is, by definition, already a member of their own family. Adding them
        // again with a non-head role would silently re-tag the head as Spouse / Other.
        if (family.HeadMemberId == member.Id && dto.Role != FamilyRole.Head)
            return Result.Failure(Error.Business("family.head_already_member",
                "This member is the head of the family. Use Transfer headship to replace them; you can't re-tag the head as another role."));

        // Different family already - household path won't auto-move; the operator either
        // removes them from the current family first, or chooses LinkOnly to record an
        // extended-kinship relationship without changing residency.
        if (member.FamilyId.HasValue && member.FamilyId != familyId)
            return Result.Failure(Error.Business("member.in_other_family",
                "Member is already in another family. Remove them from that family first, or add them as an extended-family link instead."));

        // Already in this family with the same role - duplicate request, harmless but noisy.
        if (member.FamilyId == familyId && member.FamilyRole == dto.Role)
            return Result.Failure(Error.Business("family.member_already_assigned",
                $"This member is already in the family with role {dto.Role}. Pick a different role or remove them first."));

        // Head reassignment is gated to TransferHeadship (which manages both old + new head).
        if (dto.Role == FamilyRole.Head && family.HeadMemberId != member.Id)
            return Result.Failure(Error.Business("family.head_conflict",
                "Use Transfer headship to change the head."));

        member.LinkFamily(familyId, dto.Role);

        // Auto-stamp lineage ITS pointers for roles whose parental relationship to the head is
        // unambiguous. Pointers are never overwritten - if the operator already set deliberate
        // values (e.g. step-parent or unusual lineage) those win.
        //
        // Rules:
        //   Son / Daughter / SonInLaw / DaughterInLaw  → new member's Father/Mother := head + head's spouse
        //   Father                                     → head's Father := new member
        //   Mother                                     → head's Mother := new member
        //   Brother / Sister                           → new member's Father/Mother := head's Father/Mother
        //
        // Other roles (GrandFather, GrandSon, Uncle, etc.) span more than one hop and would require
        // the operator to disambiguate which ancestor / descendant chain to attach to - those stay
        // manual via the linked person's profile.
        await AutoStampLineageAsync(family, member, dto.Role, ct);

        db.Members.Update(member);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    /// <summary>Auto-fill lineage ITS pointers for a freshly-assigned household member based on
    /// the role they were given. Caller is responsible for the SaveChangesAsync after.</summary>
    private async Task AutoStampLineageAsync(Family family, Member member, FamilyRole role, CancellationToken ct)
    {
        if (!family.HeadMemberId.HasValue) return;
        var head = await db.Members.FirstOrDefaultAsync(h => h.Id == family.HeadMemberId.Value, ct);
        if (head is null) return;

        // 1. Children of the head's couple.
        if (role is FamilyRole.Son or FamilyRole.Daughter or FamilyRole.SonInLaw or FamilyRole.DaughterInLaw)
        {
            var newFather = string.IsNullOrEmpty(member.FatherItsNumber) ? head.ItsNumber.Value : member.FatherItsNumber;
            var newMother = string.IsNullOrEmpty(member.MotherItsNumber) ? head.SpouseItsNumber : member.MotherItsNumber;
            if (newFather != member.FatherItsNumber || newMother != member.MotherItsNumber)
                member.UpdateFamilyRefs(newFather, newMother, member.SpouseItsNumber);
            return;
        }

        // 2. Head's parents - stamp the HEAD's lineage to point at this newly-added member.
        // Father / Mother are the only parent-side roles in the enum; no gender-vs-role check
        // required (Father → father slot, Mother → mother slot).
        if (role == FamilyRole.Father)
        {
            if (string.IsNullOrEmpty(head.FatherItsNumber))
            {
                head.UpdateFamilyRefs(member.ItsNumber.Value, head.MotherItsNumber, head.SpouseItsNumber);
                db.Members.Update(head);
            }
            return;
        }
        if (role == FamilyRole.Mother)
        {
            if (string.IsNullOrEmpty(head.MotherItsNumber))
            {
                head.UpdateFamilyRefs(head.FatherItsNumber, member.ItsNumber.Value, head.SpouseItsNumber);
                db.Members.Update(head);
            }
            return;
        }

        // 3. Siblings of the head - they share the same parents.
        if (role is FamilyRole.Brother or FamilyRole.Sister)
        {
            var newFather = string.IsNullOrEmpty(member.FatherItsNumber) ? head.FatherItsNumber : member.FatherItsNumber;
            var newMother = string.IsNullOrEmpty(member.MotherItsNumber) ? head.MotherItsNumber : member.MotherItsNumber;
            if (newFather != member.FatherItsNumber || newMother != member.MotherItsNumber)
                member.UpdateFamilyRefs(newFather, newMother, member.SpouseItsNumber);
            return;
        }
    }

    public async Task<Result> RemoveLinkAsync(Guid familyId, Guid linkId, CancellationToken ct = default)
    {
        var link = await db.FamilyMemberLinks.FirstOrDefaultAsync(l => l.Id == linkId && l.FamilyId == familyId, ct);
        if (link is null) return Result.Failure(Error.NotFound("link.not_found", "Extended link not found."));
        db.FamilyMemberLinks.Remove(link);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> RemoveMemberAsync(Guid familyId, Guid memberId, CancellationToken ct = default)
    {
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct);
        if (family is null) return Result.Failure(Error.NotFound("family.not_found", "Family not found."));
        if (family.HeadMemberId == memberId)
            return Result.Failure(Error.Business("family.head_cannot_remove", "Transfer headship before removing the head."));
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == memberId && m.FamilyId == familyId, ct);
        if (member is null) return Result.Failure(Error.NotFound("member.not_in_family", "Member is not in this family."));
        member.UnlinkFamily();
        db.Members.Update(member);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> TransferHeadshipAsync(Guid familyId, TransferHeadshipDto dto, CancellationToken ct = default)
    {
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct);
        if (family is null) return Result.Failure(Error.NotFound("family.not_found", "Family not found."));
        // No-op when the proposed new head is already the head; a UI mis-click shouldn't
        // generate audit churn or silently change roles back to Head.
        if (family.HeadMemberId == dto.NewHeadMemberId)
            return Result.Failure(Error.Business("family.head_unchanged",
                "This member is already the head of the family."));
        var newHead = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.NewHeadMemberId && m.FamilyId == familyId, ct);
        if (newHead is null) return Result.Failure(Error.NotFound("member.not_in_family", "New head must be a member of this family."));
        if (newHead.Status != Domain.Enums.MemberStatus.Active)
            return Result.Failure(Error.Business("member.not_active",
                $"New head's status is {newHead.Status}; only Active members can hold headship."));
        if (family.HeadMemberId is Guid oldHeadId && oldHeadId != newHead.Id)
        {
            var oldHead = await db.Members.FirstOrDefaultAsync(m => m.Id == oldHeadId, ct);
            if (oldHead is not null) { oldHead.SetFamilyRole(FamilyRole.Other); db.Members.Update(oldHead); }
        }
        family.SetHead(newHead.Id, newHead.ItsNumber.Value);
        newHead.SetFamilyRole(FamilyRole.Head);
        db.Families.Update(family);
        db.Members.Update(newHead);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result<FamilyDto>> SpinOffAsync(Guid sourceFamilyId, SpinOffFamilyDto dto, CancellationToken ct = default)
    {
        var source = await db.Families.FirstOrDefaultAsync(f => f.Id == sourceFamilyId, ct);
        if (source is null) return Error.NotFound("family.not_found", "Source family not found.");
        if (string.IsNullOrWhiteSpace(dto.FamilyName))
            return Error.Validation("family.name_required", "New family name is required.");

        var newHead = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.NewHeadMemberId && !m.IsDeleted, ct);
        if (newHead is null) return Error.NotFound("member.not_found", "New head member not found.");
        if (newHead.Status != MemberStatus.Active)
            return Error.Business("member.not_active",
                $"New head's status is {newHead.Status}; only Active members can hold headship.");
        if (source.HeadMemberId == newHead.Id)
            return Error.Business("family.head_cannot_split",
                "The source family's head can't be spun off - they ARE the source family. Transfer headship first if needed.");
        if (newHead.FamilyId != sourceFamilyId)
            return Error.Business("member.not_in_source_family",
                "The proposed new head must currently be a member of the source family.");

        Member? spouse = null;
        if (dto.SpouseMemberId.HasValue)
        {
            spouse = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.SpouseMemberId.Value && !m.IsDeleted, ct);
            if (spouse is null) return Error.NotFound("spouse.not_found", "Spouse member not found.");
            if (spouse.Status != MemberStatus.Active)
                return Error.Business("spouse.not_active",
                    $"Spouse's status is {spouse.Status}; only Active members can be moved.");
            if (spouse.Id == newHead.Id)
                return Error.Validation("spouse.same_as_head", "Spouse must be different from the new head.");

            // Cross-family marriage is the normal path - a daughter, son, sister, niece etc. in a
            // parent's home moving to her/his new spouse's household is exactly how marriage works.
            // Lineage ITS pointers (FatherIts/MotherIts) stay intact, so the source family's tree
            // still shows the spouse as a daughter/sibling tagged with their new household. The
            // ONLY two cases worth blocking are:
            //   1. The spouse is already the HEAD of a different active family - moving them
            //      would orphan that family's leadership; operator must transfer-headship or
            //      dissolve first.
            //   2. The spouse is already linked as SPOUSE in a different household - that's an
            //      unresolved prior marriage; the previous spouse-link needs to end first to
            //      avoid silently re-pairing someone.
            // Anything else (Daughter, Son, Sibling, GrandSon, Other roles, no role) is allowed -
            // we simply LinkFamily(new) and the source family's roster shrinks.
            var inAnotherFamily = spouse.FamilyId.HasValue && spouse.FamilyId != sourceFamilyId;
            if (inAnotherFamily && spouse.FamilyRole == FamilyRole.Head)
                return Error.Business("spouse.is_head_elsewhere",
                    "Spouse is the head of another family. Transfer that headship or dissolve that family first.");
            if (inAnotherFamily && spouse.FamilyRole == FamilyRole.Spouse)
                return Error.Business("spouse.already_married",
                    "Spouse is already linked as the spouse of another household. End that spouse-link first.");
        }

        var code = await NextCodeAsync(ct);
        var family = new Family(Guid.NewGuid(), tenant.TenantId, code, dto.FamilyName, newHead.Id);
        family.UpdateDetails(dto.FamilyName, dto.ContactPhone, dto.ContactEmail, dto.Address, dto.Notes);
        family.SetHead(newHead.Id, newHead.ItsNumber.Value);
        db.Families.Add(family);

        // Move the head into the new family. The Spouse role on the source family side (if any)
        // is wiped by LinkFamily because FamilyId switches; the lineage ITS pointers stay put so
        // the tree-walk reaches them again.
        newHead.LinkFamily(family.Id, FamilyRole.Head);
        db.Members.Update(newHead);

        if (spouse is not null)
        {
            spouse.LinkFamily(family.Id, FamilyRole.Spouse);
            // Stamp the mutual SpouseItsNumber link if either side is missing it - common for
            // freshly-added spouses where the operator may not have set the ref yet. Keeping the
            // existing pointer if already populated avoids overwriting a deliberate value.
            if (string.IsNullOrWhiteSpace(newHead.SpouseItsNumber))
                newHead.UpdateFamilyRefs(newHead.FatherItsNumber, newHead.MotherItsNumber, spouse.ItsNumber.Value);
            if (string.IsNullOrWhiteSpace(spouse.SpouseItsNumber))
                spouse.UpdateFamilyRefs(spouse.FatherItsNumber, spouse.MotherItsNumber, newHead.ItsNumber.Value);
            db.Members.Update(spouse);
        }

        await uow.SaveChangesAsync(ct);

        var memberCount = await db.Members.CountAsync(m => m.FamilyId == family.Id && !m.IsDeleted, ct);
        return new FamilyDto(family.Id, family.Code, family.FamilyName, family.HeadMemberId, family.HeadItsNumber,
            newHead.FullName, family.ContactPhone, family.ContactEmail, family.Address, family.Notes, family.IsActive,
            memberCount, family.CreatedAtUtc);
    }

    public async Task<Result<FamilyExtendedTreeDto>> GetExtendedTreeAsync(Guid familyId, CancellationToken ct = default)
    {
        var family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.Id == familyId, ct);
        if (family is null) return Error.NotFound("family.not_found", "Family not found.");

        // Single-pass load of every member in the tenant. The page caps at ~10k household members
        // per tenant in practice; we hold the dictionary in memory and resolve all relations
        // off it instead of fanning out N round-trips for grand-/great-grand-children.
        var allMembers = await db.Members.AsNoTracking()
            .Where(m => !m.IsDeleted)
            .Select(m => new MemberSlim(
                m.Id, m.ItsNumber.Value, m.FullName,
                m.FatherItsNumber, m.MotherItsNumber, m.SpouseItsNumber,
                m.FamilyId, m.FamilyRole))
            .ToListAsync(ct);

        var families = await db.Families.AsNoTracking()
            .Select(f => new FamilySlim(f.Id, f.Code, f.FamilyName))
            .ToDictionaryAsync(f => f.Id, ct);

        var byIts = allMembers.Where(m => !string.IsNullOrEmpty(m.ItsNumber))
            .ToDictionary(m => m.ItsNumber!, m => m, StringComparer.Ordinal);
        var byId = allMembers.ToDictionary(m => m.MemberId, m => m);

        // Reverse lookup: for every parent ITS, who lists that ITS as their father or mother?
        // Used by the recursive descendant walk so we don't scan the full member list per ancestor.
        var childrenByParentIts = new Dictionary<string, List<MemberSlim>>(StringComparer.Ordinal);
        foreach (var m in allMembers)
        {
            if (!string.IsNullOrEmpty(m.FatherItsNumber))
                AppendUnique(childrenByParentIts, m.FatherItsNumber!, m);
            if (!string.IsNullOrEmpty(m.MotherItsNumber))
                AppendUnique(childrenByParentIts, m.MotherItsNumber!, m);
        }

        // Household-roster fallback: when a member is added via Family Detail with role
        // Son / Daughter / SonInLaw / DaughterInLaw, the operator may not have stamped
        // FatherItsNumber / MotherItsNumber on the new profile - the role + family link is
        // enough for the household roster to show them, but the ITS-only walker above
        // would miss them entirely. So for every family that has a head, treat household
        // children-roles as children of BOTH the head and the head's spouse, indexed by ITS.
        var familyHeadIds = await db.Families.AsNoTracking()
            .Where(f => f.HeadMemberId.HasValue)
            .Select(f => new { f.Id, HeadMemberId = f.HeadMemberId!.Value })
            .ToDictionaryAsync(x => x.Id, x => x.HeadMemberId, ct);
        foreach (var m in allMembers)
        {
            if (m.FamilyId is not Guid fid) continue;
            if (m.FamilyRole is not (FamilyRole.Son or FamilyRole.Daughter
                or FamilyRole.SonInLaw or FamilyRole.DaughterInLaw)) continue;
            if (!familyHeadIds.TryGetValue(fid, out var headId)) continue;
            if (!byId.TryGetValue(headId, out var headSlim)) continue;
            if (!string.IsNullOrEmpty(headSlim.ItsNumber))
                AppendUnique(childrenByParentIts, headSlim.ItsNumber!, m);
            // Head's spouse (if any) also gets credit - the kid is theirs too.
            if (!string.IsNullOrEmpty(headSlim.SpouseItsNumber))
                AppendUnique(childrenByParentIts, headSlim.SpouseItsNumber!, m);
        }

        FamilyTreePersonDto? Build(MemberSlim m, string relation, int depth, HashSet<Guid> visited)
        {
            // Cycle break + a sane recursion cap. 5 generations covers great-great-grandchildren,
            // beyond which the UI would be unreadable anyway.
            if (depth > 5 || !visited.Add(m.MemberId)) return null;

            string? currentFamilyCode = null, currentFamilyName = null;
            if (m.FamilyId.HasValue && families.TryGetValue(m.FamilyId.Value, out var fam))
            {
                currentFamilyCode = fam.Code;
                currentFamilyName = fam.FamilyName;
            }

            // Each child's own children (grandchildren from the perspective of the head). The
            // relation label flips to "Grandson"/"Granddaughter"/"Descendant" based on depth so
            // the UI doesn't have to compute it.
            var descendants = new List<FamilyTreePersonDto>();
            if (!string.IsNullOrEmpty(m.ItsNumber) && childrenByParentIts.TryGetValue(m.ItsNumber!, out var kids))
            {
                foreach (var k in kids.OrderBy(k => k.FullName))
                {
                    var rel = depth + 1 == 1 ? GuessChildRelation(k.FamilyRole)
                        : depth + 1 == 2 ? "Grandchild"
                        : "Descendant";
                    var built = Build(k, rel, depth + 1, visited);
                    if (built is not null) descendants.Add(built);
                }
            }

            // Resolve spouse info inline so the UI can render an "❤ Wife's name" badge on
            // descendant cards without forcing a sub-tree expansion. Cheap - we already have
            // the by-ITS dictionary materialised.
            string? spouseName = null;
            string? spouseIts = m.SpouseItsNumber;
            if (!string.IsNullOrEmpty(spouseIts) && byIts.TryGetValue(spouseIts!, out var spouseMatch))
                spouseName = spouseMatch.FullName;

            return new FamilyTreePersonDto(
                m.MemberId, m.ItsNumber ?? "-", m.FullName,
                relation,
                m.FamilyId, currentFamilyCode, currentFamilyName,
                IsInThisFamily: m.FamilyId == familyId,
                Descendants: descendants,
                SpouseItsNumber: spouseIts,
                SpouseName: spouseName);
        }

        FamilyTreePersonDto? head = null;
        FamilyTreePersonDto? spouse = null;
        FamilyTreePersonDto? father = null;
        FamilyTreePersonDto? mother = null;

        if (family.HeadMemberId.HasValue && byId.TryGetValue(family.HeadMemberId.Value, out var headMember))
        {
            head = Build(headMember, "Head", depth: 0, visited: new HashSet<Guid>());

            if (!string.IsNullOrEmpty(headMember.FatherItsNumber) && byIts.TryGetValue(headMember.FatherItsNumber!, out var fatherMember))
                father = LeafPerson(fatherMember, "Father", families, familyId);
            if (!string.IsNullOrEmpty(headMember.MotherItsNumber) && byIts.TryGetValue(headMember.MotherItsNumber!, out var motherMember))
                mother = LeafPerson(motherMember, "Mother", families, familyId);
            if (!string.IsNullOrEmpty(headMember.SpouseItsNumber) && byIts.TryGetValue(headMember.SpouseItsNumber!, out var spouseMember))
                spouse = LeafPerson(spouseMember, "Spouse", families, familyId);
        }

        return new FamilyExtendedTreeDto(family.Id, family.Code, family.FamilyName, father, mother, head, spouse);
    }

    private static FamilyTreePersonDto LeafPerson(MemberSlim m, string relation,
        IReadOnlyDictionary<Guid, FamilySlim> families, Guid currentFamilyId)
    {
        string? code = null, name = null;
        if (m.FamilyId.HasValue && families.TryGetValue(m.FamilyId.Value, out var fam))
        {
            code = fam.Code;
            name = fam.FamilyName;
        }
        return new FamilyTreePersonDto(
            m.MemberId, m.ItsNumber ?? "-", m.FullName, relation,
            m.FamilyId, code, name,
            IsInThisFamily: m.FamilyId == currentFamilyId,
            Descendants: Array.Empty<FamilyTreePersonDto>());
    }

    /// <summary>Add a member to the per-key list only if they're not already present. The
    /// descendant walker derives children from two sources (ITS pointers + household roster)
    /// which can produce duplicates if a child has both Father/Mother ITS set AND lives in
    /// the parent's household.</summary>
    private static void AppendUnique(Dictionary<string, List<MemberSlim>> map, string key, MemberSlim m)
    {
        if (!map.TryGetValue(key, out var list)) { list = new List<MemberSlim>(); map[key] = list; }
        if (list.All(x => x.MemberId != m.MemberId)) list.Add(m);
    }

    /// <summary>Pick a human-readable relation for a direct child given the FamilyRole tag the
    /// operator set when adding them. Falls back to "Child" when the role wasn't set or doesn't
    /// distinguish (e.g. SonInLaw / Other).</summary>
    private static string GuessChildRelation(FamilyRole? role) => role switch
    {
        FamilyRole.Son => "Son",
        FamilyRole.Daughter => "Daughter",
        FamilyRole.SonInLaw => "Son-in-Law",
        FamilyRole.DaughterInLaw => "Daughter-in-Law",
        _ => "Child",
    };

    /// <summary>Tiny projection used only during tree-building; keeps the in-memory footprint
    /// small even for tenants with thousands of members.</summary>
    private sealed record MemberSlim(
        Guid MemberId, string? ItsNumber, string FullName,
        string? FatherItsNumber, string? MotherItsNumber, string? SpouseItsNumber,
        Guid? FamilyId, FamilyRole? FamilyRole);

    private sealed record FamilySlim(Guid Id, string Code, string FamilyName);

    private async Task<string> NextCodeAsync(CancellationToken ct)
    {
        var count = await db.Families.CountAsync(ct);
        return $"F-{(count + 1):D5}";
    }

    public async Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default)
    {
        var rows = excelReader.Read(xlsxStream);
        var errors = new List<ImportRowError>();
        var committed = 0;

        // Pre-load existing family codes so we upsert by Code rather than name.
        var existingByCode = await db.Families.AsNoTracking()
            .Select(f => new { f.Id, f.Code }).ToDictionaryAsync(x => x.Code, x => x.Id, StringComparer.OrdinalIgnoreCase, ct);

        foreach (var row in rows)
        {
            try
            {
                var name = row.Get("Family name", "Name", "FamilyName");
                if (string.IsNullOrWhiteSpace(name)) { errors.Add(new(row.RowNumber, "Family name is required.", "Family name")); continue; }

                var headIts = row.Get("Head ITS", "HeadITS", "Head ITS Number");
                if (string.IsNullOrWhiteSpace(headIts)) { errors.Add(new(row.RowNumber, "Head ITS is required.", "Head ITS")); continue; }

                // Resolve head member by ITS - the importer requires the member to exist.
                var head = await db.Members.FirstOrDefaultAsync(m => ((string)(object)m.ItsNumber) == headIts && !m.IsDeleted, ct);
                if (head is null) { errors.Add(new(row.RowNumber, $"No member found with ITS '{headIts}'. Import members first.", "Head ITS")); continue; }

                var code = row.Get("Code") ?? await NextCodeAsync(ct);
                var phone = row.Get("Phone");
                var email = row.Get("Email");
                var address = row.Get("Address");
                var notes = row.Get("Notes");

                if (existingByCode.TryGetValue(code, out var existingId))
                {
                    var family = await db.Families.FirstOrDefaultAsync(f => f.Id == existingId, ct);
                    if (family is null) { errors.Add(new(row.RowNumber, "Family disappeared mid-import.")); continue; }
                    family.UpdateDetails(name, phone, email, address, notes);
                    db.Families.Update(family);
                }
                else
                {
                    var family = new Family(Guid.NewGuid(), tenant.TenantId, code, name, head.Id);
                    family.UpdateDetails(name, phone, email, address, notes);
                    family.SetHead(head.Id, head.ItsNumber.Value);
                    db.Families.Add(family);
                    head.LinkFamily(family.Id, FamilyRole.Head);
                    db.Members.Update(head);
                    existingByCode[code] = family.Id; // dedupe within the same upload
                }
                committed++;
            }
            catch (Exception ex)
            {
                errors.Add(new(row.RowNumber, ex.Message));
            }
        }

        if (committed > 0) await uow.SaveChangesAsync(ct);
        return new ImportResult(rows.Count, committed, errors);
    }
}

public sealed class CreateFamilyValidator : AbstractValidator<CreateFamilyDto>
{
    public CreateFamilyValidator()
    {
        RuleFor(x => x.FamilyName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.HeadMemberId).NotEmpty();
    }
}
public sealed class UpdateFamilyValidator : AbstractValidator<UpdateFamilyDto>
{
    public UpdateFamilyValidator()
    {
        RuleFor(x => x.FamilyName).NotEmpty().MaximumLength(200);
    }
}
