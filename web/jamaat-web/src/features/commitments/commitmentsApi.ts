import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type CommitmentPartyType = 1 /* Member */ | 2 /* Family */;
export const PartyTypeLabel: Record<CommitmentPartyType, string> = { 1: 'Member', 2: 'Family' };

export type CommitmentFrequency = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 99;
export const FrequencyLabel: Record<CommitmentFrequency, string> = {
  1: 'One-time', 2: 'Weekly', 3: 'Bi-weekly', 4: 'Monthly',
  5: 'Quarterly', 6: 'Half-yearly', 7: 'Yearly', 99: 'Custom',
};

export type CommitmentStatus = 1 | 2 | 3 | 4 | 5 | 6;
export const StatusLabel: Record<CommitmentStatus, string> = {
  1: 'Draft', 2: 'Active', 3: 'Completed', 4: 'Cancelled', 5: 'Defaulted', 6: 'Paused',
};
export const StatusColor: Record<CommitmentStatus, string> = {
  1: 'default', 2: 'blue', 3: 'green', 4: 'red', 5: 'red', 6: 'gold',
};

export type InstallmentStatus = 1 | 2 | 3 | 4 | 5;
export const InstallmentStatusLabel: Record<InstallmentStatus, string> = {
  1: 'Pending', 2: 'Partially paid', 3: 'Paid', 4: 'Overdue', 5: 'Waived',
};
export const InstallmentStatusColor: Record<InstallmentStatus, string> = {
  1: 'default', 2: 'gold', 3: 'green', 4: 'red', 5: 'purple',
};

export type Commitment = {
  id: string;
  code: string;
  partyType: CommitmentPartyType;
  memberId?: string | null;
  memberItsNumber?: string | null;
  familyId?: string | null;
  familyCode?: string | null;
  partyName: string;
  fundTypeId: string;
  fundTypeCode: string;
  fundTypeName: string;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  progressPercent: number;
  frequency: CommitmentFrequency;
  numberOfInstallments: number;
  startDate: string;
  endDate?: string | null;
  allowPartialPayments: boolean;
  allowAutoAdvance: boolean;
  status: CommitmentStatus;
  notes?: string | null;
  hasAcceptedAgreement: boolean;
  agreementAcceptedAtUtc?: string | null;
  agreementAcceptedByName?: string | null;
  createdAtUtc: string;
};

export type Installment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  scheduledAmount: number;
  paidAmount: number;
  remainingAmount: number;
  lastPaymentDate?: string | null;
  status: InstallmentStatus;
  waiverReason?: string | null;
  waivedAtUtc?: string | null;
  waivedByUserName?: string | null;
};

export type CommitmentDetail = {
  commitment: Commitment;
  installments: Installment[];
  agreementTemplateId?: string | null;
  agreementTemplateVersion?: number | null;
  agreementText?: string | null;
};

export type CommitmentListQuery = {
  page?: number; pageSize?: number;
  search?: string;
  status?: CommitmentStatus;
  partyType?: CommitmentPartyType;
  memberId?: string;
  familyId?: string;
  fundTypeId?: string;
  dueFrom?: string; dueTo?: string;
};

export type CreateCommitmentInput = {
  partyType: CommitmentPartyType;
  memberId?: string;
  familyId?: string;
  fundTypeId: string;
  currency: string;
  totalAmount: number;
  frequency: CommitmentFrequency;
  numberOfInstallments: number;
  startDate: string;
  allowPartialPayments?: boolean;
  allowAutoAdvance?: boolean;
  notes?: string;
};

export type ScheduleLine = { installmentNo: number; dueDate: string; scheduledAmount: number };

export const commitmentsApi = {
  list: async (q: CommitmentListQuery): Promise<PagedResult<Commitment>> => {
    const { data } = await api.get('/api/v1/commitments', { params: q });
    return data;
  },
  get: async (id: string): Promise<CommitmentDetail> => {
    const { data } = await api.get(`/api/v1/commitments/${id}`);
    return data;
  },
  previewSchedule: async (body: { frequency: CommitmentFrequency; numberOfInstallments: number; startDate: string; totalAmount: number }): Promise<ScheduleLine[]> => {
    const { data } = await api.post('/api/v1/commitments/preview-schedule', body);
    return data;
  },
  createDraft: async (input: CreateCommitmentInput): Promise<Commitment> => {
    const { data } = await api.post('/api/v1/commitments', input);
    return data;
  },
  acceptAgreement: async (id: string, body: { templateId?: string; renderedText: string }): Promise<Commitment> => {
    const { data } = await api.post(`/api/v1/commitments/${id}/accept-agreement`, body);
    return data;
  },
  pause: (id: string) => api.post(`/api/v1/commitments/${id}/pause`),
  resume: (id: string) => api.post(`/api/v1/commitments/${id}/resume`),
  cancel: (id: string, reason: string) => api.post(`/api/v1/commitments/${id}/cancel`, { reason }),
  waive: (id: string, installmentId: string, reason: string) =>
    api.post(`/api/v1/commitments/${id}/waive-installment`, { installmentId, reason }),
  refreshOverdue: (id: string) => api.post(`/api/v1/commitments/${id}/refresh-overdue`),
};

// Agreement templates
export type AgreementTemplate = {
  id: string;
  code: string;
  name: string;
  fundTypeId?: string | null;
  fundTypeCode?: string | null;
  fundTypeName?: string | null;
  language: string;
  bodyMarkdown: string;
  version: number;
  isDefault: boolean;
  isActive: boolean;
  createdAtUtc: string;
};

export type CreateAgreementTemplateInput = {
  code: string; name: string; bodyMarkdown: string;
  language?: string; fundTypeId?: string | null; isDefault?: boolean;
};
export type UpdateAgreementTemplateInput = {
  name: string; bodyMarkdown: string; language: string;
  fundTypeId?: string | null; isDefault: boolean; isActive: boolean;
};

export const agreementTemplatesApi = {
  list: async (q: { page?: number; pageSize?: number; search?: string; fundTypeId?: string; active?: boolean }): Promise<PagedResult<AgreementTemplate>> => {
    const { data } = await api.get('/api/v1/commitment-agreement-templates', { params: q });
    return data;
  },
  get: async (id: string): Promise<AgreementTemplate> => {
    const { data } = await api.get(`/api/v1/commitment-agreement-templates/${id}`);
    return data;
  },
  create: async (input: CreateAgreementTemplateInput): Promise<AgreementTemplate> => {
    const { data } = await api.post('/api/v1/commitment-agreement-templates', input);
    return data;
  },
  update: async (id: string, input: UpdateAgreementTemplateInput): Promise<AgreementTemplate> => {
    const { data } = await api.put(`/api/v1/commitment-agreement-templates/${id}`, input);
    return data;
  },
  remove: async (id: string) => { await api.delete(`/api/v1/commitment-agreement-templates/${id}`); },
  placeholders: async (): Promise<string[]> => {
    const { data } = await api.get('/api/v1/commitment-agreement-templates/placeholders');
    return data;
  },
  render: async (body: { bodyMarkdown: string; values: Record<string, string> }): Promise<{ renderedText: string }> => {
    const { data } = await api.post('/api/v1/commitment-agreement-templates/render', body);
    return data;
  },
};
