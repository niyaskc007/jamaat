using Jamaat.Application.Notifications;
using Jamaat.Contracts.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/notifications")]
public sealed class NotificationsController(INotificationQueryService svc) : ControllerBase
{
    /// <summary>List notification log entries. Audit-only - admins use this to confirm
    /// "did the system actually try to tell the contributor?" and to debug SMTP failures.</summary>
    [HttpGet]
    [Authorize(Policy = "admin.audit")]
    public async Task<IActionResult> List([FromQuery] NotificationLogQuery q, CancellationToken ct)
        => Ok(await svc.ListAsync(q, ct));
}
