import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type FamilyRole =
  | 1 /* Head */ | 2 /* Spouse */ | 3 /* Father */ | 4 /* Mother */
  | 5 /* Son */ | 6 /* Daughter */ | 7 /* Brother */ | 8 /* Sister */
  | 9 /* GrandFather */ | 10 /* GrandMother */ | 11 /* GrandSon */ | 12 /* GrandDaughter */
  | 13 /* SonInLaw */ | 14 /* DaughterInLaw */ | 15 /* Uncle */ | 16 /* Aunt */
  | 17 /* Nephew */ | 18 /* Niece */ | 99 /* Other */;

export const FamilyRoleLabel: Record<FamilyRole, string> = {
  1: 'Head',
  2: 'Spouse',
  3: 'Father',
  4: 'Mother',
  5: 'Son',
  6: 'Daughter',
  7: 'Brother',
  8: 'Sister',
  9: 'Grand Father',
  10: 'Grand Mother',
  11: 'Grand Son',
  12: 'Grand Daughter',
  13: 'Son-in-Law',
  14: 'Daughter-in-Law',
  15: 'Uncle',
  16: 'Aunt',
  17: 'Nephew',
  18: 'Niece',
  99: 'Other',
};

export type Family = {
  id: string;
  code: string;
  familyName: string;
  headMemberId?: string | null;
  headItsNumber?: string | null;
  headName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  memberCount: number;
  createdAtUtc: string;
};

export type FamilyMember = {
  id: string;
  itsNumber: string;
  fullName: string;
  familyRole?: FamilyRole | null;
  isHead: boolean;
};

/// An extended-kinship link to a member who lives in a different household. The linked
/// member's primary household is preserved; this row only records the relationship.
export type FamilyExtendedLink = {
  linkId: string;
  memberId: string;
  itsNumber: string;
  fullName: string;
  role: FamilyRole;
  /// The linked member's primary household. Null when the member has no household at all
  /// (e.g. fresh member not yet attached anywhere).
  currentFamilyId?: string | null;
  currentFamilyCode?: string | null;
  currentFamilyName?: string | null;
};

export type FamilyDetail = {
  family: Family;
  members: FamilyMember[];
  extendedLinks: FamilyExtendedLink[];
};

export type FamilyListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: boolean;
};

export type CreateFamilyInput = {
  familyName: string;
  headMemberId: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  notes?: string;
};

export type UpdateFamilyInput = {
  familyName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
};

/// `linkOnly: true` records an extended-kinship link without moving the member's household
/// (their `FamilyId` stays put). Default `false` keeps the legacy behaviour: the member is
/// moved into this family.
export type AssignMemberInput = { memberId: string; role: FamilyRole; linkOnly?: boolean };

export type SpinOffInput = {
  newHeadMemberId: string;
  familyName: string;
  spouseMemberId?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  notes?: string | null;
};

/// One node in the extended-tree response. Recursive via `descendants`. When
/// `currentFamilyId` differs from the family being viewed, the UI renders a
/// "→ F-002" tag and link to that family.
export type FamilyTreePerson = {
  memberId: string;
  itsNumber: string;
  fullName: string;
  relation: string;
  currentFamilyId?: string | null;
  currentFamilyCode?: string | null;
  currentFamilyName?: string | null;
  isInThisFamily: boolean;
  descendants: FamilyTreePerson[];
  /// Spouse info inline on the card. Set when the person has a known SpouseItsNumber and the
  /// spouse exists in the tenant member directory. Lets the UI show "❤ Wife's name" without
  /// forcing the user to expand a sub-tree.
  spouseItsNumber?: string | null;
  spouseName?: string | null;
};

export type FamilyExtendedTree = {
  familyId: string;
  familyCode: string;
  familyName: string;
  father?: FamilyTreePerson | null;
  mother?: FamilyTreePerson | null;
  head?: FamilyTreePerson | null;
  spouse?: FamilyTreePerson | null;
};

export const familiesApi = {
  list: async (q: FamilyListQuery): Promise<PagedResult<Family>> => {
    const { data } = await api.get<PagedResult<Family>>('/api/v1/families', { params: q });
    return data;
  },
  get: async (id: string): Promise<FamilyDetail> => {
    const { data } = await api.get<FamilyDetail>(`/api/v1/families/${id}`);
    return data;
  },
  create: async (input: CreateFamilyInput): Promise<Family> => {
    const { data } = await api.post<Family>('/api/v1/families', input);
    return data;
  },
  update: async (id: string, input: UpdateFamilyInput): Promise<Family> => {
    const { data } = await api.put<Family>(`/api/v1/families/${id}`, input);
    return data;
  },
  assignMember: async (id: string, input: AssignMemberInput): Promise<void> => {
    await api.post(`/api/v1/families/${id}/members`, input);
  },
  removeMember: async (id: string, memberId: string): Promise<void> => {
    await api.delete(`/api/v1/families/${id}/members/${memberId}`);
  },
  removeLink: async (id: string, linkId: string): Promise<void> => {
    await api.delete(`/api/v1/families/${id}/links/${linkId}`);
  },
  transferHeadship: async (id: string, newHeadMemberId: string): Promise<void> => {
    await api.post(`/api/v1/families/${id}/transfer-headship`, { newHeadMemberId });
  },
  spinOff: async (sourceFamilyId: string, input: SpinOffInput): Promise<Family> => {
    const { data } = await api.post<Family>(`/api/v1/families/${sourceFamilyId}/spin-off`, input);
    return data;
  },
  extendedTree: async (id: string): Promise<FamilyExtendedTree> => {
    const { data } = await api.get<FamilyExtendedTree>(`/api/v1/families/${id}/extended-tree`);
    return data;
  },
};
