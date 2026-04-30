import { api } from '../../../shared/api/client';

export type ReliabilityDimension = {
  key: string;
  name: string;
  weight: number;
  score: number | null;
  excluded: boolean;
  raw: string;
  tip: string | null;
};

export type ReliabilityLapse = {
  kind: string;
  reference: string;
  description: string;
  occurredOn: string;
};

export type ReliabilityProfile = {
  memberId: string;
  grade: string;            // A | B | C | D | Unrated
  totalScore: number | null;
  dimensions: ReliabilityDimension[];
  lapses: ReliabilityLapse[];
  loanReady: boolean;
  loanReadyReason: string | null;
  computedAtUtc: string;
};

export type MemberRank = {
  memberId: string;
  itsNumber: string;
  fullName: string;
  grade: string;
  totalScore: number | null;
  loanReady: boolean;
};

export type ReliabilityDistribution = {
  totalMembers: number;
  rated: number;
  unrated: number;
  byGrade: Record<string, number>;
  topReliable: MemberRank[];
  needsAttention: MemberRank[];
};

export const reliabilityApi = {
  get: async (memberId: string): Promise<ReliabilityProfile> =>
    (await api.get(`/api/v1/members/${memberId}/reliability`)).data,
  recompute: async (memberId: string): Promise<ReliabilityProfile> =>
    (await api.post(`/api/v1/members/${memberId}/reliability/recompute`)).data,
  distribution: async (): Promise<ReliabilityDistribution> =>
    (await api.get('/api/v1/admin/reliability/distribution')).data,
};

/// Map grade -> AntD tag color so all reliability surfaces share the same palette.
export const GradeColor: Record<string, string> = {
  A: 'green',
  B: 'cyan',
  C: 'gold',
  D: 'red',
  Unrated: 'default',
};

export const GradeLabel: Record<string, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Needs attention',
  Unrated: 'Unrated',
};
