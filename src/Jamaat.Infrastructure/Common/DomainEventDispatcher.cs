using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Common;

/// Minimal in-process dispatcher. Replaced with MediatR if/when we adopt it.
public sealed class DomainEventDispatcher : IDomainEventDispatcher
{
    private readonly ILogger<DomainEventDispatcher> _logger;

    public DomainEventDispatcher(ILogger<DomainEventDispatcher> logger) => _logger = logger;

    public Task DispatchAsync(IReadOnlyCollection<IDomainEvent> events, CancellationToken ct = default)
    {
        foreach (var evt in events)
        {
            _logger.LogInformation("Domain event raised: {EventType} {@Event}", evt.GetType().Name, evt);
        }
        return Task.CompletedTask;
    }
}
