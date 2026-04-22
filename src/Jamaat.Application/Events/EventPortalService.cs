using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Events;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Events;

/// <summary>
/// Read-only projections for the public event portal. Only active events with
/// `IsActive=true` are surfaced; branding + registration info is exposed anonymously.
/// </summary>
public interface IEventPortalService
{
    Task<IReadOnlyList<PortalEventSummaryDto>> ListUpcomingAsync(int max, CancellationToken ct = default);
    Task<Result<PortalEventDetailDto>> GetBySlugAsync(string slug, CancellationToken ct = default);
}

public sealed class EventPortalService(JamaatDbContextFacade db, IClock clock) : IEventPortalService
{
    public async Task<IReadOnlyList<PortalEventSummaryDto>> ListUpcomingAsync(int max, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(clock.UtcNow.UtcDateTime);
        var events = await db.Events.AsNoTracking()
            .Where(e => e.IsActive && e.EventDate >= today)
            .OrderBy(e => e.EventDate)
            .Take(Math.Clamp(max, 1, 100))
            .ToListAsync(ct);

        var now = clock.UtcNow;
        var results = new List<PortalEventSummaryDto>(events.Count);
        foreach (var e in events)
        {
            int? remaining = null;
            if (e.Capacity is int cap)
            {
                var taken = await db.EventRegistrations.AsNoTracking()
                    .Where(r => r.EventId == e.Id && r.Status != RegistrationStatus.Cancelled)
                    .SelectMany(r => r.Guests.Select(_ => 1)).CountAsync(ct)
                    + await db.EventRegistrations.AsNoTracking()
                        .CountAsync(r => r.EventId == e.Id && r.Status != RegistrationStatus.Cancelled, ct);
                remaining = Math.Max(0, cap - taken);
            }
            results.Add(new PortalEventSummaryDto(
                e.Id, e.Slug, e.Name, e.Tagline, e.Category,
                e.EventDate, e.EventDateHijri, e.StartsAtUtc, e.EndsAtUtc,
                e.Place, e.CoverImageUrl, e.PrimaryColor, e.AccentColor,
                e.CanAcceptRegistrationsAt(now), remaining));
        }
        return results;
    }

    public async Task<Result<PortalEventDetailDto>> GetBySlugAsync(string slug, CancellationToken ct = default)
    {
        var normalized = slug.ToLowerInvariant();
        var e = await db.Events.AsNoTracking()
            .Include(x => x.Agenda)
            .FirstOrDefaultAsync(x => x.Slug == normalized && x.IsActive, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");

        int? remaining = null;
        if (e.Capacity is int cap)
        {
            var taken = await db.EventRegistrations.AsNoTracking()
                .Where(r => r.EventId == e.Id && r.Status != RegistrationStatus.Cancelled)
                .SelectMany(r => r.Guests.Select(_ => 1)).CountAsync(ct)
                + await db.EventRegistrations.AsNoTracking()
                    .CountAsync(r => r.EventId == e.Id && r.Status != RegistrationStatus.Cancelled, ct);
            remaining = Math.Max(0, cap - taken);
        }

        var summary = new PortalEventSummaryDto(
            e.Id, e.Slug, e.Name, e.Tagline, e.Category,
            e.EventDate, e.EventDateHijri, e.StartsAtUtc, e.EndsAtUtc,
            e.Place, e.CoverImageUrl, e.PrimaryColor, e.AccentColor,
            e.CanAcceptRegistrationsAt(clock.UtcNow), remaining);

        var agenda = e.Agenda.OrderBy(a => a.SortOrder)
            .Select(a => new EventAgendaItemDto(a.Id, a.SortOrder, a.Title, a.StartTime, a.EndTime, a.Speaker, a.Location, a.Description))
            .ToList();

        // Only visible sections leak to the public page.
        var sections = await db.EventPageSections.AsNoTracking()
            .Where(s => s.EventId == e.Id && s.IsVisible)
            .OrderBy(s => s.SortOrder)
            .Select(s => new EventPageSectionDto(s.Id, s.EventId, s.Type, s.SortOrder, s.IsVisible, s.ContentJson))
            .ToListAsync(ct);

        return new PortalEventDetailDto(
            summary, e.Description, e.NameArabic,
            e.VenueAddress, e.VenueLatitude, e.VenueLongitude, e.LogoUrl,
            e.ContactPhone, e.ContactEmail,
            e.AllowGuests, e.MaxGuestsPerRegistration, e.OpenToNonMembers, e.RequiresApproval,
            e.ShareTitle, e.ShareDescription, e.ShareImageUrl,
            agenda, sections, HasCustomPage: sections.Count > 0);
    }
}
