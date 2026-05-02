using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Events;

// ----- Event DTOs ---------------------------------------------------------

public sealed record EventDto(
    Guid Id, string Slug, string Name, string? NameArabic, string? Tagline,
    EventCategory Category,
    DateOnly EventDate, string? EventDateHijri,
    DateTimeOffset? StartsAtUtc, DateTimeOffset? EndsAtUtc,
    string? Place, string? VenueAddress, decimal? VenueLatitude, decimal? VenueLongitude,
    string? CoverImageUrl, string? LogoUrl, string? PrimaryColor, string? AccentColor,
    string? ShareTitle, string? ShareDescription, string? ShareImageUrl,
    bool RegistrationsEnabled,
    DateTimeOffset? RegistrationOpensAtUtc, DateTimeOffset? RegistrationClosesAtUtc,
    int? Capacity, bool AllowGuests, int MaxGuestsPerRegistration,
    bool OpenToNonMembers, bool RequiresApproval,
    string? ContactPhone, string? ContactEmail,
    bool IsActive, string? Notes,
    int ScanCount, int RegistrationCount, int ConfirmedCount, int CheckedInCount, int WaitlistedCount,
    IReadOnlyList<EventAgendaItemDto> Agenda,
    DateTimeOffset CreatedAtUtc,
    // Resolved name for the EventCategory lookup matching this event's Category code. Null when no
    // matching lookup row exists (e.g. legacy data with a code that's been deleted).
    string? CategoryName = null);

public sealed record EventAgendaItemDto(
    Guid Id, int SortOrder, string Title, TimeOnly? StartTime, TimeOnly? EndTime,
    string? Speaker, string? Location, string? Description);

public sealed record CreateEventDto(
    string Slug, string Name, string? NameArabic, string? Tagline, string? Description,
    EventCategory Category,
    DateOnly EventDate, string? EventDateHijri,
    DateTimeOffset? StartsAtUtc, DateTimeOffset? EndsAtUtc,
    string? Place, string? VenueAddress, decimal? VenueLatitude, decimal? VenueLongitude,
    string? ContactPhone, string? ContactEmail, string? Notes);

public sealed record UpdateEventDto(
    string Name, string? NameArabic, string? Tagline, string? Description,
    EventCategory Category,
    DateOnly EventDate, string? EventDateHijri,
    DateTimeOffset? StartsAtUtc, DateTimeOffset? EndsAtUtc,
    string? Place, string? VenueAddress, decimal? VenueLatitude, decimal? VenueLongitude,
    string? ContactPhone, string? ContactEmail,
    string? Notes, bool IsActive);

public sealed record UpdateEventBrandingDto(
    string? CoverImageUrl, string? LogoUrl, string? PrimaryColor, string? AccentColor);

public sealed record UpdateEventShareDto(
    string? ShareTitle, string? ShareDescription, string? ShareImageUrl);

public sealed record UpdateRegistrationSettingsDto(
    bool RegistrationsEnabled,
    DateTimeOffset? RegistrationOpensAtUtc, DateTimeOffset? RegistrationClosesAtUtc,
    int? Capacity, bool AllowGuests, int MaxGuestsPerRegistration,
    bool OpenToNonMembers, bool RequiresApproval);

public sealed record ReplaceAgendaDto(IReadOnlyList<AgendaItemInput> Items);
public sealed record AgendaItemInput(string Title, TimeOnly? StartTime, TimeOnly? EndTime,
    string? Speaker, string? Location, string? Description);

public sealed record EventListQuery(
    int Page = 1, int PageSize = 50,
    string? Search = null, EventCategory? Category = null,
    DateOnly? FromDate = null, DateOnly? ToDate = null, bool? Active = null,
    bool? RegistrationsEnabled = null);

// ----- Scan DTOs (existing) -----------------------------------------------

public sealed record EventScanDto(
    Guid Id, Guid EventId, string EventName,
    Guid MemberId, string MemberItsNumber, string MemberName,
    DateTimeOffset ScannedAtUtc, string? Location);

public sealed record ScanRequestDto(Guid EventId, string ItsNumber, string? Location = null);
public sealed record ScanListQuery(int Page = 1, int PageSize = 50, Guid? EventId = null, Guid? MemberId = null);

// ----- Registration DTOs --------------------------------------------------

public sealed record EventGuestDto(
    Guid Id, string Name, AgeBand AgeBand, string? Relationship, string? Phone, string? Email,
    bool CheckedIn, DateTimeOffset? CheckedInAtUtc);

public sealed record EventRegistrationDto(
    Guid Id, Guid EventId, string EventName, string EventSlug,
    string RegistrationCode,
    Guid? MemberId, string AttendeeName, string? AttendeeEmail, string? AttendeePhone, string? AttendeeItsNumber,
    RegistrationStatus Status,
    int SeatCount,
    DateTimeOffset RegisteredAtUtc,
    DateTimeOffset? ConfirmedAtUtc, DateTimeOffset? CancelledAtUtc, string? CancellationReason,
    DateTimeOffset? CheckedInAtUtc,
    string? SpecialRequests, string? DietaryNotes,
    IReadOnlyList<EventGuestDto> Guests);

public sealed record GuestInput(string Name, AgeBand AgeBand, string? Relationship, string? Phone, string? Email);

public sealed record CreateRegistrationDto(
    Guid EventId,
    // When called by an authenticated member, memberId can be null (server infers from the current user).
    Guid? MemberId,
    string AttendeeName,
    string? AttendeeEmail,
    string? AttendeePhone,
    string? AttendeeItsNumber,
    string? SpecialRequests,
    string? DietaryNotes,
    IReadOnlyList<GuestInput>? Guests);

public sealed record UpdateRegistrationDto(
    string AttendeeName, string? AttendeeEmail, string? AttendeePhone,
    string? SpecialRequests, string? DietaryNotes,
    IReadOnlyList<GuestInput>? Guests);

public sealed record CancelRegistrationDto(string? Reason);

public sealed record RegistrationListQuery(
    int Page = 1, int PageSize = 50,
    Guid? EventId = null, Guid? MemberId = null,
    RegistrationStatus? Status = null,
    string? Search = null);

// ----- Public portal DTOs -------------------------------------------------

public sealed record PortalEventSummaryDto(
    Guid Id, string Slug, string Name, string? Tagline, EventCategory Category,
    DateOnly EventDate, string? EventDateHijri,
    DateTimeOffset? StartsAtUtc, DateTimeOffset? EndsAtUtc,
    string? Place, string? CoverImageUrl, string? PrimaryColor, string? AccentColor,
    bool RegistrationsOpenNow, int? SeatsRemaining,
    string? CategoryName = null);

public sealed record PortalEventDetailDto(
    PortalEventSummaryDto Summary,
    string? Description, string? NameArabic,
    string? VenueAddress, decimal? VenueLatitude, decimal? VenueLongitude,
    string? LogoUrl,
    string? ContactPhone, string? ContactEmail,
    bool AllowGuests, int MaxGuestsPerRegistration,
    bool OpenToNonMembers, bool RequiresApproval,
    string? ShareTitle, string? ShareDescription, string? ShareImageUrl,
    IReadOnlyList<EventAgendaItemDto> Agenda,
    IReadOnlyList<EventPageSectionDto> Sections,
    bool HasCustomPage);

// ----- Communication DTOs -------------------------------------------------

public sealed record EventCommunicationDto(
    Guid Id, Guid EventId,
    CommunicationChannel Channel, CommunicationRecipientFilter RecipientFilter,
    string Subject, string Body,
    CommunicationStatus Status,
    DateTimeOffset? ScheduledForUtc, DateTimeOffset? SentAtUtc, Guid? SentByUserId, string? SentByUserName,
    int TargetedCount, int SentCount, int FailedCount, string? LastError,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateCommunicationDto(
    Guid EventId, CommunicationChannel Channel, CommunicationRecipientFilter RecipientFilter,
    string Subject, string Body, DateTimeOffset? ScheduledForUtc);

public sealed record UpdateCommunicationDto(
    CommunicationChannel Channel, CommunicationRecipientFilter RecipientFilter,
    string Subject, string Body, DateTimeOffset? ScheduledForUtc);

public sealed record CommunicationListQuery(int Page = 1, int PageSize = 25, Guid? EventId = null);

// ----- Page Designer DTOs -------------------------------------------------

public sealed record EventPageSectionDto(
    Guid Id, Guid EventId, EventPageSectionType Type,
    int SortOrder, bool IsVisible, string ContentJson);

public sealed record AddSectionDto(EventPageSectionType Type, string? ContentJson, int? SortOrder);
public sealed record UpdateSectionDto(string ContentJson, bool IsVisible);
public sealed record ReorderSectionsDto(IReadOnlyList<Guid> SectionIds);

public sealed record ApplyPresetDto(string PresetKey, bool ReplaceExisting);
public sealed record PresetInfoDto(string Key, string Name, string Description, int SectionCount);
