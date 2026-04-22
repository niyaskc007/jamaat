namespace Jamaat.Domain.Enums;

public enum RegistrationStatus
{
    Pending = 1,        // awaits admin approval (event requires approval)
    Confirmed = 2,      // good to go
    Waitlisted = 3,     // capacity reached; auto-promote on cancellation (manual for now)
    Cancelled = 4,
    CheckedIn = 5,      // actually showed up
    NoShow = 6,         // event ended, not checked in
}

public enum AgeBand
{
    Unknown = 0,
    Child = 1,          // under 13
    Teen = 2,           // 13-17
    Adult = 3,          // 18-59
    Senior = 4,         // 60+
}

public enum CommunicationChannel
{
    Email = 1,
    Sms = 2,
    InApp = 3,
    WhatsApp = 4,
}

public enum CommunicationStatus
{
    Draft = 1,
    Scheduled = 2,
    Sending = 3,
    Sent = 4,
    Failed = 5,
}

public enum CommunicationRecipientFilter
{
    All = 1,
    Confirmed = 2,
    Pending = 3,
    Waitlisted = 4,
    CheckedIn = 5,
    NotCheckedIn = 6,
}

/// <summary>
/// Kinds of layout blocks that can be placed on an event's public portal page.
/// Each type interprets the section's ContentJson with its own schema (see the TS section registry).
/// </summary>
public enum EventPageSectionType
{
    Hero = 1,
    Text = 2,
    Agenda = 3,
    Speakers = 4,
    Venue = 5,
    Gallery = 6,
    Faq = 7,
    Cta = 8,
    Registration = 9,
    Countdown = 10,
    Stats = 11,
    Sponsors = 12,
    CustomHtml = 13,
}
