using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A single registration for an Event. One record per registrant; guests are owned children.
/// A Member can have at most one non-cancelled registration per event.
/// </summary>
public sealed class EventRegistration : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private readonly List<EventGuest> _guests = [];

    private EventRegistration() { }

    public EventRegistration(Guid id, Guid tenantId, Guid eventId, string registrationCode,
        Guid? memberId, string attendeeName, string? attendeeEmail, string? attendeePhone,
        string? attendeeItsNumber, RegistrationStatus initialStatus, DateTimeOffset registeredAtUtc)
    {
        if (string.IsNullOrWhiteSpace(registrationCode)) throw new ArgumentException("Code required.", nameof(registrationCode));
        if (string.IsNullOrWhiteSpace(attendeeName)) throw new ArgumentException("Attendee name required.", nameof(attendeeName));
        Id = id;
        TenantId = tenantId;
        EventId = eventId;
        RegistrationCode = registrationCode.ToUpperInvariant();
        MemberId = memberId;
        AttendeeName = attendeeName;
        AttendeeEmail = attendeeEmail;
        AttendeePhone = attendeePhone;
        AttendeeItsNumber = attendeeItsNumber;
        Status = initialStatus;
        RegisteredAtUtc = registeredAtUtc;
    }

    public Guid TenantId { get; private set; }
    public Guid EventId { get; private set; }
    public string RegistrationCode { get; private set; } = default!;

    // Attendee
    public Guid? MemberId { get; private set; }           // null for external guests
    public string AttendeeName { get; private set; } = default!;
    public string? AttendeeEmail { get; private set; }
    public string? AttendeePhone { get; private set; }
    public string? AttendeeItsNumber { get; private set; }

    public RegistrationStatus Status { get; private set; }
    public DateTimeOffset RegisteredAtUtc { get; private set; }
    public DateTimeOffset? ConfirmedAtUtc { get; private set; }
    public Guid? ConfirmedByUserId { get; private set; }
    public DateTimeOffset? CancelledAtUtc { get; private set; }
    public string? CancellationReason { get; private set; }
    public DateTimeOffset? CheckedInAtUtc { get; private set; }
    public Guid? CheckedInByUserId { get; private set; }

    public string? SpecialRequests { get; private set; }
    public string? DietaryNotes { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public IReadOnlyCollection<EventGuest> Guests => _guests.AsReadOnly();

    /// <summary>Seats total: the attendee themselves + any guests. Used for capacity counting.</summary>
    public int SeatCount => 1 + _guests.Count;

    // --- Behaviour --------------------------------------------------------

    public void SetGuests(IEnumerable<EventGuest> guests)
    {
        _guests.Clear();
        _guests.AddRange(guests);
    }

    public void UpdateNotes(string? specialRequests, string? dietary)
    {
        SpecialRequests = specialRequests;
        DietaryNotes = dietary;
    }

    public void Confirm(Guid userId, DateTimeOffset at)
    {
        if (Status is RegistrationStatus.Cancelled or RegistrationStatus.CheckedIn or RegistrationStatus.NoShow)
            throw new InvalidOperationException($"Cannot confirm a {Status} registration.");
        Status = RegistrationStatus.Confirmed;
        ConfirmedAtUtc = at;
        ConfirmedByUserId = userId;
    }

    public void Waitlist()
    {
        if (Status is RegistrationStatus.CheckedIn or RegistrationStatus.NoShow or RegistrationStatus.Cancelled)
            throw new InvalidOperationException($"Cannot waitlist a {Status} registration.");
        Status = RegistrationStatus.Waitlisted;
    }

    public void Cancel(string? reason, DateTimeOffset at)
    {
        if (Status is RegistrationStatus.CheckedIn)
            throw new InvalidOperationException("Already-checked-in registrations cannot be cancelled.");
        Status = RegistrationStatus.Cancelled;
        CancelledAtUtc = at;
        CancellationReason = reason;
    }

    public void CheckIn(Guid? userId, DateTimeOffset at)
    {
        if (Status is RegistrationStatus.Cancelled)
            throw new InvalidOperationException("Cancelled registrations cannot be checked in.");
        Status = RegistrationStatus.CheckedIn;
        CheckedInAtUtc = at;
        CheckedInByUserId = userId;
    }

    public void MarkNoShow(DateTimeOffset at)
    {
        if (Status is RegistrationStatus.CheckedIn) return;
        Status = RegistrationStatus.NoShow;
    }
}

/// <summary>An accompanying guest on a registration. Stored as an owned child.</summary>
public sealed class EventGuest : Entity<Guid>
{
    private EventGuest() { }

    public EventGuest(Guid id, string name, AgeBand ageBand, string? relationship, string? phone, string? email)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Guest name required.", nameof(name));
        Id = id;
        Name = name;
        AgeBand = ageBand;
        Relationship = relationship;
        Phone = phone;
        Email = email;
    }

    public Guid EventRegistrationId { get; private set; }
    public string Name { get; private set; } = default!;
    public AgeBand AgeBand { get; private set; }
    public string? Relationship { get; private set; }
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public bool CheckedIn { get; private set; }
    public DateTimeOffset? CheckedInAtUtc { get; private set; }

    public void CheckIn(DateTimeOffset at)
    {
        CheckedIn = true;
        CheckedInAtUtc = at;
    }
}

/// <summary>
/// A communication (email / SMS / WhatsApp) sent to a slice of the event's registrants.
/// Phase 1 models the history + compose UI. Actual delivery adapter wires in Phase 2.
/// </summary>
public sealed class EventCommunication : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private EventCommunication() { }

    public EventCommunication(Guid id, Guid tenantId, Guid eventId, CommunicationChannel channel,
        CommunicationRecipientFilter filter, string subject, string body)
    {
        Id = id;
        TenantId = tenantId;
        EventId = eventId;
        Channel = channel;
        RecipientFilter = filter;
        Subject = subject;
        Body = body;
        Status = CommunicationStatus.Draft;
    }

    public Guid TenantId { get; private set; }
    public Guid EventId { get; private set; }
    public CommunicationChannel Channel { get; private set; }
    public CommunicationRecipientFilter RecipientFilter { get; private set; }
    public string Subject { get; private set; } = default!;
    public string Body { get; private set; } = default!;
    public CommunicationStatus Status { get; private set; }
    public DateTimeOffset? ScheduledForUtc { get; private set; }
    public DateTimeOffset? SentAtUtc { get; private set; }
    public Guid? SentByUserId { get; private set; }
    public int TargetedCount { get; private set; }
    public int SentCount { get; private set; }
    public int FailedCount { get; private set; }
    public string? LastError { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void UpdateDraft(CommunicationChannel channel, CommunicationRecipientFilter filter, string subject, string body, DateTimeOffset? scheduledFor)
    {
        if (Status is CommunicationStatus.Sent or CommunicationStatus.Sending)
            throw new InvalidOperationException("Sent or in-flight comms cannot be edited.");
        Channel = channel;
        RecipientFilter = filter;
        Subject = subject;
        Body = body;
        ScheduledForUtc = scheduledFor;
        Status = scheduledFor is null ? CommunicationStatus.Draft : CommunicationStatus.Scheduled;
    }

    public void BeginSend(int targetedCount)
    {
        Status = CommunicationStatus.Sending;
        TargetedCount = targetedCount;
        SentCount = 0;
        FailedCount = 0;
        LastError = null;
    }

    public void CompleteSend(int sent, int failed, Guid? byUserId, DateTimeOffset at, string? lastError)
    {
        Status = failed > 0 && sent == 0 ? CommunicationStatus.Failed : CommunicationStatus.Sent;
        SentCount = sent;
        FailedCount = failed;
        SentAtUtc = at;
        SentByUserId = byUserId;
        LastError = lastError;
    }
}
