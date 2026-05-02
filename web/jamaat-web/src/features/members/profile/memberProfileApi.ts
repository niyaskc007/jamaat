import { api } from '../../../shared/api/client';

export type Gender = 0 | 1 | 2;
export const GenderLabel: Record<Gender, string> = { 0: 'Unknown', 1: 'Male', 2: 'Female' };

export type MaritalStatus = 0 | 1 | 2 | 3 | 4;
export const MaritalStatusLabel: Record<MaritalStatus, string> = { 0: 'Unknown', 1: 'Unmarried', 2: 'Married', 3: 'Divorced', 4: 'Widowed' };

export type BloodGroup = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const BloodGroupLabel: Record<BloodGroup, string> = {
  0: 'Unknown', 1: 'A+', 2: 'A-', 3: 'B+', 4: 'B-', 5: 'AB+', 6: 'AB-', 7: 'O+', 8: 'O-',
};

export type WarakatulTarkhisStatus = 0 | 1 | 2 | 3;
export const WarakatLabel: Record<WarakatulTarkhisStatus, string> = { 0: 'Not obtained', 1: 'Green', 2: 'Red', 3: 'Expired' };

export type MisaqStatus = 0 | 1;
export const MisaqStatusLabel: Record<MisaqStatus, string> = { 0: 'Not done', 1: 'Done' };

export type Qualification = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 99;
export const QualificationLabel: Record<Qualification, string> = {
  0: 'Unknown', 1: 'None', 2: 'Primary', 3: 'Secondary', 4: 'Diploma',
  5: 'Graduate', 6: 'Postgraduate', 7: 'Doctorate', 99: 'Other',
};

export type HousingOwnership = 0 | 1 | 2 | 3 | 4 | 99;
export const HousingOwnershipLabel: Record<HousingOwnership, string> = {
  0: 'Unknown', 1: 'Ownership', 2: 'Rented', 3: 'Company-provided', 4: 'Family-provided', 99: 'Other',
};

export type TypeOfHouse = 0 | 1 | 2 | 3 | 4 | 5 | 99;
export const TypeOfHouseLabel: Record<TypeOfHouse, string> = {
  0: 'Unknown', 1: 'Flat', 2: 'Apartment', 3: 'Villa', 4: 'Independent house', 5: 'Shared', 99: 'Other',
};

export type VerificationStatus = 0 | 1 | 2 | 3;
export const VerificationStatusLabel: Record<VerificationStatus, string> = {
  0: 'Not started', 1: 'Pending', 2: 'Verified', 3: 'Rejected',
};
export const VerificationStatusColor: Record<VerificationStatus, string> = {
  0: 'default', 1: 'gold', 2: 'green', 3: 'red',
};

export type HajjStatus = 0 | 1 | 2;
export const HajjStatusLabel: Record<HajjStatus, string> = {
  0: 'Not performed', 1: 'Performed', 2: 'Multiple times',
};

export type MemberProfile = {
  id: string;
  itsNumber: string;
  fullName: string; fullNameArabic?: string | null; fullNameHindi?: string | null; fullNameUrdu?: string | null;
  title?: string | null;
  firstPrefix?: string | null; prefixYear?: number | null; firstName?: string | null;
  fatherPrefix?: string | null; fatherName?: string | null; fatherSurname?: string | null;
  // Renamed from husbandPrefix/husbandName in v2 - column is gender-neutral now;
  // UI surfaces "Husband" / "Wife" / "Spouse" depending on the member's gender.
  spousePrefix?: string | null; spouseName?: string | null; surname?: string | null;
  tanzeemFileNo?: string | null;
  familyId?: string | null; familyName?: string | null; familyCode?: string | null; familyRole?: number | null;
  fatherItsNumber?: string | null; motherItsNumber?: string | null; spouseItsNumber?: string | null;
  dateOfBirth?: string | null; ageSnapshot?: number | null; age?: number | null;
  gender: Gender; maritalStatus: MaritalStatus; bloodGroup: BloodGroup;
  warakatulTarkhisStatus: WarakatulTarkhisStatus;
  misaqStatus: MisaqStatus; misaqDate?: string | null;
  dateOfNikah?: string | null; dateOfNikahHijri?: string | null;
  phone?: string | null; whatsAppNo?: string | null; email?: string | null;
  // Social profile URLs (v2)
  linkedInUrl?: string | null; facebookUrl?: string | null; instagramUrl?: string | null;
  twitterUrl?: string | null; websiteUrl?: string | null;
  addressLine?: string | null; building?: string | null; street?: string | null; area?: string | null;
  city?: string | null; state?: string | null; pincode?: string | null;
  housingOwnership: HousingOwnership; typeOfHouse: TypeOfHouse;
  // Property details (v2). All optional. The numbers/booleans support a future household
  // wealth profile - we capture them now so the data is there when we need it.
  numBedrooms?: number | null; numBathrooms?: number | null; numKitchens?: number | null;
  numLivingRooms?: number | null; numStories?: number | null; numAirConditioners?: number | null;
  builtUpAreaSqft?: number | null; landAreaSqft?: number | null; propertyAgeYears?: number | null;
  hasElevator?: boolean | null; hasParking?: boolean | null; hasGarden?: boolean | null;
  estimatedMarketValue?: number | null; propertyNotes?: string | null;
  category?: string | null; idara?: string | null; vatan?: string | null; nationality?: string | null;
  jamaat?: string | null; jamiaat?: string | null;
  sectorId?: string | null; sectorCode?: string | null; sectorName?: string | null;
  subSectorId?: string | null; subSectorCode?: string | null; subSectorName?: string | null;
  qualification: Qualification; languagesCsv?: string | null; hunarsCsv?: string | null;
  occupation?: string | null; subOccupation?: string | null; subOccupation2?: string | null;
  quranSanad?: string | null; qadambosiSharaf: boolean; raudatTaheraZiyarat: boolean; karbalaZiyarat: boolean; asharaMubarakaCount: number;
  // Hajj + Umrah (v2)
  hajjStatus: HajjStatus; hajjYear?: number | null; umrahCount: number;
  dataVerificationStatus: VerificationStatus; dataVerifiedOn?: string | null;
  dataVerifiedByUserId?: string | null; dataVerifiedByUserName?: string | null;
  photoVerificationStatus: VerificationStatus; photoVerifiedOn?: string | null;
  photoVerifiedByUserId?: string | null; photoVerifiedByUserName?: string | null;
  photoUrl?: string | null;
  lastScannedEventId?: string | null; lastScannedEventName?: string | null; lastScannedPlace?: string | null; lastScannedAtUtc?: string | null;
  status: number; inactiveReason?: string | null;
  createdAtUtc: string; updatedAtUtc?: string | null;
};

export type ContributionSummary = {
  memberId: string;
  totalReceipts: number;
  totalOutstandingCommitments: number;
  totalOutstandingQarzanHasana: number;
  activeCommitmentCount: number;
  activeEnrollmentCount: number;
  activeLoanCount: number;
};

export const memberProfileApi = {
  get: async (id: string): Promise<MemberProfile> => (await api.get(`/api/v1/members/${id}/profile`)).data,
  updateIdentity: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/identity`, dto)).data as MemberProfile,
  updatePersonal: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/personal`, dto)).data as MemberProfile,
  updateContact: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/contact`, dto)).data as MemberProfile,
  updateAddress: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/address`, dto)).data as MemberProfile,
  updateOrigin: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/origin`, dto)).data as MemberProfile,
  updateEducationWork: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/education-work`, dto)).data as MemberProfile,
  updateReligious: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/religious`, dto)).data as MemberProfile,
  updateFamilyRefs: async (id: string, dto: Record<string, unknown>) => (await api.put(`/api/v1/members/${id}/profile/family-refs`, dto)).data as MemberProfile,
  verifyData: async (id: string, status: VerificationStatus) => (await api.post(`/api/v1/members/${id}/profile/verify-data`, { status })).data as MemberProfile,
  verifyPhoto: async (id: string, status: VerificationStatus) => (await api.post(`/api/v1/members/${id}/profile/verify-photo`, { status })).data as MemberProfile,
  setPhoto: async (id: string, photoUrl: string | null) => (await api.put(`/api/v1/members/${id}/profile/photo`, { photoUrl })).data as MemberProfile,
  uploadPhoto: async (id: string, file: File): Promise<MemberProfile> => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post(`/api/v1/members/${id}/profile/photo/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data as MemberProfile;
  },
  deletePhoto: async (id: string) => { await api.delete(`/api/v1/members/${id}/profile/photo/file`); },
  contributionSummary: async (id: string): Promise<ContributionSummary> =>
    (await api.get(`/api/v1/members/${id}/contribution-summary`)).data,

  // Multi-education endpoints (item 6)
  listEducations: async (id: string): Promise<MemberEducationEntry[]> =>
    (await api.get(`/api/v1/members/${id}/profile/educations`)).data,
  addEducation: async (id: string, input: AddMemberEducationInput): Promise<MemberEducationEntry> =>
    (await api.post(`/api/v1/members/${id}/profile/educations`, input)).data,
  updateEducation: async (id: string, eduId: string, input: AddMemberEducationInput): Promise<MemberEducationEntry> =>
    (await api.put(`/api/v1/members/${id}/profile/educations/${eduId}`, input)).data,
  deleteEducation: async (id: string, eduId: string) => {
    await api.delete(`/api/v1/members/${id}/profile/educations/${eduId}`);
  },
};

export type MemberEducationEntry = {
  id: string;
  memberId: string;
  level: Qualification;
  degree?: string | null;
  institution?: string | null;
  yearCompleted?: number | null;
  specialization?: string | null;
  isHighest: boolean;
};

export type AddMemberEducationInput = {
  level: Qualification;
  degree?: string | null;
  institution?: string | null;
  yearCompleted?: number | null;
  specialization?: string | null;
  isHighest?: boolean;
};

// --- Member change request (verification queue) ---
export type MemberChangeRequestStatus = 1 | 2 | 3;
export const MemberChangeRequestStatusLabel: Record<number, string> = {
  1: 'Pending', 2: 'Approved', 3: 'Rejected',
};
export const MemberChangeRequestStatusColor: Record<number, string> = {
  1: 'gold', 2: 'green', 3: 'red',
};
export type MemberChangeRequest = {
  id: string;
  memberId: string;
  memberName: string;
  section: string;
  payloadJson: string;
  status: MemberChangeRequestStatus;
  requestedByUserId: string;
  requestedByUserName: string;
  requestedAtUtc: string;
  reviewedByUserId?: string | null;
  reviewedByUserName?: string | null;
  reviewedAtUtc?: string | null;
  reviewerNote?: string | null;
};

export const memberChangeRequestApi = {
  /// Submit a change request for one section. Used by self-edit when the user has
  /// member.self.update but not member.update.
  submit: async (memberId: string, section: 'identity' | 'personal' | 'contact' | 'address' | 'origin' | 'education-work' | 'religious' | 'family-refs', payload: unknown) =>
    (await api.post(`/api/v1/members/${memberId}/profile/${section}/request-update`, payload)).data as MemberChangeRequest,
  listForMember: async (memberId: string) =>
    (await api.get(`/api/v1/members/${memberId}/profile/change-requests`)).data as MemberChangeRequest[],
  // Admin queue
  list: async (q: { page?: number; pageSize?: number; status?: MemberChangeRequestStatus; memberId?: string }) =>
    (await api.get('/api/v1/admin/member-change-requests', { params: q })).data as { items: MemberChangeRequest[]; total: number; page: number; pageSize: number },
  pendingCount: async () =>
    ((await api.get('/api/v1/admin/member-change-requests/pending-count')).data as { count: number }).count,
  approve: async (id: string, note?: string) =>
    (await api.post(`/api/v1/admin/member-change-requests/${id}/approve`, { note })).data as MemberChangeRequest,
  reject: async (id: string, note: string) =>
    (await api.post(`/api/v1/admin/member-change-requests/${id}/reject`, { note })).data as MemberChangeRequest,
};

// --- Wealth declaration (item C) ---
export type MemberAssetKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 99;
export const MemberAssetKindLabel: Record<number, string> = {
  1: 'Real estate', 2: 'Vehicle', 3: 'Investment', 4: 'Share market',
  5: 'Business', 6: 'Jewellery', 7: 'Cash', 99: 'Other',
};
export type MemberAsset = {
  id: string;
  memberId: string;
  kind: MemberAssetKind;
  description: string;
  estimatedValue: number | null;
  currency: string;
  notes: string | null;
  documentUrl: string | null;
};
export type AddMemberAssetInput = {
  kind: MemberAssetKind;
  description: string;
  estimatedValue?: number | null;
  currency: string;
  notes?: string | null;
};

export const memberAssetsApi = {
  list: async (memberId: string) =>
    (await api.get(`/api/v1/members/${memberId}/profile/assets`)).data as MemberAsset[],
  add: async (memberId: string, input: AddMemberAssetInput) =>
    (await api.post(`/api/v1/members/${memberId}/profile/assets`, input)).data as MemberAsset,
  update: async (memberId: string, assetId: string, input: AddMemberAssetInput) =>
    (await api.put(`/api/v1/members/${memberId}/profile/assets/${assetId}`, input)).data as MemberAsset,
  remove: async (memberId: string, assetId: string) => {
    await api.delete(`/api/v1/members/${memberId}/profile/assets/${assetId}`);
  },
};
