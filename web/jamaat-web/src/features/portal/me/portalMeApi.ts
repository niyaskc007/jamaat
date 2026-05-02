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

export const portalMeApi = {
  me: () => api.get<Me>('/api/v1/portal/me').then((r) => r.data),
  contributions: () => api.get<ContributionRow[]>('/api/v1/portal/me/contributions').then((r) => r.data),
  commitments: () => api.get<CommitmentRow[]>('/api/v1/portal/me/commitments').then((r) => r.data),
  qarzanHasana: () => api.get<QhLoanRow[]>('/api/v1/portal/me/qarzan-hasana').then((r) => r.data),
  guarantorInbox: () => api.get<GuarantorRequestRow[]>('/api/v1/portal/me/guarantor-inbox').then((r) => r.data),
  events: () => api.get<EventRegistrationRow[]>('/api/v1/portal/me/events').then((r) => r.data),
};
