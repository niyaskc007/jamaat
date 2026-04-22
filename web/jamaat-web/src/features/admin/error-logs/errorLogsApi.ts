import { api } from '../../../shared/api/client';

export type ErrorSource = 1 | 2 | 3 | 4 | 5;   // Api | Web | Mobile | Job | Integration
export type ErrorSeverity = 1 | 2 | 3 | 4;     // Info | Warning | Error | Fatal
export type ErrorStatus = 1 | 2 | 3 | 4;       // Reported | Reviewed | Resolved | Ignored

export const ErrorSourceLabel: Record<ErrorSource, string> = {
  1: 'API', 2: 'Web', 3: 'Mobile', 4: 'Job', 5: 'Integration',
};
export const ErrorSeverityLabel: Record<ErrorSeverity, string> = {
  1: 'Info', 2: 'Warning', 3: 'Error', 4: 'Fatal',
};
export const ErrorStatusLabel: Record<ErrorStatus, string> = {
  1: 'Reported', 2: 'Reviewed', 3: 'Resolved', 4: 'Ignored',
};

export type ErrorLog = {
  id: number;
  tenantId?: string | null;
  source: ErrorSource;
  severity: ErrorSeverity;
  status: ErrorStatus;
  message: string;
  exceptionType?: string | null;
  stackTrace?: string | null;
  endpoint?: string | null;
  httpMethod?: string | null;
  httpStatus?: number | null;
  correlationId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  fingerprint: string;
  occurredAtUtc: string;
  reviewedAtUtc?: string | null;
  reviewedByUserName?: string | null;
  resolvedAtUtc?: string | null;
  resolvedByUserName?: string | null;
  resolutionNote?: string | null;
};

export type ErrorLogStats = {
  today: number;
  last7Days: number;
  total: number;
  open: number;
  reviewed: number;
  resolved: number;
};

export type ErrorLogListQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'Asc' | 'Desc';
  search?: string;
  source?: ErrorSource;
  severity?: ErrorSeverity;
  status?: ErrorStatus;
  fromUtc?: string;
  toUtc?: string;
  groupSimilar?: boolean;
};

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ReportClientErrorInput = {
  severity: ErrorSeverity;
  message: string;
  exceptionType?: string;
  stackTrace?: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  correlationId?: string;
  userAgent?: string;
};

export const errorLogsApi = {
  list: async (q: ErrorLogListQuery): Promise<PagedResult<ErrorLog>> => {
    const { data } = await api.get<PagedResult<ErrorLog>>('/api/v1/error-logs', { params: q });
    return data;
  },
  stats: async (): Promise<ErrorLogStats> => {
    const { data } = await api.get<ErrorLogStats>('/api/v1/error-logs/stats');
    return data;
  },
  review: async (id: number): Promise<void> => {
    await api.post(`/api/v1/error-logs/${id}/review`);
  },
  resolve: async (id: number, note?: string): Promise<void> => {
    await api.post(`/api/v1/error-logs/${id}/resolve`, { note: note ?? null });
  },
  ignore: async (id: number): Promise<void> => {
    await api.post(`/api/v1/error-logs/${id}/ignore`);
  },
  report: async (input: ReportClientErrorInput): Promise<void> => {
    // Fire-and-forget — never block the user on error reporting
    try {
      await api.post('/api/v1/error-logs/report', input);
    } catch {
      // no-op
    }
  },
};
