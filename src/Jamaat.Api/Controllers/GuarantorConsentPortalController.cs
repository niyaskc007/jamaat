using Jamaat.Application.QarzanHasana;
using Jamaat.Contracts.QarzanHasana;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// Public-facing endpoints for the QH guarantor-consent portal. The token in the URL is the
/// credential - no login is required. Each token resolves to exactly one consent row; once
/// the guarantor accepts or declines, the token is locked into that response.
/// </summary>
[ApiController]
[Route("api/v1/portal/qh-consent")]
public sealed class GuarantorConsentPortalController(IQarzanHasanaService svc) : ControllerBase
{
    /// <summary>Resolve a public consent token. Returns loan + borrower summary so the
    /// guarantor can recognise what they're being asked to back.</summary>
    [HttpGet("{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(string token, CancellationToken ct)
    {
        var r = await svc.GetConsentPortalAsync(token, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// <summary>Record an Accepted response. Body carries the guarantor's own
    /// ITS number for verification + optional context; IP + user-agent are
    /// stamped server-side from the HTTP connection (clients can't forge them).</summary>
    [HttpPost("{token}/accept")]
    [AllowAnonymous]
    public async Task<IActionResult> Accept(string token, [FromBody] GuarantorConsentSubmitBody body, CancellationToken ct)
    {
        var meta = new RecordConsentResponseDto(
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers.UserAgent.ToString(),
            body.ItsNumberVerification,
            body.DeclineReason);
        var r = await svc.AcceptConsentAsync(token, meta, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }

    /// <summary>Record a Declined response. Same audit + ITS-verification rules as Accept.</summary>
    [HttpPost("{token}/decline")]
    [AllowAnonymous]
    public async Task<IActionResult> Decline(string token, [FromBody] GuarantorConsentSubmitBody body, CancellationToken ct)
    {
        var meta = new RecordConsentResponseDto(
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers.UserAgent.ToString(),
            body.ItsNumberVerification,
            body.DeclineReason);
        var r = await svc.DeclineConsentAsync(token, meta, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }
}

/// Body of POST /accept and /decline. IP + UA are stamped server-side from the
/// HTTP connection so the client can't forge them; only the responder-supplied
/// fields are here.
public sealed record GuarantorConsentSubmitBody(string? ItsNumberVerification, string? DeclineReason);
