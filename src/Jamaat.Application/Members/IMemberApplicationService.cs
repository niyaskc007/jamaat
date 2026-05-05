using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Members;

/// Public self-registration + admin moderation. Submission is anonymous (no auth); approval
/// is admin-only. Approval creates the ApplicationUser via IMemberLoginProvisioningService
/// (existing pattern that mirrors role permissions to user claims and issues a temp pw),
/// linking it to an existing Member with the matching ITS or creating a new Member record
/// when the ITS is unknown to the system.
public interface IMemberApplicationService
{
    Task<Result<MemberApplicationReceiptDto>> SubmitAsync(
        Guid tenantId, SubmitMemberApplicationDto dto,
        string? ipAddress, string? userAgent, CancellationToken ct = default);

    Task<PagedResult<MemberApplicationDto>> ListAsync(MemberApplicationListQuery q, CancellationToken ct = default);
    Task<int> PendingCountAsync(CancellationToken ct = default);

    Task<Result<MemberApplicationDto>> ApproveAsync(Guid id, ReviewMemberApplicationDto dto, CancellationToken ct = default);
    Task<Result<MemberApplicationDto>> RejectAsync(Guid id, ReviewMemberApplicationDto dto, CancellationToken ct = default);
}

public sealed class MemberApplicationService(
    JamaatDbContextFacade db, IUnitOfWork uow,
    ITenantContext tenant, ICurrentUser currentUser, IClock clock,
    IMemberLoginProvisioningService provisioning,
    INotificationSender notify,
    IValidator<SubmitMemberApplicationDto> submitV) : IMemberApplicationService
{
    public async Task<Result<MemberApplicationReceiptDto>> SubmitAsync(
        Guid tenantId, SubmitMemberApplicationDto dto,
        string? ipAddress, string? userAgent, CancellationToken ct = default)
    {
        await submitV.ValidateAndThrowAsync(dto, ct);

        var its = dto.ItsNumber.Trim();
        // ITS format check via the value-object factory (8-digit numeric).
        if (!ItsNumber.TryCreate(its, out var itsValue))
            return Error.Validation("application.its_invalid", "ITS number must be 8 digits.");

        // Don't accept duplicate Pending applications for the same ITS within the tenant.
        // Approved/Rejected rows don't block resubmission.
        var existing = await db.MemberApplications.AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.ItsNumber == its && a.Status == MemberApplicationStatus.Pending)
            .AnyAsync(ct);
        if (existing)
            return Error.Conflict("application.duplicate_pending",
                "An application for this ITS number is already under review. Please wait for committee response.");

        var app = new MemberApplication(
            Guid.NewGuid(), tenantId,
            dto.FullName.Trim(), its, dto.Email?.Trim(), dto.PhoneE164?.Trim(),
            dto.Notes?.Trim(), ipAddress, userAgent);
        db.MemberApplications.Add(app);
        await uow.SaveChangesAsync(ct);

        return new MemberApplicationReceiptDto(
            app.Id, app.CreatedAtUtc,
            "Thank you. Your application is under review by the committee. You will be contacted once a decision is made.");
    }

    public async Task<PagedResult<MemberApplicationDto>> ListAsync(MemberApplicationListQuery q, CancellationToken ct = default)
    {
        IQueryable<MemberApplication> query = db.MemberApplications.AsNoTracking();
        if (q.Status is int status) query = query.Where(a => (int)a.Status == status);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(a => EF.Functions.Like(a.FullName, $"%{s}%")
                                  || EF.Functions.Like(a.ItsNumber, $"%{s}%")
                                  || (a.Email != null && EF.Functions.Like(a.Email, $"%{s}%")));
        }
        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(a => a.CreatedAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 200))
            .Select(a => Map(a))
            .ToListAsync(ct);
        return new PagedResult<MemberApplicationDto>(items, total, q.Page, q.PageSize);
    }

    public Task<int> PendingCountAsync(CancellationToken ct = default) =>
        db.MemberApplications.AsNoTracking()
            .Where(a => a.Status == MemberApplicationStatus.Pending)
            .CountAsync(ct);

    public async Task<Result<MemberApplicationDto>> ApproveAsync(Guid id, ReviewMemberApplicationDto dto, CancellationToken ct = default)
    {
        var app = await db.MemberApplications.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (app is null) return Error.NotFound("application.not_found", "Application not found.");
        if (app.Status != MemberApplicationStatus.Pending)
            return Error.Conflict("application.not_pending", $"Application is already {app.Status}.");

        // Resolve ITS to an existing Member row, or create a stub Member for the new joiner.
        if (!ItsNumber.TryCreate(app.ItsNumber, out var its))
            return Error.Business("application.its_invalid", "Stored ITS number is invalid.");
        var member = await db.Members.FirstOrDefaultAsync(m => m.ItsNumber == its && !m.IsDeleted, ct);
        if (member is null)
        {
            member = new Member(Guid.NewGuid(), tenant.TenantId, its, app.FullName);
            // Carry the application's contact info onto the new Member so the provisioning
            // service can issue a valid ApplicationUser (Identity rejects empty email).
            member.UpdateContact(app.PhoneE164, whatsApp: null, email: app.Email);
            db.Members.Add(member);
            // Persist the new member before the provisioning service walks the same id.
            await uow.SaveChangesAsync(ct);
        }
        else if (string.IsNullOrEmpty(member.Email) && !string.IsNullOrEmpty(app.Email))
        {
            // Existing member found but no email on file - backfill from the application so
            // ProvisionAsync can issue the welcome email. Phone backfill is conservative
            // (only when missing) to avoid clobbering admin-curated records.
            member.UpdateContact(member.Phone ?? app.PhoneE164, whatsApp: null, email: app.Email);
            db.Members.Update(member);
            await uow.SaveChangesAsync(ct);
        }

        // Provision the login. The existing service handles role assignment + claim mirroring +
        // temp password issuance + welcome notification. IsLoginAllowed=false by default; admin
        // flips it on from the Users page when ready. ProvisionAsync is idempotent: if a user
        // already exists for this ITS, it returns WasCreated=false and the existing UserId.
        var prov = await provisioning.ProvisionAsync(member, ct);

        // Fire the welcome email regardless of whether ProvisionAsync created a fresh user
        // or returned an existing one - re-approving an application should still notify the
        // member that their access is live. Best-effort; NotificationLog records the attempt.
        if (!string.IsNullOrEmpty(member.Email))
        {
            try
            {
                await notify.SendAsync(new NotificationMessage(
                    Kind: NotificationKind.UserWelcome,
                    Subject: "Your Jamaat self-service login is ready",
                    Body: $"Salaam {member.FullName},\n\n" +
                          $"Your application has been approved. Sign in at /login with your ITS number {member.ItsNumber} " +
                          $"and the temporary password emailed separately. You will be asked to set a permanent password " +
                          $"on your first login.\n\n" +
                          $"If you did not apply, please contact your committee.",
                    RecipientEmail: member.Email,
                    RecipientUserId: prov.UserId,
                    SourceId: app.Id,
                    SourceReference: $"member-application:{app.ItsNumber}",
                    RecipientPhoneE164: member.WhatsAppNo ?? member.Phone), ct);
            }
            catch { /* swallow - notification is best-effort, NotificationLog records the attempt */ }
        }

        app.Approve(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system",
                    clock.UtcNow, dto.Note, prov.UserId, member.Id);
        db.MemberApplications.Update(app);
        await uow.SaveChangesAsync(ct);

        return Map(app);
    }

    public async Task<Result<MemberApplicationDto>> RejectAsync(Guid id, ReviewMemberApplicationDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Note))
            return Error.Validation("application.reject_reason_required", "Reason required to reject.");
        var app = await db.MemberApplications.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (app is null) return Error.NotFound("application.not_found", "Application not found.");
        if (app.Status != MemberApplicationStatus.Pending)
            return Error.Conflict("application.not_pending", $"Application is already {app.Status}.");

        app.Reject(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system",
                   clock.UtcNow, dto.Note!);
        db.MemberApplications.Update(app);
        await uow.SaveChangesAsync(ct);
        return Map(app);
    }

    private static MemberApplicationDto Map(MemberApplication a) => new(
        a.Id, a.TenantId, a.FullName, a.ItsNumber, a.Email, a.PhoneE164, a.Notes,
        (int)a.Status, a.IpAddress, a.CreatedAtUtc, a.ReviewedAtUtc, a.ReviewedByUserName,
        a.ReviewerNote, a.CreatedUserId, a.LinkedMemberId);
}

public sealed class SubmitMemberApplicationValidator : AbstractValidator<SubmitMemberApplicationDto>
{
    public SubmitMemberApplicationValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MinimumLength(2).MaximumLength(200);
        RuleFor(x => x.ItsNumber).NotEmpty().Matches("^[0-9]{8}$").WithMessage("ITS must be 8 digits.");
        RuleFor(x => x.Email).EmailAddress().MaximumLength(200).When(x => !string.IsNullOrEmpty(x.Email));
        RuleFor(x => x.PhoneE164).MaximumLength(32).When(x => !string.IsNullOrEmpty(x.PhoneE164));
        RuleFor(x => x.Notes).MaximumLength(2000);
        // At least one contact channel so the committee can respond.
        RuleFor(x => x).Must(x => !string.IsNullOrWhiteSpace(x.Email) || !string.IsNullOrWhiteSpace(x.PhoneE164))
            .WithMessage("Provide an email or phone so the committee can contact you.");
    }
}
