import { api } from '../../../shared/api/client';

export type Me = {
  id: string; userName: string; fullName: string; email?: string | null;
  itsNumber?: string | null; phoneE164?: string | null; memberId?: string | null;
};

export type ContributionRow = {
  id: string; receiptNumber: string | null; receiptDate: string;
  amount: number; currency: string; status: number; paymentMethod: number; notes?: string | null;
};
export type CommitmentRow = {
  id: string; code: string; fundTypeId: string; fundNameSnapshot: string;
  totalAmount: number; paidAmount: number; currency: string; status: number;
  startDate: string; endDate?: string | null; installmentCount: number;
};
export type QhLoanRow = {
  id: string; code: string; startDate: string;
  amountRequested: number; amountApproved: number; amountDisbursed: number; amountRepaid: number;
  currency: string; status: number; installmentCount: number;
};
export type GuarantorRequestRow = {
  id: string; loanId: string; guarantorMemberId: string;
  status: number; token: string;
  requestedAtUtc: string; respondedAtUtc?: string | null;
};
export type EventRegistrationRow = {
  id: string; eventId: string; registrationCode: string; status: number;
  registeredAtUtc: string; confirmedAtUtc?: string | null; checkedInAtUtc?: string | null;
};

/// Subset of MemberProfileDto used by the portal self-edit screen. The backend dto carries
/// many more fields; we only model what the form reads/writes here.
export type PortalProfile = {
  id: string;
  fullName: string | null;
  itsNumber: string | null;
  email: string | null;
  phone: string | null;
  whatsAppNo: string | null;
  linkedInUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  addressLine: string | null;
  building: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  photoUrl: string | null;
};

export type PendingChangeRequest = {
  id: string;
  memberId: string;
  section: string;
  status: number;          // 1=Pending, 2=Approved, 3=Rejected
  requestedAtUtc: string;
};

export type UpdateContactDto = {
  phone: string | null; whatsAppNo: string | null; email: string | null;
  linkedInUrl: string | null; facebookUrl: string | null; instagramUrl: string | null;
  twitterUrl: string | null; websiteUrl: string | null;
};

export type UpdateAddressDto = {
  addressLine: string | null; building: string | null; street: string | null;
  area: string | null; city: string | null; state: string | null; pincode: string | null;
  // The backend dto carries housing/property fields too but the portal only edits the
  // address itself. The backend tolerates missing optional fields.
};

/// Mirrors MemberNotificationPreferences. enabledKinds keys: 'CommitmentInstallmentDue',
/// 'QhStateChanged', 'EventReminderT24h'. preferredChannel: 'Email' / 'Sms' / 'WhatsApp'
/// / null (null = auto - server picks the best available).
export type NotificationPrefs = {
  enabledKinds: Record<string, boolean>;
  preferredChannel: 'Email' | 'Sms' | 'WhatsApp' | null;
};

export const portalMeApi = {
  me: () => api.get<Me>('/api/v1/portal/me').then((r) => r.data),
  contributions: () => api.get<ContributionRow[]>('/api/v1/portal/me/contributions').then((r) => r.data),
  commitments: () => api.get<CommitmentRow[]>('/api/v1/portal/me/commitments').then((r) => r.data),
  qarzanHasana: () => api.get<QhLoanRow[]>('/api/v1/portal/me/qarzan-hasana').then((r) => r.data),
  guarantorInbox: () => api.get<GuarantorRequestRow[]>('/api/v1/portal/me/guarantor-inbox').then((r) => r.data),
  events: () => api.get<EventRegistrationRow[]>('/api/v1/portal/me/events').then((r) => r.data),

  // Phase B - profile self-edit
  profile: () => api.get<PortalProfile>('/api/v1/portal/me/profile').then((r) => r.data),
  pendingChanges: () => api.get<PendingChangeRequest[]>('/api/v1/portal/me/profile/pending-changes').then((r) => r.data),
  submitContact: (dto: UpdateContactDto) =>
    api.post('/api/v1/portal/me/profile/contact', dto).then((r) => r.data),
  submitAddress: (dto: UpdateAddressDto) =>
    api.post('/api/v1/portal/me/profile/address', dto).then((r) => r.data),
  uploadPhoto: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ photoUrl: string }>('/api/v1/portal/me/profile/photo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  // Phase C - notifications preferences
  getNotificationPrefs: () =>
    api.get<NotificationPrefs>('/api/v1/portal/me/profile/notification-prefs').then((r) => r.data),
  setNotificationPrefs: (dto: NotificationPrefs) =>
    api.put('/api/v1/portal/me/profile/notification-prefs', dto).then(() => undefined),
};
