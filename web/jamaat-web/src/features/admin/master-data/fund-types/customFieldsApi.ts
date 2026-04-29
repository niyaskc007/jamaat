import { api } from '../../../../shared/api/client';

/// Mirrors Domain.Enums.CustomFieldType. 1=Text, 2=LongText, 3=Number, 4=Date, 5=Boolean, 6=Dropdown.
export type CustomFieldType = 1 | 2 | 3 | 4 | 5 | 6;

export const CustomFieldTypeLabel: Record<CustomFieldType, string> = {
  1: 'Text', 2: 'Long text', 3: 'Number', 4: 'Date', 5: 'Yes / No', 6: 'Dropdown',
};

export type FundTypeCustomField = {
  id: string;
  fundTypeId: string;
  fieldKey: string;
  label: string;
  helpText?: string | null;
  fieldType: CustomFieldType;
  isRequired: boolean;
  optionsCsv?: string | null;
  defaultValue?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAtUtc: string;
};

export const fundTypeCustomFieldsApi = {
  list: async (fundTypeId: string, activeOnly?: boolean) =>
    (await api.get<FundTypeCustomField[]>(`/api/v1/fund-types/${fundTypeId}/custom-fields`, { params: { activeOnly } })).data,
  /// Same data as list() but reachable by anyone with receipt.view (used by the receipt form).
  listActive: async (fundTypeId: string) =>
    (await api.get<FundTypeCustomField[]>(`/api/v1/fund-types/${fundTypeId}/active-custom-fields`)).data,
  create: async (fundTypeId: string, input: { fieldKey: string; label: string; fieldType: CustomFieldType; isRequired?: boolean; helpText?: string; optionsCsv?: string; defaultValue?: string; sortOrder?: number }) =>
    (await api.post<FundTypeCustomField>(`/api/v1/fund-types/${fundTypeId}/custom-fields`, { ...input, fundTypeId })).data,
  update: async (fundTypeId: string, id: string, input: { label: string; fieldType: CustomFieldType; isRequired: boolean; helpText?: string; optionsCsv?: string; defaultValue?: string; sortOrder: number; isActive: boolean }) =>
    (await api.put<FundTypeCustomField>(`/api/v1/fund-types/${fundTypeId}/custom-fields/${id}`, input)).data,
  remove: async (fundTypeId: string, id: string) => { await api.delete(`/api/v1/fund-types/${fundTypeId}/custom-fields/${id}`); },
};
