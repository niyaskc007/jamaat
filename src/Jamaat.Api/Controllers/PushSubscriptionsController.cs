using System.Security.Claims;
using Jamaat.Application.Persistence;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Domain.ValueObjects;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Jamaat.Api.Controllers;

/// Web Push subscribe/unsubscribe + VAPID public key endpoint.
///
/// Auth: portal.access (members + admins). The VAPID public key endpoint is anonymous
/// because the SPA reads it before the user has logged in (so the subscribe flow can
/// run pre-auth on the login screen for users with existing sessions). Subscribe + delete
/// require a JWT; the SPA only ever subscribes once the user has signed in.
[ApiController]
[Route("api/v1/portal/me/push")]
public sealed class PushSubscriptionsController(
    UserManager<ApplicationUser> users,
    JamaatDbContextFacade db,
    ITenantContext tenant,
    IUnitOfWork uow,
    IOptions<WebPushOptions> webPushOpts) : ControllerBase
{
    /// VAPID public key for the SPA's pushManager.subscribe call. Anonymous because the
    /// SPA may need it before auth (e.g. to display "enable push?" on the login screen).
    /// Returns 503 if VAPID isn't configured server-side - the SPA hides the push UI in
    /// that case.
    [HttpGet("vapid-public-key")]
    [AllowAnonymous]
    public IActionResult GetVapidPublicKey()
    {
        var key = webPushOpts.Value.VapidPublicKey;
        if (string.IsNullOrEmpty(key))
            return StatusCode(503, new { error = "vapid_not_configured" });
        return Ok(new { key });
    }

    /// Persist a subscription. Idempotent on the (endpoint) unique key - resubscribing
    /// the same browser updates the row instead of creating duplicates.
    [HttpPost("subscribe")]
    [Authorize(Policy = "portal.access")]
    public async Task<IActionResult> Subscribe([FromBody] SubscribeDto dto, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(dto.Endpoint) || string.IsNullOrEmpty(dto.P256dh) || string.IsNullOrEmpty(dto.Auth))
            return BadRequest(new { error = "push.subscribe.missing_fields" });

        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null) return Unauthorized();

        // Resolve member id (if any) so the notifier can look up subs by member.
        Guid? memberId = null;
        if (!string.IsNullOrWhiteSpace(user.ItsNumber) && ItsNumber.TryCreate(user.ItsNumber!, out var its))
        {
            memberId = await db.Members.AsNoTracking()
                .Where(m => m.ItsNumber == its && !m.IsDeleted)
                .Select(m => (Guid?)m.Id)
                .FirstOrDefaultAsync(ct);
        }

        var existing = await db.PushSubscriptions.FirstOrDefaultAsync(p => p.Endpoint == dto.Endpoint, ct);
        if (existing is not null)
        {
            // Idempotent - same endpoint, no need to re-add. The unique index on Endpoint
            // would otherwise throw.
            return Ok(new { id = existing.Id, alreadySubscribed = true });
        }

        var ua = Request.Headers.UserAgent.ToString();
        var entity = new PushSubscription(
            id: Guid.NewGuid(),
            tenantId: tenant.TenantId,
            userId: userId,
            memberId: memberId,
            endpoint: dto.Endpoint,
            p256dh: dto.P256dh,
            auth: dto.Auth,
            userAgent: string.IsNullOrEmpty(ua) ? null : ua);
        db.PushSubscriptions.Add(entity);
        await uow.SaveChangesAsync(ct);
        return Ok(new { id = entity.Id, alreadySubscribed = false });
    }

    /// Drop a subscription by endpoint (the SPA holds the endpoint, not the row id).
    [HttpDelete("subscribe")]
    [Authorize(Policy = "portal.access")]
    public async Task<IActionResult> Unsubscribe([FromBody] UnsubscribeDto dto, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(dto.Endpoint)) return BadRequest();
        var sub = await db.PushSubscriptions.FirstOrDefaultAsync(p => p.Endpoint == dto.Endpoint, ct);
        if (sub is null) return NoContent();
        // Don't let user A delete user B's subscription.
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (Guid.TryParse(userId, out var uid) && sub.UserId != uid) return Forbid();
        db.PushSubscriptions.Remove(sub);
        await uow.SaveChangesAsync(ct);
        return NoContent();
    }
}

public sealed record SubscribeDto(string Endpoint, string P256dh, string Auth);
public sealed record UnsubscribeDto(string Endpoint);
