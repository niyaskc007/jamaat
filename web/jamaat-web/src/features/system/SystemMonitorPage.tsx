import { Card, Col, Row, Table, Tag, Spin, Alert, Progress, Empty, Tooltip, Button, message } from 'antd';
import {
  CloudServerOutlined,
  DatabaseOutlined,
  HddOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  FileSearchOutlined,
  ApiOutlined,
  UserOutlined,
  LoginOutlined,
  WarningOutlined,
  LineChartOutlined,
  AlertOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { formatDate } from '../../shared/format/format';
import {
  systemApi,
  type DriveStat,
  type TableStat,
  type TenantSummary,
  type OnlineUser,
  type RecentLogin,
  type RecentError,
  type SystemAlert as SystemAlertRow,
} from './systemApi';

const ACCENT = {
  positive: '#0E5C40',
  warn: '#D97706',
  danger: '#DC2626',
  cyan: '#0E7490',
  financial: '#7C3AED',
} as const;

/// /system - SuperAdmin-only host & database monitor. Auto-refreshes every 5 s; each tile
/// is independent so a failure in one section (e.g. msdb permission denied for the last-backup
/// query) doesn't blank the whole page. Designed for at-a-glance health: a single look should
/// answer "is the box ok, is the DB ok, are the logs angry, what tenants are using it".
export function SystemMonitorPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['system', 'overview'],
    queryFn: () => systemApi.overview(200),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  const ackMutation = useMutation({
    mutationFn: (id: number) => systemApi.acknowledgeAlert(id),
    onSuccess: () => {
      message.success('Alert acknowledged.');
      qc.invalidateQueries({ queryKey: ['system', 'overview'] });
    },
    onError: (e: Error) => message.error(`Failed to ack: ${e.message}`),
  });

  if (q.isLoading || !q.data) {
    return (
      <div>
        <PageHeader title="System Monitor" subtitle="Live host, runtime, and database health" />
        <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>
      </div>
    );
  }
  if (q.error) {
    return (
      <div>
        <PageHeader title="System Monitor" />
        <Alert type="error" showIcon message="Failed to load system overview" description={(q.error as Error).message} />
      </div>
    );
  }

  const { server, database, tenants, recentLogs, liveOps } = q.data;
  const primaryDrive = server.drives.find(d => d.name.toUpperCase().startsWith('C')) ?? server.drives[0];

  const kpiCpuAccent = pickAccent(server.cpuPercent, 60, 85);
  const kpiRamAccent = pickAccent(server.systemRamPercent, 70, 90);
  const kpiDiskAccent = pickAccent(primaryDrive?.usedPercent ?? 0, 80, 95);
  const failedAccent = liveOps.failedLoginsLastHour >= 20 ? ACCENT.danger
                       : liveOps.failedLoginsLastHour >= 5 ? ACCENT.warn
                       : ACCENT.positive;
  const reqRateData = liveOps.requests.perMinuteLast60.map((count, i) => ({
    label: i === 59 ? 'now' : `${59 - i}m`,
    Requests: count,
  }));

  return (
    <div>
      <PageHeader
        title="System Monitor"
        subtitle={`${server.machineName} · ${server.environment} · auto-refreshing every 5 s`}
      />

      {/* -- Open alerts banner ---------------------------------------------- */}
      {liveOps.openAlertCount > 0 && (
        <Alert
          type={liveOps.recentAlerts.some(a => !a.acknowledged && a.severity === 'Critical') ? 'error' : 'warning'}
          showIcon
          icon={<AlertOutlined />}
          message={`${liveOps.openAlertCount} open alert${liveOps.openAlertCount === 1 ? '' : 's'}`}
          description={liveOps.recentAlerts.find(a => !a.acknowledged)?.title ?? 'See the Alerts section below.'}
          style={{ marginBlockEnd: 16 }}
        />
      )}

      {/* -- Live ops KPI strip ---------------------------------------------- */}
      <Row gutter={[16, 16]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<UserOutlined />}
            label="Users online"
            value={liveOps.onlineUserCount}
            format="number"
            caption="active in last 5 min"
            accent={ACCENT.cyan}
          />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<LineChartOutlined />}
            label="Requests / min"
            value={liveOps.requests.last1Min}
            format="number"
            caption={`${liveOps.requests.last5Min} in last 5 min · ${liveOps.requests.totalSinceStartup.toLocaleString()} since startup`}
            sparkline={liveOps.requests.perMinuteLast60.slice(-30)}
            accent={ACCENT.financial}
          />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<LoginOutlined />}
            label="Failed logins (1h)"
            value={liveOps.failedLoginsLastHour}
            format="number"
            caption="lockout / brute-force signal"
            accent={failedAccent}
          />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<WarningOutlined />}
            label="Recent errors"
            value={liveOps.recentErrors.length}
            format="number"
            caption={liveOps.recentErrors.length === 0 ? 'all quiet' : `latest: ${shorten(liveOps.recentErrors[0].message, 36)}`}
            accent={liveOps.recentErrors.length > 0 ? ACCENT.warn : ACCENT.positive}
          />
        </Col>
      </Row>

      {/* -- Host KPI strip --------------------------------------------------- */}
      <Row gutter={[16, 16]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<ThunderboltOutlined />}
            label="Process CPU"
            value={server.cpuPercent}
            format="number"
            suffix="%"
            caption={`${server.processorCount} logical cores`}
            accent={kpiCpuAccent}
          />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<CloudServerOutlined />}
            label="System RAM"
            value={server.systemRamPercent}
            format="number"
            suffix="%"
            caption={`${formatMb(server.systemTotalRamMb - server.systemFreeRamMb)} of ${formatMb(server.systemTotalRamMb)} used`}
            accent={kpiRamAccent}
          />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<HddOutlined />}
            label={`Disk ${primaryDrive?.name ?? ''}`}
            value={primaryDrive?.usedPercent ?? null}
            format="number"
            suffix="%"
            caption={primaryDrive ? `${formatMb(primaryDrive.freeMb)} free of ${formatMb(primaryDrive.totalMb)}` : 'no fixed drives'}
            accent={kpiDiskAccent}
          />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<DatabaseOutlined />}
            label="Database size"
            value={database?.totalSizeMb ?? null}
            format="number"
            suffix="MB"
            caption={database ? `${database.databaseName} · ${database.connectionCount} active sessions` : 'database unreachable'}
            accent={ACCENT.financial}
          />
        </Col>
      </Row>

      {/* -- Request rate trend (60-min sparkline) --------------------------- */}
      <Card title={<span><LineChartOutlined /> &nbsp; Request rate (last 60 minutes)</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <div style={{ width: '100%', height: 140 }}>
          <ResponsiveContainer>
            <AreaChart data={reqRateData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="rrate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" interval={9} fontSize={11} stroke="#94a3b8" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" width={32} />
              <RTooltip />
              <Area type="monotone" dataKey="Requests" stroke="#7C3AED" strokeWidth={2} fill="url(#rrate)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* -- Online users ----------------------------------------------------- */}
      <Card title={<span><UserOutlined /> &nbsp; Users online (last 5 min)</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <Table<OnlineUser>
          rowKey="userId"
          dataSource={liveOps.onlineUsers}
          pagination={false}
          size="small"
          columns={[
            { title: 'User', dataIndex: 'userName' },
            { title: 'IP', dataIndex: 'ipAddress', render: (v: string | null) => v ?? <Tag>—</Tag> },
            { title: 'Agent', dataIndex: 'userAgent', render: (v: string | null) => v ? <Tooltip title={v}>{shorten(v, 32)}</Tooltip> : <Tag>—</Tag> },
            { title: 'First seen', dataIndex: 'firstSeenUtc', render: (v: string) => formatDate(v) },
            { title: 'Last seen', dataIndex: 'lastSeenUtc', render: (v: string) => <Tooltip title={v}>{relativeFromNow(v)}</Tooltip> },
            { title: 'Requests', dataIndex: 'requestCount', align: 'right', render: (v: number) => v.toLocaleString() },
          ]}
          locale={{ emptyText: <Empty description="No users active right now" /> }}
        />
      </Card>

      {/* -- Recent logins ---------------------------------------------------- */}
      <Card title={<span><LoginOutlined /> &nbsp; Recent login attempts</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <Table<RecentLogin>
          rowKey="id"
          dataSource={liveOps.recentLogins}
          pagination={false}
          size="small"
          columns={[
            {
              title: 'When',
              dataIndex: 'attemptedAtUtc',
              render: (v: string) => <Tooltip title={v}>{relativeFromNow(v)}</Tooltip>,
              width: 120,
            },
            {
              title: 'Result',
              dataIndex: 'success',
              render: (s: boolean) => s ? <Tag color="green">success</Tag> : <Tag color="red">fail</Tag>,
              width: 90,
            },
            { title: 'Identifier', dataIndex: 'identifier' },
            { title: 'Reason', dataIndex: 'failureReason', render: (v?: string | null) => v ?? '' },
            { title: 'IP', dataIndex: 'ipAddress', render: (v?: string | null) => v ?? <Tag>—</Tag>, width: 140 },
            {
              title: 'Location',
              render: (_, r) => [r.geoCity, r.geoCountry].filter(Boolean).join(', ') || <Tag>—</Tag>,
              width: 160,
            },
          ]}
          locale={{ emptyText: <Empty description="No login attempts recorded yet" /> }}
        />
      </Card>

      {/* -- Recent errors ---------------------------------------------------- */}
      <Card title={<span><WarningOutlined /> &nbsp; Recent errors</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <Table<RecentError>
          rowKey="id"
          dataSource={liveOps.recentErrors}
          pagination={false}
          size="small"
          columns={[
            { title: 'When', dataIndex: 'occurredAtUtc', render: (v: string) => <Tooltip title={v}>{relativeFromNow(v)}</Tooltip>, width: 120 },
            { title: 'Severity', dataIndex: 'severity', render: severityTag, width: 90 },
            { title: 'Source', dataIndex: 'source', width: 90 },
            { title: 'Status', dataIndex: 'httpStatus', render: (v?: number | null) => v ?? '', width: 70 },
            { title: 'Endpoint', dataIndex: 'endpoint', render: (v?: string | null) => v ? <Tooltip title={v}>{shorten(v, 32)}</Tooltip> : '', width: 220 },
            { title: 'Message', dataIndex: 'message', render: (v: string) => <Tooltip title={v}>{shorten(v, 80)}</Tooltip> },
            { title: 'User', dataIndex: 'userName', render: (v?: string | null) => v ?? <Tag>—</Tag>, width: 140 },
          ]}
          locale={{ emptyText: <Empty description="All quiet — no errors recorded" /> }}
        />
      </Card>

      {/* -- System alerts --------------------------------------------------- */}
      <Card
        title={<span><AlertOutlined /> &nbsp; System alerts</span>}
        extra={<span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
          {liveOps.openAlertCount} open · {liveOps.recentAlerts.length} recent
        </span>}
        className="jm-card"
        style={{ marginBlockEnd: 16 }}
      >
        <Table<SystemAlertRow>
          rowKey="id"
          dataSource={liveOps.recentAlerts}
          pagination={false}
          size="small"
          rowClassName={(r) => r.acknowledged ? 'jm-alert-acked' : ''}
          columns={[
            { title: 'Severity', dataIndex: 'severity', render: severityAlertTag, width: 100 },
            { title: 'Kind', dataIndex: 'kind', render: (v: string) => <Tag>{v}</Tag>, width: 140 },
            { title: 'Title', dataIndex: 'title', render: (v: string, r: SystemAlertRow) => (
              <Tooltip title={r.detail}>
                <span style={{ opacity: r.acknowledged ? 0.55 : 1 }}>{v}</span>
              </Tooltip>
            ) },
            { title: 'First seen', dataIndex: 'firstSeenAtUtc', render: (v: string) => <Tooltip title={v}>{relativeFromNow(v)}</Tooltip>, width: 110 },
            { title: 'Last seen', dataIndex: 'lastSeenAtUtc', render: (v: string) => <Tooltip title={v}>{relativeFromNow(v)}</Tooltip>, width: 110 },
            { title: 'Repeats', dataIndex: 'repeatCount', align: 'right', width: 80,
              render: (v: number) => v > 1 ? <Tag color="orange">×{v}</Tag> : <span style={{ color: 'var(--jm-gray-400)' }}>×1</span> },
            { title: 'Notified', dataIndex: 'recipientCount', align: 'right', width: 80,
              render: (v: number) => v === 0 ? <Tooltip title="No recipients resolved — check Alerts:Recipients or SuperAdmin emails"><Tag color="red">0</Tag></Tooltip> : v },
            {
              title: 'Status',
              width: 130,
              render: (_, r: SystemAlertRow) => r.acknowledged
                ? <Tooltip title={r.acknowledgedAtUtc ?? ''}><Tag color="green" icon={<CheckCircleOutlined />}>acked</Tag></Tooltip>
                : <Button size="small" type="primary" loading={ackMutation.isPending && ackMutation.variables === r.id}
                    onClick={() => ackMutation.mutate(r.id)}>Acknowledge</Button>,
            },
          ]}
          locale={{ emptyText: <Empty description="All clear — no alerts have fired" /> }}
        />
      </Card>

      {/* -- Server details + Process details -------------------------------- */}
      <Row gutter={[16, 16]} style={{ marginBlockEnd: 16 }}>
        <Col xs={24} md={12}>
          <Card title={<span><CloudServerOutlined /> &nbsp; Server</span>} className="jm-card">
            <KvList rows={[
              ['Machine name', server.machineName],
              ['Operating system', server.osDescription],
              ['Architecture', server.osArchitecture],
              ['Runtime', server.dotnetVersion],
              ['App version', server.appVersion],
              ['Environment', <Tag key="env" color={server.environment === 'Production' ? 'red' : 'green'}>{server.environment}</Tag>],
              ['Uptime', <span key="up"><ClockCircleOutlined /> {server.processUptime}</span>],
              ['Started at', formatDate(server.processStartedAt)],
            ]} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<span><ApiOutlined /> &nbsp; Process</span>} className="jm-card">
            <KvList rows={[
              ['Working set', `${server.processWorkingSetMb} MB`],
              ['Private memory', `${server.processPrivateMemoryMb} MB`],
              ['Managed heap', `${server.managedHeapMb} MB`],
              ['Threads', server.threadCount],
              ['Handles', server.handleCount],
              ['Process CPU', `${server.processCpuPercent.toFixed(1)} %`],
            ]} />
          </Card>
        </Col>
      </Row>

      {/* -- Disks ----------------------------------------------------------- */}
      <Card title={<span><HddOutlined /> &nbsp; Disks</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <Table<DriveStat>
          rowKey="name"
          dataSource={server.drives}
          pagination={false}
          size="small"
          columns={[
            { title: 'Drive', dataIndex: 'name' },
            { title: 'Label', dataIndex: 'label' },
            { title: 'Format', dataIndex: 'format' },
            { title: 'Total', dataIndex: 'totalMb', align: 'right', render: (v: number) => formatMb(v) },
            { title: 'Free', dataIndex: 'freeMb', align: 'right', render: (v: number) => formatMb(v) },
            {
              title: 'Used',
              dataIndex: 'usedPercent',
              render: (pct: number) => (
                <Progress
                  percent={pct}
                  size="small"
                  status={pct >= 95 ? 'exception' : pct >= 80 ? 'active' : 'normal'}
                  style={{ minWidth: 160 }}
                />
              ),
            },
          ]}
          locale={{ emptyText: <Empty description="No drives reported" /> }}
        />
      </Card>

      {/* -- Database -------------------------------------------------------- */}
      <Card title={<span><DatabaseOutlined /> &nbsp; Database</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        {database && database.canConnect ? (
          <>
            <Row gutter={[24, 16]}>
              <Col xs={24} md={12}>
                <KvList rows={[
                  ['Database', database.databaseName],
                  ['Server version', database.serverVersion || 'unknown'],
                  ['Total size', `${database.totalSizeMb} MB`],
                  ['Data files', `${database.dataSizeMb} MB`],
                  ['Log files', `${database.logSizeMb} MB`],
                ]} />
              </Col>
              <Col xs={24} md={12}>
                <KvList rows={[
                  ['Active sessions', database.connectionCount],
                  ['Recovery model', database.recoveryModel ?? <Tag>unknown</Tag>],
                  ['Last full backup', database.lastBackupAt ? formatDate(database.lastBackupAt) : <Tag color="orange">never</Tag>],
                ]} />
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginBlockStart: 16 }}>
              <Col xs={24} md={12}>
                <h4 style={{ marginBlock: '0 8px' }}>Top 10 tables by size</h4>
                <Table<TableStat>
                  rowKey={r => `${r.schema}.${r.name}`}
                  dataSource={database.topTablesBySize}
                  pagination={false}
                  size="small"
                  columns={[
                    { title: 'Table', render: (_, r) => `${r.schema}.${r.name}` },
                    { title: 'Rows', dataIndex: 'rowCount', align: 'right', render: (v: number) => v.toLocaleString() },
                    { title: 'Size', dataIndex: 'sizeKb', align: 'right', render: (v: number) => v >= 1024 ? `${Math.round(v / 1024)} MB` : `${v} KB` },
                  ]}
                />
              </Col>
              <Col xs={24} md={12}>
                <h4 style={{ marginBlock: '0 8px' }}>Top 10 tables by row count</h4>
                <Table<TableStat>
                  rowKey={r => `${r.schema}.${r.name}`}
                  dataSource={database.topTablesByRowCount}
                  pagination={false}
                  size="small"
                  columns={[
                    { title: 'Table', render: (_, r) => `${r.schema}.${r.name}` },
                    { title: 'Rows', dataIndex: 'rowCount', align: 'right', render: (v: number) => v.toLocaleString() },
                    { title: 'Size', dataIndex: 'sizeKb', align: 'right', render: (v: number) => v >= 1024 ? `${Math.round(v / 1024)} MB` : `${v} KB` },
                  ]}
                />
              </Col>
            </Row>
          </>
        ) : (
          <Alert type="warning" showIcon message="Database is unreachable from the API." />
        )}
      </Card>

      {/* -- Tenants --------------------------------------------------------- */}
      <Card title={<span><TeamOutlined /> &nbsp; Tenants</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <Table<TenantSummary>
          rowKey="id"
          dataSource={tenants}
          pagination={false}
          size="small"
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Currency', dataIndex: 'baseCurrency', render: (v: string) => <Tag>{v || '—'}</Tag> },
            { title: 'Members', dataIndex: 'memberCount', align: 'right', render: (v: number) => v.toLocaleString() },
            { title: 'Families', dataIndex: 'familyCount', align: 'right', render: (v: number) => v.toLocaleString() },
            { title: 'Users', dataIndex: 'userCount', align: 'right', render: (v: number) => v.toLocaleString() },
            { title: 'Receipts', dataIndex: 'receiptCount', align: 'right', render: (v: number) => v.toLocaleString() },
            {
              title: 'Last activity',
              dataIndex: 'lastActivityAt',
              render: (v: string | null | undefined) => v ? <Tooltip title={v}>{formatDate(v)}</Tooltip> : <Tag>—</Tag>,
            },
          ]}
        />
      </Card>

      {/* -- Logs ------------------------------------------------------------ */}
      <Card
        title={<span><FileSearchOutlined /> &nbsp; Recent log lines</span>}
        extra={recentLogs && (
          <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
            {recentLogs.lineCount.toLocaleString()} lines · {formatBytes(recentLogs.fileSizeBytes)} · {formatDate(recentLogs.lastWriteAt)}
          </span>
        )}
        className="jm-card"
      >
        {recentLogs ? (
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: '#0F172A',
              color: '#9FCDBF',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Consolas', monospace",
              maxHeight: 400,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {recentLogs.lines.length === 0 ? '(no log lines yet)' : recentLogs.lines.join('\n')}
          </pre>
        ) : (
          <Empty description="No log file found. Make sure Serilog is configured to write to logs/." />
        )}
        {recentLogs && (
          <div style={{ fontSize: 11, color: 'var(--jm-gray-400)', marginBlockStart: 8 }}>{recentLogs.filePath}</div>
        )}
      </Card>
    </div>
  );
}

function KvList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <table className="jm-tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: '6px 0', color: 'var(--jm-gray-500)', width: 160 }}>{k}</td>
            <td style={{ padding: '6px 0', color: 'var(--jm-gray-900)' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function pickAccent(pct: number, warn: number, danger: number): string {
  if (pct >= danger) return ACCENT.danger;
  if (pct >= warn) return ACCENT.warn;
  return ACCENT.positive;
}

function formatMb(mb: number): string {
  if (mb >= 1024 * 1024) return `${(mb / 1024 / 1024).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function shorten(s: string | null | undefined, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function relativeFromNow(iso: string): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

function severityTag(s: string): React.ReactNode {
  const colour = s === 'Critical' ? 'red' : s === 'Error' ? 'volcano' : s === 'Warning' ? 'orange' : 'blue';
  return <Tag color={colour}>{s}</Tag>;
}

function severityAlertTag(s: string): React.ReactNode {
  const colour = s === 'Critical' ? 'red' : s === 'Warning' ? 'orange' : 'blue';
  const icon = s === 'Critical' ? <AlertOutlined /> : <WarningOutlined />;
  return <Tag color={colour} icon={icon}>{s}</Tag>;
}
