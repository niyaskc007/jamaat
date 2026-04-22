using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A content block on an event's public portal page.
/// Sections are ordered, individually toggleable, and carry an opaque JSON payload whose shape
/// depends on <see cref="Type"/>. The public portal renders visible sections in SortOrder.
/// </summary>
public sealed class EventPageSection : Entity<Guid>, ITenantScoped, IAuditable
{
    private EventPageSection() { }

    public EventPageSection(Guid id, Guid tenantId, Guid eventId, EventPageSectionType type, int sortOrder, string contentJson, bool isVisible = true)
    {
        Id = id;
        TenantId = tenantId;
        EventId = eventId;
        Type = type;
        SortOrder = sortOrder;
        ContentJson = contentJson ?? "{}";
        IsVisible = isVisible;
    }

    public Guid TenantId { get; private set; }
    public Guid EventId { get; private set; }
    public EventPageSectionType Type { get; private set; }
    public int SortOrder { get; private set; }
    public bool IsVisible { get; private set; }
    /// <summary>Opaque JSON content per section-type schema. Clients deserialize using the section registry.</summary>
    public string ContentJson { get; private set; } = "{}";

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void UpdateContent(string contentJson) => ContentJson = contentJson ?? "{}";
    public void SetVisibility(bool isVisible) => IsVisible = isVisible;
    public void SetOrder(int sortOrder) => SortOrder = sortOrder;
}
