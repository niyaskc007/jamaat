using Jamaat.Application.Common;
using Jamaat.Contracts.Notifications;

namespace Jamaat.Application.Notifications;

public interface INotificationQueryService
{
    Task<PagedResult<NotificationLogDto>> ListAsync(NotificationLogQuery q, CancellationToken ct = default);
}
