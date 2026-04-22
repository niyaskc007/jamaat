using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A community event with its own branded portal, registration workflow, and agenda.
/// Samples: Urs Mubarak, 19mi Raat, Shahadat, Ashara Mubaraka days, community iftaars, classes.
/// </summary>
public sealed class Event : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private readonly List<EventAgendaItem> _agenda = [];

    private Event() { }

    public Event(Guid id, Guid tenantId, string slug, string name, EventCategory category, DateOnly eventDate, string? place)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        if (string.IsNullOrWhiteSpace(slug)) throw new ArgumentException("Slug required.", nameof(slug));
        Id = id;
        TenantId = tenantId;
        Slug = slug.ToLowerInvariant();
        Name = name;
        Category = category;
        EventDate = eventDate;
        Place = place;
        IsActive = true;
        MaxGuestsPerRegistration = 0;
    }

    public Guid TenantId { get; private set; }
    /// URL-safe identifier unique per tenant — used for the public portal URL.
    public string Slug { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public string? NameArabic { get; private set; }
    public string? Tagline { get; private set; }
    public string? Description { get; private set; }   // markdown
    public EventCategory Category { get; private set; }

    // Date / time
    public DateOnly EventDate { get; private set; }
    public string? EventDateHijri { get; private set; }
    public DateTimeOffset? StartsAtUtc { get; private set; }
    public DateTimeOffset? EndsAtUtc { get; private set; }

    // Venue
    public string? Place { get; private set; }           // short label, e.g. "Hakimi Masjid"
    public string? VenueAddress { get; private set; }
    public decimal? VenueLatitude { get; private set; }
    public decimal? VenueLongitude { get; private set; }

    // Branding
    public string? CoverImageUrl { get; private set; }
    public string? LogoUrl { get; private set; }
    public string? PrimaryColor { get; private set; }    // #RRGGBB
    public string? AccentColor { get; private set; }

    // Share / SEO — rendered into <title> + <meta> tags on the portal page.
    public string? ShareTitle { get; private set; }
    public string? ShareDescription { get; private set; }
    public string? ShareImageUrl { get; private set; }

    // Registration settings
    public bool RegistrationsEnabled { get; private set; }
    public DateTimeOffset? RegistrationOpensAtUtc { get; private set; }
    public DateTimeOffset? RegistrationClosesAtUtc { get; private set; }
    public int? Capacity { get; private set; }          // null = unlimited
    public bool AllowGuests { get; private set; }       // members can add guests
    public int MaxGuestsPerRegistration { get; private set; }
    public bool OpenToNonMembers { get; private set; }  // public can register without a member record
    public bool RequiresApproval { get; private set; }  // Pending until admin confirms

    // Contact
    public string? ContactPhone { get; private set; }
    public string? ContactEmail { get; private set; }

    public bool IsActive { get; private set; }
    public string? Notes { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public IReadOnlyCollection<EventAgendaItem> Agenda => _agenda.AsReadOnly();

    // --- Update methods ---------------------------------------------------

    public void UpdateCore(string name, string? nameArabic, string? tagline, string? description,
        EventCategory category, DateOnly eventDate, string? hijri,
        DateTimeOffset? startsAtUtc, DateTimeOffset? endsAtUtc,
        string? place, string? venueAddress, decimal? lat, decimal? lng,
        string? contactPhone, string? contactEmail,
        string? notes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Name = name;
        NameArabic = nameArabic;
        Tagline = tagline;
        Description = description;
        Category = category;
        EventDate = eventDate;
        EventDateHijri = hijri;
        StartsAtUtc = startsAtUtc;
        EndsAtUtc = endsAtUtc;
        Place = place;
        VenueAddress = venueAddress;
        VenueLatitude = lat;
        VenueLongitude = lng;
        ContactPhone = contactPhone;
        ContactEmail = contactEmail;
        Notes = notes;
        IsActive = isActive;
    }

    public void UpdateBranding(string? coverImageUrl, string? logoUrl, string? primaryColor, string? accentColor)
    {
        CoverImageUrl = coverImageUrl;
        LogoUrl = logoUrl;
        PrimaryColor = NormaliseHex(primaryColor);
        AccentColor = NormaliseHex(accentColor);
    }

    public void UpdateShare(string? shareTitle, string? shareDescription, string? shareImageUrl)
    {
        ShareTitle = shareTitle;
        ShareDescription = shareDescription;
        ShareImageUrl = shareImageUrl;
    }

    public void UpdateRegistrationSettings(bool enabled, DateTimeOffset? opensAt, DateTimeOffset? closesAt,
        int? capacity, bool allowGuests, int maxGuests, bool openToNonMembers, bool requiresApproval)
    {
        if (capacity is < 0) throw new ArgumentException("Capacity must be non-negative.", nameof(capacity));
        if (maxGuests < 0) throw new ArgumentException("MaxGuests must be non-negative.", nameof(maxGuests));
        if (opensAt is { } o && closesAt is { } c && o > c)
            throw new ArgumentException("Registration window end must be after the start.");
        RegistrationsEnabled = enabled;
        RegistrationOpensAtUtc = opensAt;
        RegistrationClosesAtUtc = closesAt;
        Capacity = capacity;
        AllowGuests = allowGuests;
        MaxGuestsPerRegistration = maxGuests;
        OpenToNonMembers = openToNonMembers;
        RequiresApproval = requiresApproval;
    }

    public void ReplaceAgenda(IEnumerable<EventAgendaItem> items)
    {
        _agenda.Clear();
        var ordered = items.OrderBy(i => i.StartTime ?? TimeOnly.MinValue).ThenBy(i => i.SortOrder).ToList();
        for (var i = 0; i < ordered.Count; i++) ordered[i].SetOrder(i);
        _agenda.AddRange(ordered);
    }

    public void SetSlug(string slug)
    {
        if (string.IsNullOrWhiteSpace(slug)) throw new ArgumentException("Slug required.", nameof(slug));
        Slug = slug.ToLowerInvariant();
    }

    /// <summary>True if the portal is accepting registrations right now (settings + window both satisfied).</summary>
    public bool CanAcceptRegistrationsAt(DateTimeOffset at)
    {
        if (!IsActive || !RegistrationsEnabled) return false;
        if (RegistrationOpensAtUtc is { } o && at < o) return false;
        if (RegistrationClosesAtUtc is { } c && at > c) return false;
        return true;
    }

    private static string? NormaliseHex(string? v)
    {
        if (string.IsNullOrWhiteSpace(v)) return null;
        var t = v.Trim();
        if (!t.StartsWith('#')) t = "#" + t;
        return t.Length is 4 or 7 ? t.ToUpperInvariant() : null;
    }
}

/// <summary>Owned agenda item on an Event.</summary>
public sealed class EventAgendaItem : Entity<Guid>
{
    private EventAgendaItem() { }

    public EventAgendaItem(Guid id, string title, TimeOnly? startTime, TimeOnly? endTime,
        string? speaker, string? location, string? description, int sortOrder = 0)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("Title required.", nameof(title));
        Id = id;
        Title = title;
        StartTime = startTime;
        EndTime = endTime;
        Speaker = speaker;
        Location = location;
        Description = description;
        SortOrder = sortOrder;
    }

    public Guid EventId { get; private set; }
    public int SortOrder { get; private set; }
    public string Title { get; private set; } = default!;
    public TimeOnly? StartTime { get; private set; }
    public TimeOnly? EndTime { get; private set; }
    public string? Speaker { get; private set; }
    public string? Location { get; private set; }
    public string? Description { get; private set; }

    internal void SetOrder(int order) => SortOrder = order;
}

/// <summary>
/// A single member-at-event attendance record. On creation, the Member's last-scanned snapshot is refreshed.
/// </summary>
public sealed class EventScan : Entity<Guid>, ITenantScoped, IAuditable
{
    private EventScan() { }

    public EventScan(Guid id, Guid tenantId, Guid eventId, Guid memberId, DateTimeOffset scannedAtUtc, string? location = null)
    {
        Id = id;
        TenantId = tenantId;
        EventId = eventId;
        MemberId = memberId;
        ScannedAtUtc = scannedAtUtc;
        Location = location;
    }

    public Guid TenantId { get; private set; }
    public Guid EventId { get; private set; }
    public Guid MemberId { get; private set; }
    public DateTimeOffset ScannedAtUtc { get; private set; }
    public Guid? ScannedByUserId { get; private set; }
    public string? Location { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void SetScanner(Guid? userId) => ScannedByUserId = userId;
}
