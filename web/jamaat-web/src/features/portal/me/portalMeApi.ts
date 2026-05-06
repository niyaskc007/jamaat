import { api } from '../../../shared/api/client';
import { openAuthenticatedPdf } from '../../../shared/api/pdf';

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

/// Enriched guarantor-inbox row: carries the loan summary the borrower needs to make the
/// decision in-portal without opening a separate token-protected page.
export type GuarantorInboxRow = {
  id: string; loanId: string; guarantorMemberId: string;
  status: number;             // 1=Pending, 2=Accepted, 3=Declined
  token: string;
  requestedAtUtc: string; respondedAtUtc: string | null;
  loan: {
    code: string;
    amountRequested: number; amountApproved: number;
    currency: string;
    instalmentsRequested: number; instalmentsApproved: number;
    scheme: number;
    loanStatus: number;
    purpose: string | null;
    repaymentPlan: string | null;
    sourceOfIncome: string | null;
    monthlyIncome: number | null;
    monthlyExpenses: number | null;
    monthlyExistingEmis: number | null;
    borrowerItsNumber: string;
    borrowerName: string;
    startDate: string;
  };
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

// --- Detail / dashboard / patronage shapes (Phase J: gap-fill) -----------

/// Mirrors the backend ReceiptDto / ReceiptLineDto (fields the portal cares about).
export type PortalReceipt = {
  id: string; receiptNumber: string | null; receiptDate: string;
  memberId: string; itsNumberSnapshot: string; memberNameSnapshot: string;
  amountTotal: number; currency: string; baseCurrency: string; baseAmountTotal: number;
  paymentMode: number; chequeNumber: string | null; chequeDate: string | null;
  bankAccountName: string | null; paymentReference: string | null;
  remarks: string | null; status: number;
  confirmedAtUtc: string | null; confirmedByUserName: string | null;
  createdAtUtc: string;
  intention: number;
  niyyathNote: string | null;
  maturityDate: string | null;
  amountReturned: number;
  drawnOnBank: string | null;
  lines: Array<{
    id: string; lineNo: number; fundTypeId: string; fundTypeCode: string; fundTypeName: string;
    amount: number; purpose: string | null; periodReference: string | null;
    commitmentCode?: string | null; installmentNo?: number | null;
    fundEnrollmentCode?: string | null;
    qarzanHasanaLoanCode?: string | null; qarzanHasanaInstallmentNo?: number | null;
  }>;
};

export type CommitmentInstallment = {
  id: string; installmentNo: number; dueDate: string;
  scheduledAmount: number; paidAmount: number; remainingAmount: number;
  lastPaymentDate: string | null; status: number;
  waiverReason: string | null;
  lastPaymentReceiptId: string | null;
  lastPaymentReceiptNumber: string | null;
};

export type PortalCommitmentDetail = {
  commitment: {
    id: string; code: string; partyName: string;
    fundTypeName: string; currency: string;
    totalAmount: number; paidAmount: number; remainingAmount: number; progressPercent: number;
    frequency: number; numberOfInstallments: number;
    startDate: string; endDate: string | null;
    status: number; notes: string | null;
    hasAcceptedAgreement: boolean;
    agreementAcceptedAtUtc: string | null;
    agreementAcceptedByName: string | null;
  };
  installments: CommitmentInstallment[];
  agreementText: string | null;
};

export type QhInstallment = {
  id: string; installmentNo: number; dueDate: string;
  scheduledAmount: number; paidAmount: number; remainingAmount: number;
  lastPaymentDate: string | null; status: number;
  waiverReason: string | null;
};

export type PortalQhDetail = {
  loan: {
    id: string; code: string;
    memberName: string; memberItsNumber: string;
    scheme: number;
    amountRequested: number; amountApproved: number; amountDisbursed: number;
    amountRepaid: number; amountOutstanding: number;
    instalmentsRequested: number; instalmentsApproved: number;
    currency: string;
    startDate: string; endDate: string | null;
    status: number;
    guarantor1Name: string; guarantor2Name: string;
    rejectionReason: string | null;
    progressPercent: number;
    purpose: string | null;
    repaymentPlan: string | null;
    monthlyIncome: number | null;
    monthlyExpenses: number | null;
    disbursedOn: string | null;
    level1ApprovedAtUtc: string | null;
    level2ApprovedAtUtc: string | null;
  };
  installments: QhInstallment[];
};

export type CreateQhPayload = {
  amountRequested: number;
  instalmentsRequested: number;
  currency: string;
  startDate: string;
  guarantor1MemberId: string;
  guarantor2MemberId: string;
  scheme: number;
  goldAmount?: number | null;
  purpose?: string | null;
  repaymentPlan?: string | null;
  sourceOfIncome?: string | null;
  otherObligations?: string | null;
  monthlyIncome?: number | null;
  monthlyExpenses?: number | null;
  monthlyExistingEmis?: number | null;
  guarantorsAcknowledged?: boolean;
};

export type FundEnrollmentRow = {
  id: string; code: string;
  fundTypeId: string; fundTypeName: string; fundTypeCode: string;
  subType: string | null;
  recurrence: number; status: number;
  startDate: string; endDate: string | null;
  notes: string | null;
  createdAtUtc: string;
};

export type PatronageReceipt = {
  receiptId: string; receiptNumber: string | null;
  receiptDate: string; amount: number; currency: string;
  status: number;
};

export type FundEnrollmentDetail = {
  enrollment: {
    id: string; code: string;
    fundTypeName: string; fundTypeCode: string;
    subType: string | null;
    recurrence: number; status: number;
    startDate: string; endDate: string | null;
    notes: string | null;
    totalCollected: number; receiptCount: number;
    createdAtUtc: string;
  };
  receipts: PatronageReceipt[];
};

export type CommitmentPaymentRow = {
  receiptId: string; receiptNumber: string | null;
  receiptDate: string;
  receiptStatus: number;
  commitmentInstallmentId: string | null;
  installmentNo: number | null;
  amount: number; currency: string;
  paymentMode: number;
  chequeNumber: string | null; chequeDate: string | null;
  bankAccountId: string | null; bankAccountName: string | null;
  paymentReference: string | null; remarks: string | null;
  confirmedAtUtc: string | null; confirmedByUserId: string | null; confirmedByUserName: string | null;
};

export type QhGuarantorConsent = {
  id: string;
  guarantorMemberId: string; guarantorName: string; guarantorItsNumber: string;
  token: string;
  status: number;             // 1 Pending / 2 Accepted / 3 Declined
  respondedAtUtc: string | null;
  responderIpAddress: string | null;
  notificationSentAtUtc: string | null;
};

export type QhPaymentRow = {
  id: string; receiptNumber: string | null; receiptDate: string;
  status: number;
  amount: number; currency: string;
  paymentMode: number;
  chequeNumber: string | null; chequeDate: string | null;
  paymentReference: string | null; remarks: string | null;
};

export type MemberDashboard = {
  ytdContributions: number; ytdReceiptCount: number; currency: string;
  activeCommitments: number; commitmentOutstanding: number;
  activeQhLoans: number; qhOutstanding: number;
  pendingGuarantorRequests: number; pendingChangeRequests: number;
  upcomingEventCount: number;
  /// % change of THIS MONTH contributions vs LAST MONTH. null when there's no prior data.
  monthDelta: number | null;
  thisMonthContributions: number;
  nextInstallment: null | {
    commitmentId: string; commitmentCode: string; fundName: string;
    installmentNo: number; dueDate: string; amountDue: number; currency: string;
  };
  recentContributions: Array<{ id: string; receiptNumber: string | null; receiptDate: string; amount: number; currency: string }>;
  activeCommitmentsList: Array<{ id: string; code: string; fundName: string; totalAmount: number; paidAmount: number; remainingAmount: number; currency: string }>;
  /// 12 entries (one per calendar month, oldest first) - feeds the LineChart on the home page.
  collectionTrend: Array<{ month: string; amount: number }>;
  /// Top funds the member has contributed to over the trend window - feeds the donut.
  fundShare: Array<{ fundTypeId: string; name: string; amount: number }>;
};

export type PortalFundType = {
  id: string; code: string; name: string; category: number; allowedPaymentModes: number;
};

export type CreateCommitmentPayload = {
  fundTypeId: string; currency: string; totalAmount: number;
  frequency: number; numberOfInstallments: number;
  startDate: string; notes?: string | null;
};

export type CreatePatronagePayload = {
  fundTypeId: string; subType?: string | null;
  recurrence: number; startDate: string; endDate?: string | null; notes?: string | null;
};

export const portalMeApi = {
  me: () => api.get<Me>('/api/v1/portal/me').then((r) => r.data),
  dashboard: () => api.get<MemberDashboard>('/api/v1/portal/me/dashboard').then((r) => r.data),
  contributions: () => api.get<ContributionRow[]>('/api/v1/portal/me/contributions').then((r) => r.data),
  contributionDetail: (id: string) =>
    api.get<PortalReceipt>(`/api/v1/portal/me/contributions/${id}`).then((r) => r.data),
  contributionPdf: (id: string) =>
    openAuthenticatedPdf(`/api/v1/portal/me/contributions/${id}/pdf`, `receipt-${id}.pdf`),
  commitments: () => api.get<CommitmentRow[]>('/api/v1/portal/me/commitments').then((r) => r.data),
  commitmentDetail: (id: string) =>
    api.get<PortalCommitmentDetail>(`/api/v1/portal/me/commitments/${id}`).then((r) => r.data),
  commitmentCreate: (payload: CreateCommitmentPayload) =>
    api.post('/api/v1/portal/me/commitments', payload).then((r) => r.data),
  commitmentAcceptAgreement: (id: string) =>
    api.post(`/api/v1/portal/me/commitments/${id}/accept-agreement`).then((r) => r.data),
  commitmentAgreementPreview: (id: string) =>
    api.get<{ templateId: string | null; templateVersion: number | null; templateName: string | null; renderedText: string; isAlreadyAccepted: boolean }>(
      `/api/v1/portal/me/commitments/${id}/agreement-preview`,
    ).then((r) => r.data),
  commitmentPayments: (id: string) =>
    api.get<Array<CommitmentPaymentRow>>(`/api/v1/portal/me/commitments/${id}/payments`).then((r) => r.data),
  qhGuarantorConsents: (id: string) =>
    api.get<Array<QhGuarantorConsent>>(`/api/v1/portal/me/qarzan-hasana/${id}/guarantor-consents`).then((r) => r.data),
  qhPayments: (id: string) =>
    api.get<Array<QhPaymentRow>>(`/api/v1/portal/me/qarzan-hasana/${id}/payments`).then((r) => r.data),
  fundTypes: (category: 'donation' | 'loan' = 'donation') =>
    api.get<PortalFundType[]>(`/api/v1/portal/me/fund-types`, { params: { category } }).then((r) => r.data),
  qarzanHasana: () => api.get<QhLoanRow[]>('/api/v1/portal/me/qarzan-hasana').then((r) => r.data),
  qhDetail: (id: string) =>
    api.get<PortalQhDetail>(`/api/v1/portal/me/qarzan-hasana/${id}`).then((r) => r.data),
  qhCreate: (payload: CreateQhPayload) =>
    api.post('/api/v1/portal/me/qarzan-hasana', payload).then((r) => r.data),
  fundEnrollments: () =>
    api.get<FundEnrollmentRow[]>('/api/v1/portal/me/fund-enrollments').then((r) => r.data),
  fundEnrollmentDetail: (id: string) =>
    api.get<FundEnrollmentDetail>(`/api/v1/portal/me/fund-enrollments/${id}`).then((r) => r.data),
  fundEnrollmentCreate: (payload: CreatePatronagePayload) =>
    api.post('/api/v1/portal/me/fund-enrollments', payload).then((r) => r.data),
  guarantorInbox: () =>
    api.get<GuarantorInboxRow[]>('/api/v1/portal/me/guarantor-inbox').then((r) => r.data),
  guarantorAct: (consentId: string, decision: 'accept' | 'decline') =>
    api.post(`/api/v1/portal/me/guarantor-inbox/${consentId}/${decision}`).then((r) => r.data),
  searchMembers: (q: string) =>
    api.get<Array<{ id: string; itsNumber: string; fullName: string }>>(`/api/v1/portal/me/members/search`, { params: { q } }).then((r) => r.data),
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

  // Phase D - language preference (server-side persistence so locale follows the user
  // across devices instead of just being in localStorage)
  setLanguage: (language: 'en' | 'ar' | 'hi' | 'ur') =>
    api.put('/api/v1/portal/me/profile/language', { language }).then(() => undefined),
};
