import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type EventCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const EventCategoryLabel: Record<EventCategory, string> = {
  0: 'Other', 1: 'Urs', 2: 'Miladi', 3: 'Shahadat', 4: 'Night',
  5: 'Ashara Mubaraka', 6: 'Religious', 7: 'Community',
};

export type RegistrationStatus = 1 | 2 | 3 | 4 | 5 | 6;
export const RegistrationStatusLabel: Record<RegistrationStatus, string> = {
  1: 'Pending', 2: 'Confirmed', 3: 'Waitlisted', 4: 'Cancelled', 5: 'Checked-in', 6: 'No-show',
};
export const RegistrationStatusColor: Record<RegistrationStatus, string> = {
  1: 'gold', 2: 'green', 3: 'blue', 4: 'default', 5: 'cyan', 6: 'red',
};

export type AgeBand = 0 | 1 | 2 | 3 | 4;
export const AgeBandLabel: Record<AgeBand, string> = {
  0: 'Unknown', 1: 'Child', 2: 'Teen', 3: 'Adult', 4: 'Senior',
};

export type EventAgendaItem = {
  id: string; sortOrder: number; title: string;
  startTime?: string | null; endTime?: string | null;
  speaker?: string | null; location?: string | null; description?: string | null;
};

export type Event = {
  id: string;
  slug: string;
  name: string; nameArabic?: string | null; tagline?: string | null;
  category: EventCategory;
  eventDate: string; eventDateHijri?: string | null;
  startsAtUtc?: string | null; endsAtUtc?: string | null;
  place?: string | null; venueAddress?: string | null;
  venueLatitude?: number | null; venueLongitude?: number | null;
  coverImageUrl?: string | null; logoUrl?: string | null;
  primaryColor?: string | null; accentColor?: string | null;
  shareTitle?: string | null; shareDescription?: string | null; shareImageUrl?: string | null;
  registrationsEnabled: boolean;
  registrationOpensAtUtc?: string | null; registrationClosesAtUtc?: string | null;
  capacity?: number | null;
  allowGuests: boolean; maxGuestsPerRegistration: number;
  openToNonMembers: boolean; requiresApproval: boolean;
  contactPhone?: string | null; contactEmail?: string | null;
  isActive: boolean; notes?: string | null;
  scanCount: number; registrationCount: number;
  confirmedCount: number; checkedInCount: number; waitlistedCount: number;
  agenda: EventAgendaItem[];
  createdAtUtc: string;
};

export type EventGuest = {
  id: string; name: string; ageBand: AgeBand;
  relationship?: string | null; phone?: string | null; email?: string | null;
  checkedIn: boolean; checkedInAtUtc?: string | null;
};

export type EventRegistration = {
  id: string; eventId: string; eventName: string; eventSlug: string;
  registrationCode: string;
  memberId?: string | null;
  attendeeName: string; attendeeEmail?: string | null; attendeePhone?: string | null; attendeeItsNumber?: string | null;
  status: RegistrationStatus;
  seatCount: number;
  registeredAtUtc: string;
  confirmedAtUtc?: string | null; cancelledAtUtc?: string | null; cancellationReason?: string | null;
  checkedInAtUtc?: string | null;
  specialRequests?: string | null; dietaryNotes?: string | null;
  guests: EventGuest[];
};

export type EventScan = {
  id: string;
  eventId: string; eventName: string;
  memberId: string; memberItsNumber: string; memberName: string;
  scannedAtUtc: string; location?: string | null;
};

export type GuestInput = { name: string; ageBand: AgeBand; relationship?: string | null; phone?: string | null; email?: string | null };

export type CreateEventInput = {
  slug?: string;
  name: string; nameArabic?: string; tagline?: string; description?: string;
  category: EventCategory;
  eventDate: string; eventDateHijri?: string;
  startsAtUtc?: string; endsAtUtc?: string;
  place?: string; venueAddress?: string;
  venueLatitude?: number | null; venueLongitude?: number | null;
  contactPhone?: string; contactEmail?: string; notes?: string;
};

export type UpdateEventInput = {
  name: string; nameArabic?: string | null; tagline?: string | null; description?: string | null;
  category: EventCategory;
  eventDate: string; eventDateHijri?: string | null;
  startsAtUtc?: string | null; endsAtUtc?: string | null;
  place?: string | null; venueAddress?: string | null;
  venueLatitude?: number | null; venueLongitude?: number | null;
  contactPhone?: string | null; contactEmail?: string | null;
  notes?: string | null; isActive: boolean;
};

export type UpdateBrandingInput = {
  coverImageUrl?: string | null; logoUrl?: string | null;
  primaryColor?: string | null; accentColor?: string | null;
};

export type UpdateShareInput = {
  shareTitle?: string | null;
  shareDescription?: string | null;
  shareImageUrl?: string | null;
};

export type UpdateRegistrationSettingsInput = {
  registrationsEnabled: boolean;
  registrationOpensAtUtc?: string | null; registrationClosesAtUtc?: string | null;
  capacity?: number | null; allowGuests: boolean; maxGuestsPerRegistration: number;
  openToNonMembers: boolean; requiresApproval: boolean;
};

export type ReplaceAgendaInput = {
  items: { title: string; startTime?: string | null; endTime?: string | null;
    speaker?: string | null; location?: string | null; description?: string | null }[];
};

export type CreateRegistrationInput = {
  eventId: string;
  memberId?: string | null;
  attendeeName: string;
  attendeeEmail?: string;
  attendeePhone?: string;
  attendeeItsNumber?: string;
  specialRequests?: string;
  dietaryNotes?: string;
  guests?: GuestInput[];
};

export const eventsApi = {
  list: async (q: { page?: number; pageSize?: number; search?: string; category?: EventCategory; fromDate?: string; toDate?: string; active?: boolean }): Promise<PagedResult<Event>> =>
    (await api.get('/api/v1/events', { params: q })).data,
  get: async (id: string): Promise<Event> => (await api.get(`/api/v1/events/${id}`)).data,
  getBySlug: async (slug: string): Promise<Event> => (await api.get(`/api/v1/events/slug/${slug}`)).data,
  create: async (input: CreateEventInput): Promise<Event> => (await api.post('/api/v1/events', input)).data,
  update: async (id: string, input: UpdateEventInput): Promise<Event> => (await api.put(`/api/v1/events/${id}`, input)).data,
  updateBranding: async (id: string, input: UpdateBrandingInput): Promise<Event> => (await api.put(`/api/v1/events/${id}/branding`, input)).data,
  updateShare: async (id: string, input: UpdateShareInput): Promise<Event> => (await api.put(`/api/v1/events/${id}/share`, input)).data,
  updateRegistrationSettings: async (id: string, input: UpdateRegistrationSettingsInput): Promise<Event> =>
    (await api.put(`/api/v1/events/${id}/registration-settings`, input)).data,
  replaceAgenda: async (id: string, input: ReplaceAgendaInput): Promise<Event> =>
    (await api.put(`/api/v1/events/${id}/agenda`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/events/${id}`); },
  uploadCover: async (id: string, file: File): Promise<Event> => {
    const fd = new FormData();
    fd.append('file', file);
    return (await api.post(`/api/v1/events/${id}/cover-upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },

  listRegistrations: async (eventId: string, q: { page?: number; pageSize?: number; status?: RegistrationStatus; search?: string }): Promise<PagedResult<EventRegistration>> =>
    (await api.get(`/api/v1/events/${eventId}/registrations`, { params: q })).data,

  listScans: async (q: { page?: number; pageSize?: number; eventId?: string; memberId?: string }): Promise<PagedResult<EventScan>> =>
    (await api.get('/api/v1/events/scans', { params: q })).data,
  scan: async (eventId: string, itsNumber: string, location?: string): Promise<EventScan> =>
    (await api.post('/api/v1/events/scans', { eventId, itsNumber, location })).data,
  removeScan: async (id: string) => { await api.delete(`/api/v1/events/scans/${id}`); },
};

// Page designer — managed sections on an event's public portal page.
export type PageSection = {
  id: string; eventId: string;
  type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
  sortOrder: number; isVisible: boolean; contentJson: string;
};

export type PresetInfo = { key: string; name: string; description: string; sectionCount: number };

export const pageDesignerApi = {
  list: async (eventId: string): Promise<PageSection[]> =>
    (await api.get(`/api/v1/events/${eventId}/page/sections`)).data,
  add: async (eventId: string, input: { type: PageSection['type']; contentJson?: string | null; sortOrder?: number | null }): Promise<PageSection> =>
    (await api.post(`/api/v1/events/${eventId}/page/sections`, input)).data,
  update: async (eventId: string, sectionId: string, input: { contentJson: string; isVisible: boolean }): Promise<PageSection> =>
    (await api.put(`/api/v1/events/${eventId}/page/sections/${sectionId}`, input)).data,
  remove: async (eventId: string, sectionId: string) => {
    await api.delete(`/api/v1/events/${eventId}/page/sections/${sectionId}`);
  },
  reorder: async (eventId: string, sectionIds: string[]) => {
    await api.post(`/api/v1/events/${eventId}/page/sections/reorder`, { sectionIds });
  },
  listPresets: async (eventId: string): Promise<PresetInfo[]> =>
    (await api.get(`/api/v1/events/${eventId}/page/presets`)).data,
  applyPreset: async (eventId: string, presetKey: string, replaceExisting: boolean): Promise<PageSection[]> =>
    (await api.post(`/api/v1/events/${eventId}/page/apply-preset`, { presetKey, replaceExisting })).data,
};

export const eventRegistrationsApi = {
  list: async (q: { page?: number; pageSize?: number; eventId?: string; memberId?: string; status?: RegistrationStatus; search?: string }): Promise<PagedResult<EventRegistration>> =>
    (await api.get('/api/v1/event-registrations', { params: q })).data,
  get: async (id: string): Promise<EventRegistration> => (await api.get(`/api/v1/event-registrations/${id}`)).data,
  getByCode: async (code: string): Promise<EventRegistration> => (await api.get(`/api/v1/event-registrations/code/${code}`)).data,
  create: async (input: CreateRegistrationInput): Promise<EventRegistration> =>
    (await api.post('/api/v1/event-registrations', input)).data,
  confirm: async (id: string): Promise<EventRegistration> => (await api.post(`/api/v1/event-registrations/${id}/confirm`)).data,
  checkIn: async (id: string): Promise<EventRegistration> => (await api.post(`/api/v1/event-registrations/${id}/check-in`)).data,
  cancel: async (id: string, reason?: string): Promise<EventRegistration> =>
    (await api.post(`/api/v1/event-registrations/${id}/cancel`, { reason })).data,
};

// Public portal — anonymous where noted.
export type PortalEventSummary = {
  id: string; slug: string; name: string; tagline?: string | null;
  category: EventCategory; eventDate: string; eventDateHijri?: string | null;
  startsAtUtc?: string | null; endsAtUtc?: string | null;
  place?: string | null; coverImageUrl?: string | null;
  primaryColor?: string | null; accentColor?: string | null;
  registrationsOpenNow: boolean; seatsRemaining?: number | null;
};

export type PortalEventDetail = {
  summary: PortalEventSummary;
  description?: string | null;
  nameArabic?: string | null;
  venueAddress?: string | null;
  venueLatitude?: number | null; venueLongitude?: number | null;
  logoUrl?: string | null;
  contactPhone?: string | null; contactEmail?: string | null;
  allowGuests: boolean; maxGuestsPerRegistration: number;
  openToNonMembers: boolean; requiresApproval: boolean;
  shareTitle?: string | null; shareDescription?: string | null; shareImageUrl?: string | null;
  agenda: EventAgendaItem[];
  sections: PageSection[];
  hasCustomPage: boolean;
};

export const portalApi = {
  listUpcoming: async (max = 50): Promise<PortalEventSummary[]> =>
    (await api.get('/api/v1/portal/events', { params: { max } })).data,
  getBySlug: async (slug: string): Promise<PortalEventDetail> =>
    (await api.get(`/api/v1/portal/events/${slug}`)).data,
  register: async (input: CreateRegistrationInput): Promise<EventRegistration> =>
    (await api.post('/api/v1/portal/events/register', input)).data,
  lookupRegistration: async (code: string): Promise<EventRegistration> =>
    (await api.get(`/api/v1/portal/events/registration/${code}`)).data,
  cancelByCode: async (code: string, reason?: string): Promise<EventRegistration> =>
    (await api.post(`/api/v1/portal/events/registration/${code}/cancel`, { reason })).data,
};
