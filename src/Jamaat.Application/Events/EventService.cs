using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Events;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Events;

public interface IEventService
{
    Task<PagedResult<EventDto>> ListAsync(EventListQuery q, CancellationToken ct = default);
    Task<Result<EventDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<EventDto>> GetBySlugAsync(string slug, CancellationToken ct = default);
    Task<Result<EventDto>> CreateAsync(CreateEventDto dto, CancellationToken ct = default);
    Task<Result<EventDto>> UpdateAsync(Guid id, UpdateEventDto dto, CancellationToken ct = default);
    Task<Result<EventDto>> UpdateBrandingAsync(Guid id, UpdateEventBrandingDto dto, CancellationToken ct = default);
    Task<Result<EventDto>> UpdateShareAsync(Guid id, UpdateEventShareDto dto, CancellationToken ct = default);
    Task<Result<EventDto>> UpdateRegistrationSettingsAsync(Guid id, UpdateRegistrationSettingsDto dto, CancellationToken ct = default);
    Task<Result<EventDto>> ReplaceAgendaAsync(Guid id, ReplaceAgendaDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);

    Task<PagedResult<EventScanDto>> ListScansAsync(ScanListQuery q, CancellationToken ct = default);
    Task<Result<EventScanDto>> ScanAsync(ScanRequestDto dto, CancellationToken ct = default);
    Task<Result> RemoveScanAsync(Guid scanId, CancellationToken ct = default);
}

public sealed class EventService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    ICurrentUser currentUser, IClock clock,
    IValidator<CreateEventDto> createV, IValidator<UpdateEventDto> updateV) : IEventService
{
    // ---- List + Get ------------------------------------------------------

    public async Task<PagedResult<EventDto>> ListAsync(EventListQuery q, CancellationToken ct = default)
    {
        IQueryable<Event> query = db.Events.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%") || EF.Functions.Like(x.Slug, $"%{s}%"));
        }
        if (q.Category is not null) query = query.Where(x => x.Category == q.Category);
        if (q.FromDate is not null) query = query.Where(x => x.EventDate >= q.FromDate);
        if (q.ToDate is not null) query = query.Where(x => x.EventDate <= q.ToDate);
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);
        if (q.RegistrationsEnabled is not null) query = query.Where(x => x.RegistrationsEnabled == q.RegistrationsEnabled);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(x => x.EventDate)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Include(x => x.Agenda)
            .ToListAsync(ct);

        var dtos = new List<EventDto>(items.Count);
        foreach (var e in items) dtos.Add(await MapAsync(e, ct));
        return new PagedResult<EventDto>(dtos, total, q.Page, q.PageSize);
    }

    public async Task<Result<EventDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.Events.AsNoTracking().Include(x => x.Agenda).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");
        return await MapAsync(e, ct);
    }

    public async Task<Result<EventDto>> GetBySlugAsync(string slug, CancellationToken ct = default)
    {
        var normalized = slug.ToLowerInvariant();
        var e = await db.Events.AsNoTracking().Include(x => x.Agenda).FirstOrDefaultAsync(x => x.Slug == normalized, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");
        return await MapAsync(e, ct);
    }

    // ---- Mutations -------------------------------------------------------

    public async Task<Result<EventDto>> CreateAsync(CreateEventDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var slug = SlugOrAuto(dto.Slug, dto.Name);
        if (await db.Events.AnyAsync(x => x.Slug == slug, ct))
            return Error.Conflict("event.slug_duplicate", $"An event with slug '{slug}' already exists.");

        var e = new Event(Guid.NewGuid(), tenant.TenantId, slug, dto.Name, dto.Category, dto.EventDate, dto.Place);
        var hijri = string.IsNullOrWhiteSpace(dto.EventDateHijri) ? HijriDate.Format(dto.EventDate) : dto.EventDateHijri;
        e.UpdateCore(dto.Name, dto.NameArabic, dto.Tagline, dto.Description, dto.Category,
            dto.EventDate, hijri, dto.StartsAtUtc, dto.EndsAtUtc,
            dto.Place, dto.VenueAddress, dto.VenueLatitude, dto.VenueLongitude,
            dto.ContactPhone, dto.ContactEmail, dto.Notes, isActive: true);
        db.Events.Add(e);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<EventDto>> UpdateAsync(Guid id, UpdateEventDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var e = await db.Events.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");
        var hijri = string.IsNullOrWhiteSpace(dto.EventDateHijri) ? HijriDate.Format(dto.EventDate) : dto.EventDateHijri;
        e.UpdateCore(dto.Name, dto.NameArabic, dto.Tagline, dto.Description, dto.Category,
            dto.EventDate, hijri, dto.StartsAtUtc, dto.EndsAtUtc,
            dto.Place, dto.VenueAddress, dto.VenueLatitude, dto.VenueLongitude,
            dto.ContactPhone, dto.ContactEmail, dto.Notes, dto.IsActive);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<EventDto>> UpdateBrandingAsync(Guid id, UpdateEventBrandingDto dto, CancellationToken ct = default)
    {
        var e = await db.Events.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");
        e.UpdateBranding(dto.CoverImageUrl, dto.LogoUrl, dto.PrimaryColor, dto.AccentColor);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<EventDto>> UpdateShareAsync(Guid id, UpdateEventShareDto dto, CancellationToken ct = default)
    {
        var e = await db.Events.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");
        e.UpdateShare(dto.ShareTitle, dto.ShareDescription, dto.ShareImageUrl);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<EventDto>> UpdateRegistrationSettingsAsync(Guid id, UpdateRegistrationSettingsDto dto, CancellationToken ct = default)
    {
        var e = await db.Events.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");
        try
        {
            e.UpdateRegistrationSettings(dto.RegistrationsEnabled, dto.RegistrationOpensAtUtc, dto.RegistrationClosesAtUtc,
                dto.Capacity, dto.AllowGuests, dto.MaxGuestsPerRegistration, dto.OpenToNonMembers, dto.RequiresApproval);
        }
        catch (ArgumentException ex) { return Error.Validation("event.registration_settings_invalid", ex.Message); }
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<EventDto>> ReplaceAgendaAsync(Guid id, ReplaceAgendaDto dto, CancellationToken ct = default)
    {
        var e = await db.Events.Include(x => x.Agenda).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("event.not_found", "Event not found.");
        var items = dto.Items.Select(i => new EventAgendaItem(
            Guid.NewGuid(), i.Title, i.StartTime, i.EndTime, i.Speaker, i.Location, i.Description)).ToList();
        e.ReplaceAgenda(items);
        // Force the new owned children into Added state (EF OwnsMany workaround - see QarzanHasanaService).
        foreach (var ai in e.Agenda) db.MarkAdded(ai);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.Events.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Result.Failure(Error.NotFound("event.not_found", "Event not found."));
        var hasScans = await db.EventScans.AnyAsync(s => s.EventId == id, ct);
        var hasRegistrations = await db.EventRegistrations.AnyAsync(r => r.EventId == id, ct);
        if (hasScans || hasRegistrations)
        {
            // Soft-deactivate when history exists - never nuke audit trail.
            e.UpdateCore(e.Name, e.NameArabic, e.Tagline, e.Description, e.Category, e.EventDate, e.EventDateHijri,
                e.StartsAtUtc, e.EndsAtUtc, e.Place, e.VenueAddress, e.VenueLatitude, e.VenueLongitude,
                e.ContactPhone, e.ContactEmail, e.Notes, isActive: false);
        }
        else
        {
            db.Events.Remove(e);
        }
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    // ---- Scans -----------------------------------------------------------

    public async Task<PagedResult<EventScanDto>> ListScansAsync(ScanListQuery q, CancellationToken ct = default)
    {
        IQueryable<EventScan> query = db.EventScans.AsNoTracking();
        if (q.EventId is not null) query = query.Where(x => x.EventId == q.EventId);
        if (q.MemberId is not null) query = query.Where(x => x.MemberId == q.MemberId);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.ScannedAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => new EventScanDto(
                x.Id, x.EventId,
                db.Events.Where(e => e.Id == x.EventId).Select(e => e.Name).FirstOrDefault() ?? "",
                x.MemberId,
                db.Members.Where(m => m.Id == x.MemberId).Select(m => m.ItsNumber.Value).FirstOrDefault() ?? "",
                db.Members.Where(m => m.Id == x.MemberId).Select(m => m.FullName).FirstOrDefault() ?? "",
                x.ScannedAtUtc, x.Location))
            .ToListAsync(ct);
        return new PagedResult<EventScanDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<EventScanDto>> ScanAsync(ScanRequestDto dto, CancellationToken ct = default)
    {
        if (!ItsNumber.TryCreate(dto.ItsNumber, out var its))
            return Error.Validation("its.invalid", "Invalid ITS number.");
        var ev = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == dto.EventId, ct);
        if (ev is null || !ev.IsActive) return Error.NotFound("event.not_found", "Event not found or inactive.");
        var member = await db.Members.FirstOrDefaultAsync(m => m.ItsNumber == its && !m.IsDeleted, ct);
        if (member is null) return Error.NotFound("member.not_found", "Member not found for that ITS.");

        // De-dupe scan row
        var existing = await db.EventScans.FirstOrDefaultAsync(s => s.EventId == ev.Id && s.MemberId == member.Id, ct);
        EventScan scan;
        if (existing is null)
        {
            scan = new EventScan(Guid.NewGuid(), tenant.TenantId, ev.Id, member.Id, clock.UtcNow, dto.Location);
            scan.SetScanner(currentUser.UserId);
            db.EventScans.Add(scan);
        }
        else
        {
            scan = existing;
        }

        // If the member has an active registration for this event, auto-mark it checked-in.
        var reg = await db.EventRegistrations.FirstOrDefaultAsync(
            r => r.EventId == ev.Id && r.MemberId == member.Id
                 && r.Status != RegistrationStatus.Cancelled, ct);
        if (reg is not null && reg.Status != RegistrationStatus.CheckedIn)
        {
            reg.CheckIn(currentUser.UserId, clock.UtcNow);
        }

        member.RecordEventScan(ev.Id, ev.Name, dto.Location ?? ev.Place, clock.UtcNow);
        db.Members.Update(member);
        await uow.SaveChangesAsync(ct);

        return new EventScanDto(scan.Id, scan.EventId, ev.Name, scan.MemberId,
            member.ItsNumber.Value, member.FullName, scan.ScannedAtUtc, scan.Location);
    }

    public async Task<Result> RemoveScanAsync(Guid scanId, CancellationToken ct = default)
    {
        var scan = await db.EventScans.FirstOrDefaultAsync(x => x.Id == scanId, ct);
        if (scan is null) return Result.Failure(Error.NotFound("scan.not_found", "Scan not found."));
        db.EventScans.Remove(scan);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    // ---- Helpers ---------------------------------------------------------

    private async Task<EventDto> MapAsync(Event e, CancellationToken ct)
    {
        var stats = await db.EventRegistrations.AsNoTracking()
            .Where(r => r.EventId == e.Id)
            .GroupBy(r => r.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var regTotal = stats.Sum(s => s.Count);
        var confirmed = stats.Where(s => s.Status == RegistrationStatus.Confirmed).Sum(s => s.Count);
        var checkedIn = stats.Where(s => s.Status == RegistrationStatus.CheckedIn).Sum(s => s.Count);
        var waitlisted = stats.Where(s => s.Status == RegistrationStatus.Waitlisted).Sum(s => s.Count);
        var scanCount = await db.EventScans.CountAsync(s => s.EventId == e.Id, ct);

        var agenda = e.Agenda.OrderBy(a => a.SortOrder)
            .Select(a => new EventAgendaItemDto(a.Id, a.SortOrder, a.Title, a.StartTime, a.EndTime, a.Speaker, a.Location, a.Description))
            .ToList();

        return new EventDto(
            e.Id, e.Slug, e.Name, e.NameArabic, e.Tagline,
            e.Category, e.EventDate, e.EventDateHijri,
            e.StartsAtUtc, e.EndsAtUtc,
            e.Place, e.VenueAddress, e.VenueLatitude, e.VenueLongitude,
            e.CoverImageUrl, e.LogoUrl, e.PrimaryColor, e.AccentColor,
            e.ShareTitle, e.ShareDescription, e.ShareImageUrl,
            e.RegistrationsEnabled, e.RegistrationOpensAtUtc, e.RegistrationClosesAtUtc,
            e.Capacity, e.AllowGuests, e.MaxGuestsPerRegistration, e.OpenToNonMembers, e.RequiresApproval,
            e.ContactPhone, e.ContactEmail,
            e.IsActive, e.Notes,
            scanCount, regTotal, confirmed, checkedIn, waitlisted,
            agenda, e.CreatedAtUtc);
    }

    private static string SlugOrAuto(string? explicitSlug, string name)
    {
        var s = !string.IsNullOrWhiteSpace(explicitSlug) ? explicitSlug : Slugify(name);
        return s.ToLowerInvariant();
    }

    public static string Slugify(string input)
    {
        var sb = new System.Text.StringBuilder(input.Length);
        foreach (var c in input)
        {
            if (char.IsLetterOrDigit(c)) sb.Append(char.ToLowerInvariant(c));
            else if (c is ' ' or '-' or '_') sb.Append('-');
        }
        while (sb.ToString().Contains("--")) sb.Replace("--", "-");
        return sb.ToString().Trim('-');
    }
}

public sealed class CreateEventValidator : AbstractValidator<CreateEventDto>
{
    public CreateEventValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Slug).MaximumLength(100).Matches("^[a-z0-9-]*$").When(x => !string.IsNullOrEmpty(x.Slug));
    }
}
public sealed class UpdateEventValidator : AbstractValidator<UpdateEventDto>
{
    public UpdateEventValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Category).IsInEnum();
    }
}
