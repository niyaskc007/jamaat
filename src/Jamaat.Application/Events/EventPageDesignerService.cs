using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Events;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Events;

/// <summary>
/// Manages the admin-side Page Designer: add / update / reorder / remove sections on an event's public page.
/// </summary>
public interface IEventPageDesignerService
{
    Task<IReadOnlyList<EventPageSectionDto>> ListAsync(Guid eventId, CancellationToken ct = default);
    Task<Result<EventPageSectionDto>> AddAsync(Guid eventId, AddSectionDto dto, CancellationToken ct = default);
    Task<Result<EventPageSectionDto>> UpdateAsync(Guid sectionId, UpdateSectionDto dto, CancellationToken ct = default);
    Task<Result> RemoveAsync(Guid sectionId, CancellationToken ct = default);
    Task<Result> ReorderAsync(Guid eventId, ReorderSectionsDto dto, CancellationToken ct = default);
    IReadOnlyList<PresetInfoDto> ListPresets();
    Task<Result<IReadOnlyList<EventPageSectionDto>>> ApplyPresetAsync(Guid eventId, ApplyPresetDto dto, CancellationToken ct = default);
}

public sealed class EventPageDesignerService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant) : IEventPageDesignerService
{
    public async Task<IReadOnlyList<EventPageSectionDto>> ListAsync(Guid eventId, CancellationToken ct = default)
        => await db.EventPageSections.AsNoTracking()
            .Where(s => s.EventId == eventId)
            .OrderBy(s => s.SortOrder)
            .Select(s => new EventPageSectionDto(s.Id, s.EventId, s.Type, s.SortOrder, s.IsVisible, s.ContentJson))
            .ToListAsync(ct);

    public async Task<Result<EventPageSectionDto>> AddAsync(Guid eventId, AddSectionDto dto, CancellationToken ct = default)
    {
        if (!await db.Events.AnyAsync(e => e.Id == eventId, ct))
            return Error.NotFound("event.not_found", "Event not found.");

        var nextOrder = dto.SortOrder ?? await NextOrderAsync(eventId, ct);
        var content = string.IsNullOrWhiteSpace(dto.ContentJson) ? DefaultContentFor(dto.Type) : dto.ContentJson;
        var section = new EventPageSection(Guid.NewGuid(), tenant.TenantId, eventId, dto.Type, nextOrder, content);
        db.EventPageSections.Add(section);
        await uow.SaveChangesAsync(ct);
        return new EventPageSectionDto(section.Id, section.EventId, section.Type, section.SortOrder, section.IsVisible, section.ContentJson);
    }

    public async Task<Result<EventPageSectionDto>> UpdateAsync(Guid sectionId, UpdateSectionDto dto, CancellationToken ct = default)
    {
        var s = await db.EventPageSections.FirstOrDefaultAsync(x => x.Id == sectionId, ct);
        if (s is null) return Error.NotFound("section.not_found", "Section not found.");
        s.UpdateContent(dto.ContentJson ?? "{}");
        s.SetVisibility(dto.IsVisible);
        await uow.SaveChangesAsync(ct);
        return new EventPageSectionDto(s.Id, s.EventId, s.Type, s.SortOrder, s.IsVisible, s.ContentJson);
    }

    public async Task<Result> RemoveAsync(Guid sectionId, CancellationToken ct = default)
    {
        var s = await db.EventPageSections.FirstOrDefaultAsync(x => x.Id == sectionId, ct);
        if (s is null) return Result.Failure(Error.NotFound("section.not_found", "Section not found."));
        db.EventPageSections.Remove(s);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> ReorderAsync(Guid eventId, ReorderSectionsDto dto, CancellationToken ct = default)
    {
        if (dto.SectionIds is null || dto.SectionIds.Count == 0)
            return Result.Failure(Error.Validation("section.reorder_empty", "Provide an ordered list of section ids."));

        var sections = await db.EventPageSections
            .Where(s => s.EventId == eventId)
            .ToListAsync(ct);
        var byId = sections.ToDictionary(s => s.Id);

        // Assign SortOrder in the order the client supplied. Any sections the client
        // omitted keep their prior order appended after the known ones.
        var order = 0;
        foreach (var id in dto.SectionIds)
        {
            if (byId.TryGetValue(id, out var s)) s.SetOrder(order++);
        }
        foreach (var s in sections.Where(x => !dto.SectionIds.Contains(x.Id)))
            s.SetOrder(order++);

        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private async Task<int> NextOrderAsync(Guid eventId, CancellationToken ct)
        => await db.EventPageSections.Where(s => s.EventId == eventId)
            .Select(s => (int?)s.SortOrder).MaxAsync(ct) + 1 ?? 0;

    public IReadOnlyList<PresetInfoDto> ListPresets() => Presets
        .Select(p => new PresetInfoDto(p.Key, p.Name, p.Description, p.Sections.Length))
        .ToList();

    public async Task<Result<IReadOnlyList<EventPageSectionDto>>> ApplyPresetAsync(Guid eventId, ApplyPresetDto dto, CancellationToken ct = default)
    {
        if (!await db.Events.AnyAsync(e => e.Id == eventId, ct))
            return Error.NotFound("event.not_found", "Event not found.");
        var preset = Presets.FirstOrDefault(p => string.Equals(p.Key, dto.PresetKey, StringComparison.OrdinalIgnoreCase));
        if (preset is null) return Error.Validation("preset.unknown", $"Unknown preset '{dto.PresetKey}'.");

        if (dto.ReplaceExisting)
        {
            var existing = await db.EventPageSections.Where(s => s.EventId == eventId).ToListAsync(ct);
            db.EventPageSections.RemoveRange(existing);
            await uow.SaveChangesAsync(ct);
        }

        var nextOrder = dto.ReplaceExisting ? 0 : await NextOrderAsync(eventId, ct);
        foreach (var (type, content) in preset.Sections)
        {
            var section = new EventPageSection(Guid.NewGuid(), tenant.TenantId, eventId, type, nextOrder++, content);
            db.EventPageSections.Add(section);
        }
        await uow.SaveChangesAsync(ct);

        var dtos = await ListAsync(eventId, ct);
        return Result<IReadOnlyList<EventPageSectionDto>>.Success(dtos);
    }

    private sealed record Preset(string Key, string Name, string Description, (EventPageSectionType Type, string Content)[] Sections);

    private static readonly Preset[] Presets =
    [
        new Preset("classic", "Classic",
            "Timeless event page: hero → about → agenda → venue → FAQ → register.",
        [
            (EventPageSectionType.Hero, """{"heading":"Welcome","subheading":"A gathering of the community","useEventCover":true,"overlay":true,"ctaLabel":"Register now","ctaTarget":"register","alignment":"center"}"""),
            (EventPageSectionType.Text, """{"heading":"About this event","body":"Add a warm welcome here. Describe what attendees can expect, who's invited, and anything they should know before arriving.","alignment":"left"}"""),
            (EventPageSectionType.Agenda, """{"heading":"Programme","showTime":true,"showSpeaker":true}"""),
            (EventPageSectionType.Venue, """{"heading":"Venue","showMap":true}"""),
            (EventPageSectionType.Faq, """{"heading":"Frequently asked questions","items":[{"question":"Is parking available?","answer":"Yes, free parking is available on-site."},{"question":"Will food be served?","answer":"Niyaz will be served after the main programme."}]}"""),
            (EventPageSectionType.Registration, """{"heading":"Reserve your seat","showGuests":true}"""),
        ]),
        new Preset("modern", "Modern",
            "Bold hero, stats, agenda, speakers, gallery, countdown CTA.",
        [
            (EventPageSectionType.Hero, """{"heading":"Something unforgettable","subheading":"Join us for a transformative evening","useEventCover":true,"overlay":true,"ctaLabel":"Save my spot","ctaTarget":"register","alignment":"center","style":{"paddingTop":96,"paddingBottom":96}}"""),
            (EventPageSectionType.Stats, """{"heading":"At a glance","items":[{"value":"500+","label":"Expected attendees"},{"value":"9","label":"Days of programme"},{"value":"20","label":"Speakers"}]}"""),
            (EventPageSectionType.Agenda, """{"heading":"What to expect","showTime":true,"showSpeaker":true}"""),
            (EventPageSectionType.Speakers, """{"heading":"Our speakers","speakers":[]}"""),
            (EventPageSectionType.Gallery, """{"heading":"Moments from past events","images":[]}"""),
            (EventPageSectionType.Countdown, """{"heading":"Starts in","targetKind":"eventStart","completedLabel":"We're live!"}"""),
            (EventPageSectionType.Cta, """{"heading":"Don't miss it","subheading":"Seats are limited - reserve yours today.","buttonLabel":"Register now","buttonTarget":"register","tone":"primary"}"""),
            (EventPageSectionType.Registration, """{"heading":"Reserve your seat","showGuests":true}"""),
        ]),
        new Preset("minimal", "Minimal",
            "Focused and quiet: hero, short description, registration.",
        [
            (EventPageSectionType.Hero, """{"heading":"You're invited","subheading":"A simple gathering","useEventCover":false,"overlay":false,"ctaLabel":"RSVP","ctaTarget":"register","alignment":"center","style":{"paddingTop":72,"paddingBottom":72}}"""),
            (EventPageSectionType.Text, """{"heading":"Details","body":"Replace this text with the essentials: what, when, where, and why it matters.","alignment":"center"}"""),
            (EventPageSectionType.Registration, """{"heading":"RSVP","showGuests":true}"""),
        ]),
    ];

    /// <summary>Sensible default content for each section type so a freshly-added section renders nicely.</summary>
    private static string DefaultContentFor(EventPageSectionType type) => type switch
    {
        EventPageSectionType.Hero => """{"heading":"Welcome to our event","subheading":"A short subtitle goes here","useEventCover":true,"overlay":true,"ctaLabel":"Register now","ctaTarget":"register","alignment":"center"}""",
        EventPageSectionType.Text => """{"heading":"About","body":"Write some details about this event…","alignment":"left"}""",
        EventPageSectionType.Agenda => """{"heading":"Agenda","showTime":true,"showSpeaker":true}""",
        EventPageSectionType.Speakers => """{"heading":"Speakers","speakers":[]}""",
        EventPageSectionType.Venue => """{"heading":"Venue","showMap":true}""",
        EventPageSectionType.Gallery => """{"heading":"Gallery","images":[]}""",
        EventPageSectionType.Faq => """{"heading":"Frequently asked questions","items":[{"question":"Example question?","answer":"Answer goes here."}]}""",
        EventPageSectionType.Cta => """{"heading":"Ready to join us?","buttonLabel":"Register now","buttonTarget":"register","tone":"primary"}""",
        EventPageSectionType.Registration => """{"heading":"Reserve your seat","showGuests":true}""",
        EventPageSectionType.Countdown => """{"heading":"Event starts in","targetKind":"eventStart","completedLabel":"We've started - welcome!"}""",
        EventPageSectionType.Stats => """{"heading":"At a glance","items":[{"value":"500+","label":"Attendees"},{"value":"9","label":"Days"},{"value":"20","label":"Speakers"}]}""",
        EventPageSectionType.Sponsors => """{"heading":"With thanks to","sponsors":[]}""",
        EventPageSectionType.CustomHtml => """{"html":"<div style='padding:24px;text-align:center;color:#64748B'>Your custom HTML goes here.</div>"}""",
        _ => "{}",
    };
}
