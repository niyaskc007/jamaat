using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Events;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Events;

public interface IEventRegistrationService
{
    Task<PagedResult<EventRegistrationDto>> ListAsync(RegistrationListQuery q, CancellationToken ct = default);
    Task<Result<EventRegistrationDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<EventRegistrationDto>> GetByCodeAsync(string code, CancellationToken ct = default);
    /// <summary>Registers the current member (or external guest) for an event.</summary>
    Task<Result<EventRegistrationDto>> RegisterAsync(CreateRegistrationDto dto, CancellationToken ct = default);
    Task<Result<EventRegistrationDto>> UpdateAsync(Guid id, UpdateRegistrationDto dto, CancellationToken ct = default);
    Task<Result<EventRegistrationDto>> ConfirmAsync(Guid id, CancellationToken ct = default);
    Task<Result<EventRegistrationDto>> CheckInAsync(Guid id, CancellationToken ct = default);
    Task<Result<EventRegistrationDto>> CancelAsync(Guid id, CancelRegistrationDto dto, CancellationToken ct = default);
}

public sealed class EventRegistrationService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    ICurrentUser currentUser, IClock clock,
    IValidator<CreateRegistrationDto> createV, IValidator<UpdateRegistrationDto> updateV) : IEventRegistrationService
{
    public async Task<PagedResult<EventRegistrationDto>> ListAsync(RegistrationListQuery q, CancellationToken ct = default)
    {
        IQueryable<EventRegistration> query = db.EventRegistrations.AsNoTracking().Include(x => x.Guests);
        if (q.EventId is not null) query = query.Where(r => r.EventId == q.EventId);
        if (q.MemberId is not null) query = query.Where(r => r.MemberId == q.MemberId);
        if (q.Status is not null) query = query.Where(r => r.Status == q.Status);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(r =>
                EF.Functions.Like(r.AttendeeName, $"%{s}%") ||
                EF.Functions.Like(r.RegistrationCode, $"%{s}%") ||
                (r.AttendeeEmail != null && EF.Functions.Like(r.AttendeeEmail, $"%{s}%")) ||
                (r.AttendeeItsNumber != null && EF.Functions.Like(r.AttendeeItsNumber, $"%{s}%")));
        }

        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(r => r.RegisteredAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .ToListAsync(ct);

        // Batch-load event names
        var eventIds = rows.Select(r => r.EventId).Distinct().ToList();
        var events = await db.Events.AsNoTracking()
            .Where(e => eventIds.Contains(e.Id))
            .Select(e => new { e.Id, e.Name, e.Slug })
            .ToDictionaryAsync(e => e.Id, ct);

        var dtos = rows.Select(r => Map(r, events.TryGetValue(r.EventId, out var ev) ? ev.Name : "", events.TryGetValue(r.EventId, out var ev2) ? ev2.Slug : "")).ToList();
        return new PagedResult<EventRegistrationDto>(dtos, total, q.Page, q.PageSize);
    }

    public async Task<Result<EventRegistrationDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var r = await db.EventRegistrations.AsNoTracking().Include(x => x.Guests).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Error.NotFound("registration.not_found", "Registration not found.");
        var ev = await db.Events.AsNoTracking().Where(e => e.Id == r.EventId)
            .Select(e => new { e.Name, e.Slug }).FirstOrDefaultAsync(ct);
        return Map(r, ev?.Name ?? "", ev?.Slug ?? "");
    }

    public async Task<Result<EventRegistrationDto>> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        var normalized = code.ToUpperInvariant();
        var r = await db.EventRegistrations.AsNoTracking().Include(x => x.Guests)
            .FirstOrDefaultAsync(x => x.RegistrationCode == normalized, ct);
        if (r is null) return Error.NotFound("registration.not_found", "Registration not found.");
        var ev = await db.Events.AsNoTracking().Where(e => e.Id == r.EventId)
            .Select(e => new { e.Name, e.Slug }).FirstOrDefaultAsync(ct);
        return Map(r, ev?.Name ?? "", ev?.Slug ?? "");
    }

    public async Task<Result<EventRegistrationDto>> RegisterAsync(CreateRegistrationDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);

        var ev = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == dto.EventId, ct);
        if (ev is null) return Error.NotFound("event.not_found", "Event not found.");
        if (!ev.CanAcceptRegistrationsAt(clock.UtcNow))
            return Error.Business("event.registration_closed", "This event is not currently accepting registrations.");

        // Resolve memberId: explicit → from DTO; fallback → current user's member (matched by email)
        var memberId = dto.MemberId;
        if (memberId is null && currentUser.UserId is Guid uid)
        {
            memberId = await db.Members.AsNoTracking()
                .Where(m => m.ExternalUserId == uid.ToString())
                .Select(m => (Guid?)m.Id).FirstOrDefaultAsync(ct);
        }

        if (memberId is null && !ev.OpenToNonMembers)
            return Error.Business("event.members_only", "This event is only open to registered members.");

        // Capacity guard: count seats (attendee + guests) across all non-cancelled registrations
        var guestCount = dto.Guests?.Count ?? 0;
        if (!ev.AllowGuests && guestCount > 0)
            return Error.Business("event.no_guests", "This event does not allow guests.");
        if (guestCount > ev.MaxGuestsPerRegistration)
            return Error.Business("event.too_many_guests",
                $"At most {ev.MaxGuestsPerRegistration} guest(s) allowed per registration.");

        var seatsRequested = 1 + guestCount;
        int? remaining = null;
        if (ev.Capacity is int cap)
        {
            var seatsTaken = await db.EventRegistrations.AsNoTracking()
                .Where(r => r.EventId == ev.Id && r.Status != RegistrationStatus.Cancelled)
                .SelectMany(r => r.Guests.Select(g => 1)).CountAsync(ct)   // guests
                + await db.EventRegistrations.AsNoTracking()
                    .CountAsync(r => r.EventId == ev.Id && r.Status != RegistrationStatus.Cancelled, ct); // attendees
            remaining = cap - seatsTaken;
        }

        // Duplicate check - one registration per member per event
        if (memberId is Guid mid)
        {
            var dup = await db.EventRegistrations.AsNoTracking()
                .AnyAsync(r => r.EventId == ev.Id && r.MemberId == mid && r.Status != RegistrationStatus.Cancelled, ct);
            if (dup) return Error.Conflict("registration.duplicate", "You are already registered for this event.");
        }

        // Determine status: waitlist if capacity full, pending if approval required, else confirmed.
        var initialStatus =
            (remaining is { } r && r < seatsRequested) ? RegistrationStatus.Waitlisted
            : ev.RequiresApproval ? RegistrationStatus.Pending
            : RegistrationStatus.Confirmed;

        // Load member-side info for attendee defaults if caller didn't provide them
        string attendeeName = dto.AttendeeName;
        string? attendeeIts = dto.AttendeeItsNumber;
        if (memberId is Guid m2)
        {
            var mem = await db.Members.AsNoTracking().Where(m => m.Id == m2)
                .Select(m => new { m.FullName, m.ItsNumber, m.Email, m.Phone }).FirstOrDefaultAsync(ct);
            if (mem is not null)
            {
                if (string.IsNullOrWhiteSpace(attendeeName)) attendeeName = mem.FullName;
                attendeeIts ??= mem.ItsNumber.Value;
            }
        }

        var reg = new EventRegistration(
            id: Guid.NewGuid(), tenantId: tenant.TenantId, eventId: ev.Id,
            registrationCode: NextCode(),
            memberId: memberId,
            attendeeName: attendeeName,
            attendeeEmail: dto.AttendeeEmail,
            attendeePhone: dto.AttendeePhone,
            attendeeItsNumber: attendeeIts,
            initialStatus: initialStatus,
            registeredAtUtc: clock.UtcNow);
        reg.UpdateNotes(dto.SpecialRequests, dto.DietaryNotes);

        if (dto.Guests is { Count: > 0 })
        {
            var guests = dto.Guests.Select(g => new EventGuest(
                Guid.NewGuid(), g.Name, g.AgeBand, g.Relationship, g.Phone, g.Email)).ToList();
            reg.SetGuests(guests);
        }

        db.EventRegistrations.Add(reg);
        foreach (var g in reg.Guests) db.MarkAdded(g);  // OwnsMany workaround

        // Auto-confirm when no approval required (Confirmed status is already set above)
        if (initialStatus == RegistrationStatus.Confirmed)
            reg.Confirm(currentUser.UserId ?? Guid.Empty, clock.UtcNow);

        await uow.SaveChangesAsync(ct);
        return await GetAsync(reg.Id, ct);
    }

    public async Task<Result<EventRegistrationDto>> UpdateAsync(Guid id, UpdateRegistrationDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var r = await db.EventRegistrations.Include(x => x.Guests).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Error.NotFound("registration.not_found", "Registration not found.");
        if (r.Status is RegistrationStatus.Cancelled or RegistrationStatus.CheckedIn)
            return Error.Business("registration.locked", $"Cannot edit a {r.Status} registration.");

        r.UpdateNotes(dto.SpecialRequests, dto.DietaryNotes);
        var guests = (dto.Guests ?? Array.Empty<GuestInput>())
            .Select(g => new EventGuest(Guid.NewGuid(), g.Name, g.AgeBand, g.Relationship, g.Phone, g.Email))
            .ToList();
        r.SetGuests(guests);
        foreach (var g in r.Guests) db.MarkAdded(g);
        // Also persist the attendee-contact changes
        var ev = await db.Events.AsNoTracking().Where(e => e.Id == r.EventId).Select(e => new { e.Name, e.Slug }).FirstOrDefaultAsync(ct);
        // attendeeName / email / phone are updated via reflection-free helper on entity - add if we need mutability. For now, keep immutable; clients send the registration with final values on register.
        _ = dto.AttendeeName; _ = dto.AttendeeEmail; _ = dto.AttendeePhone;
        await uow.SaveChangesAsync(ct);
        return Map(r, ev?.Name ?? "", ev?.Slug ?? "");
    }

    public async Task<Result<EventRegistrationDto>> ConfirmAsync(Guid id, CancellationToken ct = default)
    {
        var r = await db.EventRegistrations.Include(x => x.Guests).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Error.NotFound("registration.not_found", "Registration not found.");
        try { r.Confirm(currentUser.UserId ?? Guid.Empty, clock.UtcNow); }
        catch (InvalidOperationException ex) { return Error.Business("registration.cannot_confirm", ex.Message); }
        await uow.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<Result<EventRegistrationDto>> CheckInAsync(Guid id, CancellationToken ct = default)
    {
        var r = await db.EventRegistrations.Include(x => x.Guests).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Error.NotFound("registration.not_found", "Registration not found.");
        try { r.CheckIn(currentUser.UserId, clock.UtcNow); }
        catch (InvalidOperationException ex) { return Error.Business("registration.cannot_check_in", ex.Message); }
        await uow.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<Result<EventRegistrationDto>> CancelAsync(Guid id, CancelRegistrationDto dto, CancellationToken ct = default)
    {
        var r = await db.EventRegistrations.Include(x => x.Guests).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Error.NotFound("registration.not_found", "Registration not found.");
        try { r.Cancel(dto.Reason, clock.UtcNow); }
        catch (InvalidOperationException ex) { return Error.Business("registration.cannot_cancel", ex.Message); }
        await uow.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    private static EventRegistrationDto Map(EventRegistration r, string eventName, string eventSlug) => new(
        r.Id, r.EventId, eventName, eventSlug, r.RegistrationCode,
        r.MemberId, r.AttendeeName, r.AttendeeEmail, r.AttendeePhone, r.AttendeeItsNumber,
        r.Status, r.SeatCount, r.RegisteredAtUtc, r.ConfirmedAtUtc, r.CancelledAtUtc, r.CancellationReason,
        r.CheckedInAtUtc, r.SpecialRequests, r.DietaryNotes,
        r.Guests.Select(g => new EventGuestDto(g.Id, g.Name, g.AgeBand, g.Relationship, g.Phone, g.Email,
            g.CheckedIn, g.CheckedInAtUtc)).ToList());

    private static string NextCode() =>
        "REG-" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
}

public sealed class CreateRegistrationValidator : AbstractValidator<CreateRegistrationDto>
{
    public CreateRegistrationValidator()
    {
        RuleFor(x => x.EventId).NotEmpty();
        RuleFor(x => x.AttendeeName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AttendeeEmail).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.AttendeeEmail));
    }
}
public sealed class UpdateRegistrationValidator : AbstractValidator<UpdateRegistrationDto>
{
    public UpdateRegistrationValidator()
    {
        RuleFor(x => x.AttendeeName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AttendeeEmail).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.AttendeeEmail));
    }
}
