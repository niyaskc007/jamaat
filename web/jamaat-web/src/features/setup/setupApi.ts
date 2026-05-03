import { api } from '../../shared/api/client';

export type SetupStatus = {
  requiresSetup: boolean;
  hasAnyAdmin: boolean;
  hasAnyTenant: boolean;
  dbReachable: boolean;
  version: string;
};

export type InitializeSetupInput = {
  tenantName: string;
  tenantCode: string;
  baseCurrency: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
  preferredLanguage?: string;
};

export type InitializeSetupResult = {
  tenantId: string;
  adminUserId: string;
  loginEmail: string;
};

/// First-run setup wizard endpoints. Both are anonymous on the API side because
/// by definition no admin exists when the wizard is shown.
export const setupApi = {
  status: async (): Promise<SetupStatus> =>
    (await api.get<SetupStatus>('/api/v1/setup/status')).data,

  initialize: async (input: InitializeSetupInput): Promise<InitializeSetupResult> =>
    (await api.post<InitializeSetupResult>('/api/v1/setup/initialize', input)).data,
};
