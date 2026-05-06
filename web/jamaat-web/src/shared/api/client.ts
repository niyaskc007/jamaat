import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { message as antdMessage } from 'antd';
import { env } from '../config/env';
import { authStore } from '../auth/authStore';

export const api = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  withCredentials: false,
});

function genCorrelationId() {
  return crypto.randomUUID().replace(/-/g, '');
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Correlation-Id'] = genCorrelationId();
  return config;
});

export type ApiProblem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: unknown;
};

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<ApiProblem>) => {
    const status = err.response?.status;

    if (status === 401) {
      // Distinguish "session expired" (we had a token, server rejected it - usually TTL or
      // server restart with a new JWT key) from "never logged in". The first case deserves
      // a user-visible cue so people don't stare at a silent failure.
      const hadSession = !!authStore.getAccessToken();
      authStore.clear();
      if (!window.location.pathname.startsWith('/login')) {
        if (hadSession) {
          try {
            antdMessage.warning({
              content: 'Your session has expired. Please sign in again.',
              duration: 5,
              key: 'session-expired', // de-dupe when multiple 401s arrive in a burst
            });
          } catch { /* toast is best-effort */ }
        }
        // Preserve where the user was so RequireAuth can bounce them back after login.
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?returnTo=${returnTo}`;
      }
    }

    // Auto-report non-auth client-side failures to the backend error log.
    // We skip the reporting endpoint itself (don't loop), 401s (handled above), and 4xx validation.
    const reqUrl = err.config?.url ?? '';
    if (
      reqUrl &&
      !reqUrl.includes('/error-logs/report') &&
      status !== 401 &&
      (status === undefined || status >= 500)
    ) {
      void reportClientError({
        severity: status === undefined ? 3 : status >= 500 ? 3 : 2,
        message: err.message || 'Network/API error',
        exceptionType: err.name,
        stackTrace: err.stack,
        endpoint: reqUrl,
        httpMethod: err.config?.method?.toUpperCase(),
        httpStatus: status,
        correlationId: err.response?.headers?.['x-correlation-id'] as string | undefined,
        userAgent: navigator.userAgent,
      });
    }

    return Promise.reject(err);
  },
);

/** Fire-and-forget client error report. Never throws. */
async function reportClientError(input: {
  severity: 1 | 2 | 3 | 4;
  message: string;
  exceptionType?: string;
  stackTrace?: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  correlationId?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await api.post('/api/v1/error-logs/report', input);
  } catch {
    /* no-op */
  }
}

/** Exposed for ErrorBoundary and other runtime error sources. */
export const clientErrorReporter = { report: reportClientError };

export function extractProblem(err: unknown): ApiProblem {
  const axiosErr = err as AxiosError<unknown>;
  const data = axiosErr.response?.data as Record<string, unknown> | undefined;
  if (!data) {
    return { title: 'Network error', detail: axiosErr.message, status: 0 };
  }
  // ProblemDetails (RFC 7807) - what most controllers return.
  if (typeof data.title === 'string' || typeof data.detail === 'string') {
    const p = data as ApiProblem;
    // ModelState validation: flatten the {fieldName: [msgs]} dict into a readable list
    // so the SPA can show the real reasons instead of just "validation errors occurred".
    if (!p.detail && p.errors && typeof p.errors === 'object') {
      const flat = Object.values(p.errors as Record<string, string[]>)
        .flat()
        .filter((s) => typeof s === 'string');
      if (flat.length > 0) {
        return { ...p, detail: flat.join(' ') };
      }
    }
    return p;
  }
  // Bare `{error, message}` shape used by SetupController and a few legacy endpoints.
  if (typeof data.error === 'string' || typeof data.message === 'string') {
    return {
      title: typeof data.error === 'string' ? data.error : undefined,
      detail: typeof data.message === 'string' ? data.message : undefined,
      status: axiosErr.response?.status,
    };
  }
  return { title: 'Request failed', detail: axiosErr.message, status: axiosErr.response?.status };
}
