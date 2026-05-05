import { api } from '../../shared/api/client';

export type SubmitApplicationDto = {
  fullName: string;
  itsNumber: string;
  email: string | null;
  phoneE164: string | null;
  notes: string | null;
};

export type ApplicationReceipt = {
  applicationId: string;
  submittedAtUtc: string;
  message: string;
};

export type MemberApplication = {
  id: string;
  tenantId: string;
  fullName: string;
  itsNumber: string;
  email: string | null;
  phoneE164: string | null;
  notes: string | null;
  status: number;          // 1=Pending 2=Approved 3=Rejected
  ipAddress: string | null;
  createdAtUtc: string;
  reviewedAtUtc: string | null;
  reviewedByUserName: string | null;
  reviewerNote: string | null;
  createdUserId: string | null;
  linkedMemberId: string | null;
};

export const memberApplicationsApi = {
  submit: (dto: SubmitApplicationDto) =>
    api.post<ApplicationReceipt>('/api/v1/portal/register', dto).then((r) => r.data),
  list: (params: { page?: number; pageSize?: number; status?: number; search?: string } = {}) =>
    api.get<{ items: MemberApplication[]; total: number; page: number; pageSize: number }>(
      '/api/v1/admin/member-applications', { params }
    ).then((r) => r.data),
  pendingCount: () =>
    api.get<{ count: number }>('/api/v1/admin/member-applications/pending-count').then((r) => r.data.count),
  approve: (id: string, note?: string) =>
    api.post<MemberApplication>(`/api/v1/admin/member-applications/${id}/approve`, { note: note ?? null }).then((r) => r.data),
  reject: (id: string, note: string) =>
    api.post<MemberApplication>(`/api/v1/admin/member-applications/${id}/reject`, { note }).then((r) => r.data),
};
