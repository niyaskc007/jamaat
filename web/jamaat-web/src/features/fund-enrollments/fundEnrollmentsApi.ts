import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type Recurrence = 1 | 2 | 3 | 4 | 5 | 99;
export const RecurrenceLabel: Record<Recurrence, string> = {
  1: 'One-time', 2: 'Monthly', 3: 'Quarterly', 4: 'Half-yearly', 5: 'Yearly', 99: 'Custom',
};

export type EnrollmentStatus = 1 | 2 | 3 | 4 | 5;
export const EnrollmentStatusLabel: Record<EnrollmentStatus, string> = {
  1: 'Draft', 2: 'Active', 3: 'Paused', 4: 'Cancelled', 5: 'Expired',
};
export const EnrollmentStatusColor: Record<EnrollmentStatus, string> = {
  1: 'default', 2: 'green', 3: 'gold', 4: 'red', 5: 'default',
};

export type FundEnrollment = {
  id: string;
  code: string;
  memberId: string; memberItsNumber: string; memberName: string;
  fundTypeId: string; fundTypeCode: string; fundTypeName: string;
  familyId?: string | null; familyCode?: string | null;
  subType?: string | null;
  recurrence: Recurrence;
  startDate: string; endDate?: string | null;
  status: EnrollmentStatus;
  approvedByUserId?: string | null; approvedByUserName?: string | null;
  approvedAtUtc?: string | null;
  notes?: string | null;
  totalCollected: number;
  receiptCount: number;
  createdAtUtc: string;
};

export type CreateFundEnrollmentInput = {
  memberId: string;
  fundTypeId: string;
  subType?: string;
  recurrence: Recurrence;
  startDate: string;
  endDate?: string;
  familyId?: string;
  notes?: string;
};

export type UpdateFundEnrollmentInput = {
  subType?: string | null;
  recurrence: Recurrence;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  familyId?: string | null;
};

export type PatronageReceipt = {
  receiptId: string;
  receiptNumber: string | null;
  receiptDate: string;
  amount: number;
  currency: string;
  status: number;
  paymentMode: number;
  chequeNumber: string | null;
};

export const fundEnrollmentsApi = {
  list: async (q: { page?: number; pageSize?: number; search?: string; status?: EnrollmentStatus; memberId?: string; fundTypeId?: string; subType?: string }): Promise<PagedResult<FundEnrollment>> =>
    (await api.get('/api/v1/fund-enrollments', { params: q })).data,
  get: async (id: string): Promise<FundEnrollment> => (await api.get(`/api/v1/fund-enrollments/${id}`)).data,
  receipts: async (id: string): Promise<PatronageReceipt[]> =>
    (await api.get(`/api/v1/fund-enrollments/${id}/receipts`)).data,
  create: async (input: CreateFundEnrollmentInput): Promise<FundEnrollment> => (await api.post('/api/v1/fund-enrollments', input)).data,
  update: async (id: string, input: UpdateFundEnrollmentInput): Promise<FundEnrollment> => (await api.put(`/api/v1/fund-enrollments/${id}`, input)).data,
  approve: async (id: string): Promise<FundEnrollment> => (await api.post(`/api/v1/fund-enrollments/${id}/approve`)).data,
  pause: async (id: string) => { await api.post(`/api/v1/fund-enrollments/${id}/pause`); },
  resume: async (id: string) => { await api.post(`/api/v1/fund-enrollments/${id}/resume`); },
  cancel: async (id: string) => { await api.post(`/api/v1/fund-enrollments/${id}/cancel`); },
};
