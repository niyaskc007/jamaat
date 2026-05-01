/**
 * Section-content schemas, one per EventPageSectionType. These are discriminated unions keyed by `type`
 * - use {@link parseSection} to turn the raw API row into a strongly-typed value.
 */

export type EventPageSectionType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export const EventPageSectionTypeLabel: Record<EventPageSectionType, string> = {
  1: 'Hero banner',
  2: 'Text block',
  3: 'Agenda',
  4: 'Speakers',
  5: 'Venue & map',
  6: 'Gallery',
  7: 'FAQ',
  8: 'Call to action',
  9: 'Registration form',
  10: 'Countdown',
  11: 'Stats',
  12: 'Sponsors',
  13: 'Custom HTML',
};

export const EventPageSectionTypeDescription: Record<EventPageSectionType, string> = {
  1: 'Large banner at the top of the page - heading, subtitle and a call-to-action button.',
  2: 'A rich text block with formatted body content.',
  3: 'Shows the event agenda (uses the schedule you set under the Agenda tab).',
  4: 'Grid of speakers with photo, name and title.',
  5: 'Address + embedded map. Uses the event\'s venue details.',
  6: 'Photo gallery with captions.',
  7: 'Frequently asked questions in an accordion.',
  8: 'Full-width banner prompting people to act (register, RSVP, etc.).',
  9: 'Embedded registration form. Drop this wherever on the page.',
  10: 'Live countdown timer to the event start (days / hours / minutes).',
  11: 'A row of big-number highlights (e.g., "500 attendees last year").',
  12: 'Logo wall for sponsors or partners.',
  13: 'Raw HTML for advanced use - renders as-is. Use sparingly.',
};

export const EventPageSectionTypeIcon: Record<EventPageSectionType, string> = {
  1: '🎯', 2: '📝', 3: '🗓', 4: '🎤', 5: '📍', 6: '🖼', 7: '❓', 8: '⚡', 9: '✍️',
  10: '⏳', 11: '📊', 12: '🤝', 13: '🧩',
};

/** Common visual envelope applied around every section (padding, background, text color, width). */
export type SectionStyle = {
  paddingTop?: number;       // px
  paddingBottom?: number;    // px
  background?: string;       // CSS color, gradient, or rgba()
  backgroundImageUrl?: string;
  overlay?: boolean;         // darken background image for contrast
  textColor?: string;        // CSS color
  maxWidth?: number;         // px; null/undefined = full width of parent
};

export type HeroContent = {
  heading: string;
  subheading?: string;
  useEventCover?: boolean;       // if true, use the event's coverImageUrl as the background
  backgroundImageUrl?: string;   // explicit override
  backgroundColor?: string;      // CSS color or gradient - used when there's no image to fall back to
  overlay?: boolean;             // darkens the image so text stays legible
  ctaLabel?: string;
  ctaTarget?: 'register' | string; // 'register' scrolls to the registration section; otherwise treated as URL
  alignment?: 'left' | 'center' | 'right';
};

export type TextContent = {
  heading?: string;
  body: string;                  // rendered as markdown-lite (newlines → paragraphs, ** bold **, * italic *)
  alignment?: 'left' | 'center';
};

export type AgendaContent = {
  heading?: string;
  showTime?: boolean;
  showSpeaker?: boolean;
};

export type Speaker = {
  name: string; title?: string; bio?: string; photoUrl?: string;
};
export type SpeakersContent = {
  heading?: string;
  speakers: Speaker[];
};

export type VenueContent = {
  heading?: string;
  showMap?: boolean;             // renders an OpenStreetMap iframe when lat/lng exist
  addressOverride?: string;      // else uses event.venueAddress
};

export type GalleryImage = { url: string; caption?: string };
export type GalleryContent = {
  heading?: string;
  images: GalleryImage[];
};

export type FaqItem = { question: string; answer: string };
export type FaqContent = {
  heading?: string;
  items: FaqItem[];
};

export type CtaContent = {
  heading: string;
  subheading?: string;
  buttonLabel: string;
  buttonTarget?: 'register' | string;
  tone?: 'primary' | 'accent' | 'dark';
};

export type RegistrationContent = {
  heading?: string;
  showGuests?: boolean;
};

export type CountdownContent = {
  heading?: string;
  targetKind?: 'eventStart' | 'custom';
  customIsoDateTime?: string;   // ISO string; only used when targetKind = 'custom'
  completedLabel?: string;      // shown when the timer has elapsed
};

export type StatItem = { value: string; label: string };
export type StatsContent = {
  heading?: string;
  items: StatItem[];
};

export type SponsorItem = { name: string; logoUrl?: string; href?: string };
export type SponsorsContent = {
  heading?: string;
  sponsors: SponsorItem[];
};

export type CustomHtmlContent = {
  html: string;
};

/** Any section content may carry a visual envelope. */
export type WithStyle<T> = T & { style?: SectionStyle };

export type SectionContent =
  | { type: 1; content: WithStyle<HeroContent> }
  | { type: 2; content: WithStyle<TextContent> }
  | { type: 3; content: WithStyle<AgendaContent> }
  | { type: 4; content: WithStyle<SpeakersContent> }
  | { type: 5; content: WithStyle<VenueContent> }
  | { type: 6; content: WithStyle<GalleryContent> }
  | { type: 7; content: WithStyle<FaqContent> }
  | { type: 8; content: WithStyle<CtaContent> }
  | { type: 9; content: WithStyle<RegistrationContent> }
  | { type: 10; content: WithStyle<CountdownContent> }
  | { type: 11; content: WithStyle<StatsContent> }
  | { type: 12; content: WithStyle<SponsorsContent> }
  | { type: 13; content: WithStyle<CustomHtmlContent> };

export type RawSection = {
  id: string; eventId: string; type: EventPageSectionType;
  sortOrder: number; isVisible: boolean; contentJson: string;
};

export function parseSection(raw: RawSection): SectionContent & { id: string; sortOrder: number; isVisible: boolean } {
  let content: unknown;
  try { content = JSON.parse(raw.contentJson || '{}'); } catch { content = {}; }
  // Cast - section renderers tolerate missing fields with fallbacks, so we don't validate deeply here.
  return { id: raw.id, sortOrder: raw.sortOrder, isVisible: raw.isVisible, type: raw.type, content: content as never };
}

export function stringifyContent(content: unknown): string {
  return JSON.stringify(content ?? {}, null, 2);
}
