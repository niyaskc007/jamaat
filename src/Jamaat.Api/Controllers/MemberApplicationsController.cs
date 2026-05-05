using Jamaat.Application.Members;
using Jamaat.Contracts.Members;
using Jamaat.Domain.Abstractions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// Phase F: member self-registration.
///
/// Public submission lives at /api/v1/portal/register (anonymous). Admin moderation lives
/// at /api/v1/admin/member-applications behind the existing admin.users policy. Approval
/// creates an ApplicationUser via IMemberLoginProvisioningService - same flow that the
/// admin Users page uses for direct provisioning, so the welcome-email + temp-password
/// behaviour is consistent across both onboarding paths.
[ApiController]
public sealed class MemberApplicationsController(
    IMemberApplicationService svc,
    ITenantContext tenant) : ControllerBase
{
    // ---- Public submission ----------------------------------------------
    [HttpPost("api/v1/portal/register")]
    [AllowAnonymous]
    public async Task<IActionResult> Submit([FromBody] SubmitMemberApplicationDto dto, CancellationToken ct)
    {
        // Tenant must resolve from the host header / default-tenant fallback because the
        // request is anonymous. Without an authenticated tenant we use the default tenant
        // configured in MultiTenancy:DefaultTenantId - same fallback the public event portal
        // uses.
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = HttpContext.Request.Headers.UserAgent.ToString();
        var r = await svc.SubmitAsync(tenant.TenantId, dto, ip, ua, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    // ---- Admin moderation queue -----------------------------------------
    [HttpGet("api/v1/admin/member-applications")]
    [Authorize(Policy = "admin.users")]
    public async Task<IActionResult> List([FromQuery] MemberApplicationListQuery q, CancellationToken ct)
        => Ok(await svc.ListAsync(q, ct));

    [HttpGet("api/v1/admin/member-applications/pending-count")]
    [Authorize(Policy = "admin.users")]
    public async Task<IActionResult> PendingCount(CancellationToken ct)
        => Ok(new { count = await svc.PendingCountAsync(ct) });

    [HttpPost("api/v1/admin/member-applications/{id:guid}/approve")]
    [Authorize(Policy = "admin.users")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ReviewMemberApplicationDto dto, CancellationToken ct)
    {
        var r = await svc.ApproveAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    [HttpPost("api/v1/admin/member-applications/{id:guid}/reject")]
    [Authorize(Policy = "admin.users")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ReviewMemberApplicationDto dto, CancellationToken ct)
    {
        var r = await svc.RejectAsync(id, dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }
}
