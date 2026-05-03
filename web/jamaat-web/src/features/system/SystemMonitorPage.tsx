import { Card, Col, Row, Table, Tag, Spin, Alert, Progress, Empty, Tooltip } from 'antd';
import {
  CloudServerOutlined,
  DatabaseOutlined,
  HddOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  FileSearchOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { formatDate } from '../../shared/format/format';
import { systemApi, type DriveStat, type TableStat, type TenantSummary } from './systemApi';

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
  const q = useQuery({
    queryKey: ['system', 'overview'],
    queryFn: () => systemApi.overview(200),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
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

  const { server, database, tenants, recentLogs } = q.data;
  const primaryDrive = server.drives.find(d => d.name.toUpperCase().startsWith('C')) ?? server.drives[0];

  const kpiCpuAccent = pickAccent(server.cpuPercent, 60, 85);
  const kpiRamAccent = pickAccent(server.systemRamPercent, 70, 90);
  const kpiDiskAccent = pickAccent(primaryDrive?.usedPercent ?? 0, 80, 95);

  return (
    <div>
      <PageHeader
        title="System Monitor"
        subtitle={`${server.machineName} · ${server.environment} · auto-refreshing every 5 s`}
      />

      {/* -- KPI strip -------------------------------------------------------- */}
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
