import { api } from '../../shared/api/client';

export type DriveStat = {
  name: string;
  label: string;
  format: string;
  totalMb: number;
  freeMb: number;
  usedMb: number;
  usedPercent: number;
};

export type ServerStats = {
  machineName: string;
  osDescription: string;
  osArchitecture: string;
  dotnetVersion: string;
  processUptime: string;
  processStartedAt: string;
  appVersion: string;
  environment: string;
  processorCount: number;
  cpuPercent: number;
  processCpuPercent: number;
  processWorkingSetMb: number;
  processPrivateMemoryMb: number;
  managedHeapMb: number;
  threadCount: number;
  handleCount: number;
  systemTotalRamMb: number;
  systemFreeRamMb: number;
  systemRamPercent: number;
  drives: DriveStat[];
};

export type TableStat = {
  schema: string;
  name: string;
  rowCount: number;
  sizeKb: number;
};

export type DatabaseStats = {
  databaseName: string;
  serverVersion: string;
  totalSizeMb: number;
  dataSizeMb: number;
  logSizeMb: number;
  connectionCount: number;
  lastBackupAt?: string | null;
  recoveryModel?: string | null;
  canConnect: boolean;
  topTablesBySize: TableStat[];
  topTablesByRowCount: TableStat[];
};

export type LogTail = {
  filePath: string;
  fileSizeBytes: number;
  lastWriteAt: string;
  lineCount: number;
  lines: string[];
};

export type TenantSummary = {
  id: string;
  code: string;
  name: string;
  baseCurrency: string;
  memberCount: number;
  userCount: number;
  familyCount: number;
  receiptCount: number;
  lastActivityAt?: string | null;
};

export type OnlineUser = {
  userId: string;
  userName: string;
  firstSeenUtc: string;
  lastSeenUtc: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestCount: number;
};

export type RequestRate = {
  last1Min: number;
  last5Min: number;
  perMinuteLast60: number[];
  totalSinceStartup: number;
};

export type RecentLogin = {
  id: number;
  userId?: string | null;
  identifier: string;
  success: boolean;
  failureReason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  geoCountry?: string | null;
  geoCity?: string | null;
  attemptedAtUtc: string;
};

export type RecentError = {
  id: number;
  source: string;
  severity: string;
  status: string;
  message: string;
  exceptionType?: string | null;
  endpoint?: string | null;
  httpStatus?: number | null;
  userName?: string | null;
  occurredAtUtc: string;
};

export type SystemAlert = {
  id: number;
  fingerprint: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  firstSeenAtUtc: string;
  lastSeenAtUtc: string;
  repeatCount: number;
  recipientCount: number;
  acknowledged: boolean;
  acknowledgedAtUtc?: string | null;
};

export type LiveOps = {
  onlineUsers: OnlineUser[];
  onlineUserCount: number;
  requests: RequestRate;
  recentLogins: RecentLogin[];
  recentErrors: RecentError[];
  failedLoginsLastHour: number;
  recentAlerts: SystemAlert[];
  openAlertCount: number;
};

export type SystemOverview = {
  server: ServerStats;
  database: DatabaseStats | null;
  tenants: TenantSummary[];
  recentLogs: LogTail | null;
  liveOps: LiveOps;
};

export const systemApi = {
  overview: async (logTake = 200) =>
    (await api.get<SystemOverview>('/api/v1/system/overview', { params: { logTake } })).data,
  server: async () => (await api.get<ServerStats>('/api/v1/system/server')).data,
  database: async () => (await api.get<DatabaseStats>('/api/v1/system/database')).data,
  logs: async (take = 500) => (await api.get<LogTail>('/api/v1/system/logs', { params: { take } })).data,
  tenants: async () => (await api.get<TenantSummary[]>('/api/v1/system/tenants')).data,
  live: async () => (await api.get<LiveOps>('/api/v1/system/live')).data,
  acknowledgeAlert: async (id: number) => {
    await api.post(`/api/v1/system/alerts/${id}/acknowledge`);
  },
};
