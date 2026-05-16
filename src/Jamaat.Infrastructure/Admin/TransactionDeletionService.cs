using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Jamaat.Application.Admin;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Domain.Common;
using Jamaat.Application.Receipts;
using Jamaat.Application.Vouchers;
using Jamaat.Contracts.Admin;
using Jamaat.Contracts.Receipts;
using Jamaat.Contracts.Vouchers;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Admin;

/// Two-person SuperAdmin deletion for posted financial documents. See
/// <see cref="ITransactionDeletionService"/> for the workflow.
public sealed class TransactionDeletionService(
    JamaatDbContext db,
    ITenantContext tenant,
    ICurrentUser currentUser,
    IHttpContextAccessor httpAccessor,
    IReceiptService receipts,
    IVoucherService vouchers,
    IClock clock,
    ILogger<TransactionDeletionService> logger) : ITransactionDeletionService
{
    /// 14 days. Same shape as our other admin SLAs (temp-password expiry, etc.). The
    /// auto-purge job marks pending requests Expired past this point.
    private static readonly TimeSpan PendingTtl = TimeSpan.FromDays(14);

    /// Soft-delete retention window applied to the underlying document after approval.
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromDays(30);

    private const int MinReasonLength = 10;

    public async Task<Result<TransactionDeletionRequestDto>> RequestAsync(RequestTransactionDeletionDto dto, CancellationToken ct = default)
    {
        if (!Enum.TryParse<TransactionTargetType>(dto.TargetType, ignoreCase: true, out var targetType))
            return Error.Validation("txn-delete.target_invalid", "TargetType must be 'Receipt' or 'Voucher'.");
        if (string.IsNullOrWhiteSpace(dto.Reason) || dto.Reason.Trim().Length < MinReasonLength)
            return Error.Validation("txn-delete.reason_required",
                $"Provide a reason of at least {MinReasonLength} characters - it surfaces to the second approver.");

        // Resolve the target. Refuse non-reversible states up-front so the queue doesn't
        // fill with requests the approver can't act on.
        var (label, ok, reason) = await ResolveAndValidateTargetAsync(targetType, dto.TargetId, ct);
        if (!ok) return Error.Business("txn-delete.target_not_reversible", reason!);

        // Reject if there's already a Pending request for the same target. Two pending
        // rows for the same doc would mean two approvals could race.
        var existing = await db.TransactionDeletionRequests
            .Where(r => r.TenantId == tenant.TenantId
                && r.TargetType == targetType
                && r.TargetId == dto.TargetId
                && r.Status == TransactionDeletionStatus.Pending)
            .FirstOrDefaultAsync(ct);
        if (existing is not null) return Error.Business("txn-delete.already_pending",
            "There is already a pending deletion request for this document. Approve or reject it first.");

        var now = clock.UtcNow;
        var req = new TransactionDeletionRequest(
            id: Guid.NewGuid(),
            tenantId: tenant.TenantId,
            targetType: targetType,
            targetId: dto.TargetId,
            targetCode: label,
            reason: dto.Reason.Trim(),
            requesterUserId: CurrentUserId(),
            requesterUserName: CurrentUserName() ?? "system",
            requestedAtUtc: now,
            expiresAtUtc: now + PendingTtl);

        db.TransactionDeletionRequests.Add(req);
        await WriteAuditAsync("txn-delete.request", req, snapshot: req.Reason, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("TxnDeleteRequest: {Type} {Id} by {ActorId} reason={Reason}",
            targetType, dto.TargetId, req.RequesterUserId, req.Reason);
        return ToDto(req);
    }

    public async Task<Result<TransactionDeletionRequestDto>> ApproveAsync(Guid requestId, ApproveTransactionDeletionDto dto, CancellationToken ct = default)
    {
        var req = await db.TransactionDeletionRequests.FirstOrDefaultAsync(r => r.Id == requestId, ct);
        if (req is null) return Error.NotFound("txn-delete.request_not_found", "Deletion request not found.");
        if (req.Status != TransactionDeletionStatus.Pending)
            return Error.Business("txn-delete.not_pending", $"Cannot approve a {req.Status} request.");

        // Re-check the target is still reversible (a separate flow may have already
        // reversed/cancelled the doc since the request was created).
        var (_, ok, reason) = await ResolveAndValidateTargetAsync(req.TargetType, req.TargetId, ct);
        if (!ok)
        {
            // Auto-reject - the target moved on. Surface a clear error so the approver
            // knows why the action failed.
            return Error.Business("txn-delete.target_not_reversible", reason!);
        }

        var approverId = CurrentUserId();
        var approverName = CurrentUserName() ?? "system";
        try
        {
            // Two-person rule is enforced inside Approve() on the aggregate. Throws
            // InvalidOperationException if requester == approver.
            req.Approve(approverId, approverName, dto.Note, clock.UtcNow);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Business("txn-delete.two_person_rule", ex.Message);
        }

        // Now run the reversal. Both services post the reversing GL entries inside
        // their own transactions; if reversal fails we DON'T stamp the doc soft-deleted
        // (the request goes back to Pending so a fresh attempt is possible).
        var reverseReason = $"SuperAdmin deletion approved: {req.Reason}";
        var reversed = req.TargetType switch
        {
            TransactionTargetType.Receipt => await TryReverseReceiptAsync(req.TargetId, reverseReason, ct),
            TransactionTargetType.Voucher => await TryReverseVoucherAsync(req.TargetId, reverseReason, ct),
            _ => Result.Failure(Error.Business("txn-delete.unknown_target", $"Unknown target type {req.TargetType}.")),
        };

        if (!reversed.IsSuccess)
        {
            // Roll the request back to Pending so the approver can retry once the
            // underlying issue is fixed. The audit trail of the attempt stays.
            req.Reject(approverId, approverName,
                $"Reverse failed; will re-attempt. Error: {reversed.Error.Message}", clock.UtcNow);
            await WriteAuditAsync("txn-delete.approve-failed", req, snapshot: reversed.Error.Message, ct);
            await db.SaveChangesAsync(ct);
            return Result.Failure<TransactionDeletionRequestDto>(reversed.Error);
        }

        // Stamp the doc soft-deleted. ReverseAsync sets Status=Reversed; we layer the
        // ISoftDeletable columns on top so it shows up in /admin/trash.
        await StampSoftDeleteAsync(req.TargetType, req.TargetId, approverId, req.Reason, ct);

        await WriteAuditAsync("txn-delete.approve", req, snapshot: dto.Note, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("TxnDeleteApprove: {Type} {Id} approver={ActorId}", req.TargetType, req.TargetId, approverId);
        return ToDto(req);
    }

    public async Task<Result<TransactionDeletionRequestDto>> RejectAsync(Guid requestId, RejectTransactionDeletionDto dto, CancellationToken ct = default)
    {
        var req = await db.TransactionDeletionRequests.FirstOrDefaultAsync(r => r.Id == requestId, ct);
        if (req is null) return Error.NotFound("txn-delete.request_not_found", "Deletion request not found.");
        if (string.IsNullOrWhiteSpace(dto.Note) || dto.Note.Trim().Length < MinReasonLength)
            return Error.Validation("txn-delete.note_required",
                $"Provide a rejection note of at least {MinReasonLength} characters - it surfaces to the requester.");

        try
        {
            req.Reject(CurrentUserId(), CurrentUserName() ?? "system", dto.Note.Trim(), clock.UtcNow);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Business("txn-delete.not_pending", ex.Message);
        }

        await WriteAuditAsync("txn-delete.reject", req, snapshot: dto.Note, ct);
        await db.SaveChangesAsync(ct);
        return ToDto(req);
    }

    public async Task<Result<IReadOnlyList<TransactionDeletionRequestDto>>> ListAsync(string? status, CancellationToken ct = default)
    {
        var q = db.TransactionDeletionRequests.AsNoTracking().Where(r => r.TenantId == tenant.TenantId);
        if (!string.IsNullOrEmpty(status) && Enum.TryParse<TransactionDeletionStatus>(status, ignoreCase: true, out var st))
            q = q.Where(r => r.Status == st);
        var rows = await q.OrderByDescending(r => r.RequestedAtUtc).ToListAsync(ct);
        return Result.Success<IReadOnlyList<TransactionDeletionRequestDto>>(rows.Select(ToDtoInner).ToList());
    }

    public async Task<Result<TransactionDeletionRequestDto>> GetAsync(Guid requestId, CancellationToken ct = default)
    {
        var req = await db.TransactionDeletionRequests.AsNoTracking().FirstOrDefaultAsync(r => r.Id == requestId, ct);
        if (req is null) return Error.NotFound("txn-delete.request_not_found", "Deletion request not found.");
        return ToDtoInner(req);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Resolve the target's display code and validate that it's in a state we can reverse.
    /// Returns (label, ok, reasonIfNotOk).
    private async Task<(string label, bool ok, string? reason)> ResolveAndValidateTargetAsync(
        TransactionTargetType type, Guid id, CancellationToken ct)
    {
        switch (type)
        {
            case TransactionTargetType.Receipt:
                var r = await db.Receipts.IgnoreQueryFilters()
                    .Where(x => x.Id == id)
                    .Select(x => new { x.Status, x.ReceiptNumber, x.DeletedAtUtc })
                    .FirstOrDefaultAsync(ct);
                if (r is null) return ("", false, "Receipt not found.");
                if (r.DeletedAtUtc is not null) return ("", false, "Receipt is already soft-deleted.");
                if (r.Status != ReceiptStatus.Confirmed) return ("", false, $"Only Confirmed receipts can be deleted (current: {r.Status}).");
                return (r.ReceiptNumber ?? id.ToString("N")[..8], true, null);

            case TransactionTargetType.Voucher:
                var v = await db.Vouchers.IgnoreQueryFilters()
                    .Where(x => x.Id == id)
                    .Select(x => new { x.Status, x.VoucherNumber, x.DeletedAtUtc })
                    .FirstOrDefaultAsync(ct);
                if (v is null) return ("", false, "Voucher not found.");
                if (v.DeletedAtUtc is not null) return ("", false, "Voucher is already soft-deleted.");
                if (v.Status != VoucherStatus.Paid) return ("", false, $"Only Paid vouchers can be deleted (current: {v.Status}).");
                return (v.VoucherNumber ?? id.ToString("N")[..8], true, null);

            default:
                return ("", false, "Unknown target type.");
        }
    }

    private async Task<Result> TryReverseReceiptAsync(Guid id, string reason, CancellationToken ct)
    {
        var r = await receipts.ReverseAsync(id, new ReverseReceiptDto(reason), ct);
        return r.IsSuccess ? Result.Success() : Result.Failure(r.Error);
    }

    private async Task<Result> TryReverseVoucherAsync(Guid id, string reason, CancellationToken ct)
    {
        var r = await vouchers.ReverseAsync(id, new ReverseVoucherDto(reason), ct);
        return r.IsSuccess ? Result.Success() : Result.Failure(r.Error);
    }

    /// Layer the soft-delete columns on top of the Reversed-state doc. The status is
    /// already Reversed (set by ReverseAsync); we mark it as also deleted so it surfaces
    /// in /admin/trash with the retention countdown.
    private async Task StampSoftDeleteAsync(TransactionTargetType type, Guid id, Guid? actorId, string reason, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var retention = now + RetentionWindow;
        switch (type)
        {
            case TransactionTargetType.Receipt:
                var r = await db.Receipts.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct);
                if (r is not null)
                {
                    r.DeletedAtUtc = now;
                    r.DeletedByUserId = actorId;
                    r.DeletionReason = reason;
                    r.RetentionUntilUtc = retention;
                }
                break;
            case TransactionTargetType.Voucher:
                var v = await db.Vouchers.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct);
                if (v is not null)
                {
                    v.DeletedAtUtc = now;
                    v.DeletedByUserId = actorId;
                    v.DeletionReason = reason;
                    v.RetentionUntilUtc = retention;
                }
                break;
        }
    }

    private static TransactionDeletionRequestDto ToDtoInner(TransactionDeletionRequest r) => new(
        r.Id, r.TargetType.ToString(), r.TargetId, r.TargetCode,
        r.Status.ToString(), r.Reason,
        r.RequesterUserId, r.RequesterUserName, r.RequestedAtUtc, r.ExpiresAtUtc,
        r.ApproverUserId, r.ApproverUserName, r.ApprovedAtUtc, r.DecisionNote);

    private static Result<TransactionDeletionRequestDto> ToDto(TransactionDeletionRequest r) => ToDtoInner(r);

    private Guid? CurrentUserId()
    {
        if (currentUser.UserId is Guid id) return id;
        var user = httpAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true) return null;
        string?[] candidates = {
            user.FindFirstValue(ClaimTypes.NameIdentifier),
            user.FindFirstValue(JwtRegisteredClaimNames.Sub),
            user.FindFirstValue("sub"),
            user.FindFirstValue("nameid"),
        };
        foreach (var v in candidates) if (Guid.TryParse(v, out var g)) return g;
        return null;
    }

    private string? CurrentUserName()
    {
        if (!string.IsNullOrEmpty(currentUser.UserName)) return currentUser.UserName;
        var user = httpAccessor.HttpContext?.User;
        return user?.FindFirstValue(ClaimTypes.Name)
            ?? user?.FindFirstValue(JwtRegisteredClaimNames.UniqueName)
            ?? user?.FindFirstValue(ClaimTypes.Email);
    }

    private Task WriteAuditAsync(string action, TransactionDeletionRequest req, string? snapshot, CancellationToken ct)
    {
        db.AuditLogs.Add(new AuditLog(
            tenantId: tenant.TenantId,
            userId: CurrentUserId(),
            userName: CurrentUserName() ?? "system",
            correlationId: req.Id.ToString("N"),
            action: action,
            entityName: req.TargetType.ToString(),
            entityId: req.TargetId.ToString(),
            screen: "/admin/transaction-deletions",
            beforeJson: null,
            afterJson: snapshot is null ? null : JsonSerializer.Serialize(new { req.Status, req.Reason, req.DecisionNote, snapshot }),
            ipAddress: null,
            userAgent: null,
            atUtc: clock.UtcNow));
        return Task.CompletedTask;
    }
}
