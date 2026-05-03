import { api } from '../../shared/api/client';

export type TopPage = {
  path: string;
  module: string;
  views: number;
  uniqueUsers: number;
};

export type TopAction = {
  action: string;
  module: string;
  httpMethod: string;
  calls: number;
  uniqueUsers: number;
  avgDurationMs: number;
  p95DurationMs: number;
};

export type DailyActiveUsers = {
  date: string;
  dailyActiveUsers: number;
  pageViews: number;
  actionCalls: number;
};

export type HourlyActivity = {
  dayOfWeek: number;
  hour: number;
  eventCount: number;
};

export type TopUser = {
  userId: string;
  userName: string;
  pageViews: number;
  actionCalls: number;
  lastSeenUtc: string;
};

export type AnalyticsSummary = {
  from: string;
  to: string;
  totalPageViews: number;
  totalActionCalls: number;
  uniqueUsers: number;
  uniqueSessions: number;
  avgEventsPerUser: number;
};

export type UsageQueueStats = {
  currentDepth: number;
  totalEnqueued: number;
  totalDropped: number;
  totalFlushed: number;
};

export type AnalyticsOverview = {
  summary: AnalyticsSummary;
  topPages: TopPage[];
  topActions: TopAction[];
  dauTrend: DailyActiveUsers[];
  heatmap: HourlyActivity[];
  topUsers: TopUser[];
  queue: UsageQueueStats;
};

export type AnalyticsRange = { from?: string; to?: string; tenantId?: string };

export const analyticsApi = {
  overview: async (range: AnalyticsRange = {}) =>
    (await api.get<AnalyticsOverview>('/api/v1/system/analytics/overview', { params: range })).data,

  /// SPA-side page-view tracker. Fire-and-forget on every route change. Uses navigator.sendBeacon
  /// when available (survives page unloads); falls back to a regular axios POST. Errors are
  /// swallowed - telemetry must never break navigation.
  trackPage: (path: string, durationMs?: number): void => {
    try {
      const body = JSON.stringify({ path, durationMs });
      const headers = { 'Content-Type': 'application/json' };
      // sendBeacon is fire-and-forget and CORS-safe, but it doesn't carry our Authorization
      // header, so we'd lose attribution. Stick with axios + the configured client.
      void api.post('/api/v1/usage/page', { path, durationMs }, { headers }).catch(() => { /* ignore */ });
      void body;
    } catch { /* swallow - telemetry must never break the SPA */ }
  },
};
