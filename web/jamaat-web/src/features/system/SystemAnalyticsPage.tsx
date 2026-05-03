import { useMemo, useState } from 'react';
import { Card, Col, Row, Table, Tag, Spin, Alert, Empty, DatePicker, Tooltip } from 'antd';
import {
  PieChartOutlined,
  EyeOutlined,
  ApiOutlined,
  TeamOutlined,
  FieldTimeOutlined,
  HistoryOutlined,
  HeatMapOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend,
} from 'recharts';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { formatDate } from '../../shared/format/format';
import { analyticsApi, type TopPage, type TopAction, type TopUser, type HourlyActivity } from './analyticsApi';

const { RangePicker } = DatePicker;

const ACCENT = {
  positive: '#0E5C40',
  cyan: '#0E7490',
  financial: '#7C3AED',
  warn: '#D97706',
  caution: '#D97706',
  danger: '#DC2626',
  neutral: '#475569',
} as const;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SystemAnalyticsPage() {
  // Default range = last 30 days inclusive of today.
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().subtract(29, 'day'), dayjs()]);

  const fromStr = range[0].format('YYYY-MM-DD');
  const toStr = range[1].format('YYYY-MM-DD');

  const q = useQuery({
    queryKey: ['system', 'analytics', fromStr, toStr],
    queryFn: () => analyticsApi.overview({ from: fromStr, to: toStr }),
    refetchInterval: 30_000,
  });

  // Gentle animation for the heatmap so the eye finds the hot cells.
  const heatmapMax = useMemo(() => {
    if (!q.data) return 0;
    return q.data.heatmap.reduce((m, h) => Math.max(m, h.eventCount), 0);
  }, [q.data]);

  if (q.isLoading || !q.data) {
    return (
      <div>
        <PageHeader title="Usage Analytics" subtitle="Page views, actions, DAU, engagement heatmap" />
        <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>
      </div>
    );
  }
  if (q.error) {
    return (
      <div>
        <PageHeader title="Usage Analytics" />
        <Alert type="error" showIcon message="Failed to load analytics" description={(q.error as Error).message} />
      </div>
    );
  }

  const { summary, topPages, topActions, dauTrend, heatmap, topUsers, queue } = q.data;

  const dauData = dauTrend.map(d => ({
    label: d.date.slice(5), // MM-DD
    DAU: d.dailyActiveUsers,
    Pages: d.pageViews,
    Actions: d.actionCalls,
  }));

  return (
    <div>
      <PageHeader
        title="Usage Analytics"
        subtitle={`${summary.from} → ${summary.to} · auto-refreshing every 30 s`}
        actions={
          <RangePicker
            value={range}
            onChange={(v) => { if (v && v[0] && v[1]) setRange([v[0], v[1]]); }}
            allowClear={false}
            presets={[
              { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: 'Last 30 days', value: [dayjs().subtract(29, 'day'), dayjs()] },
              { label: 'Last 90 days', value: [dayjs().subtract(89, 'day'), dayjs()] },
            ]}
          />
        }
      />

      {/* -- Summary KPIs ----------------------------------------------------- */}
      <Row gutter={[16, 16]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}>
          <KpiCard icon={<EyeOutlined />} label="Page views" value={summary.totalPageViews} format="number"
            caption={`${dauTrend.length} days in range`} accent={ACCENT.cyan} />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard icon={<ApiOutlined />} label="API actions" value={summary.totalActionCalls} format="number"
            caption="successful authenticated calls" accent={ACCENT.financial} />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard icon={<TeamOutlined />} label="Unique users" value={summary.uniqueUsers} format="number"
            caption={`${summary.uniqueSessions} session-days`} accent={ACCENT.positive} />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard icon={<FieldTimeOutlined />} label="Events / user" value={summary.avgEventsPerUser} format="number"
            caption="engagement intensity" accent={ACCENT.warn} />
        </Col>
      </Row>

      {/* -- DAU trend -------------------------------------------------------- */}
      <Card title={<span><HistoryOutlined /> &nbsp; Daily activity trend</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={dauData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="auArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT.positive} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={ACCENT.positive} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pvArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT.cyan} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={ACCENT.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" />
              <YAxis yAxisId="dau" orientation="left" fontSize={11} stroke="#94a3b8" />
              <YAxis yAxisId="ev" orientation="right" fontSize={11} stroke="#94a3b8" />
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="ev" type="monotone" dataKey="Pages" stroke={ACCENT.cyan} strokeWidth={1.5} fill="url(#pvArea)" />
              <Area yAxisId="ev" type="monotone" dataKey="Actions" stroke={ACCENT.financial} strokeWidth={1.5} fill="none" />
              <Area yAxisId="dau" type="monotone" dataKey="DAU" stroke={ACCENT.positive} strokeWidth={2} fill="url(#auArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* -- Top pages + Top actions ----------------------------------------- */}
      <Row gutter={[16, 16]} style={{ marginBlockEnd: 16 }}>
        <Col xs={24} md={12}>
          <Card title={<span><EyeOutlined /> &nbsp; Top pages</span>} className="jm-card">
            <Table<TopPage>
              rowKey={r => r.path}
              dataSource={topPages}
              pagination={false}
              size="small"
              columns={[
                { title: 'Path', dataIndex: 'path', render: (v: string) => <Tooltip title={v}><span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 12 }}>{shorten(v, 36)}</span></Tooltip> },
                { title: 'Module', dataIndex: 'module', render: (v: string) => v ? <Tag>{v}</Tag> : '' },
                { title: 'Views', dataIndex: 'views', align: 'right', render: (v: number) => v.toLocaleString() },
                { title: 'Users', dataIndex: 'uniqueUsers', align: 'right', render: (v: number) => v.toLocaleString() },
              ]}
              locale={{ emptyText: <Empty description="No page views yet in this range" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<span><ApiOutlined /> &nbsp; Top API actions</span>} className="jm-card">
            <Table<TopAction>
              rowKey={r => `${r.action}-${r.httpMethod}`}
              dataSource={topActions}
              pagination={false}
              size="small"
              columns={[
                { title: 'Action', dataIndex: 'action', render: (v: string) => <Tooltip title={v}><span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 12 }}>{shorten(v, 28)}</span></Tooltip> },
                { title: 'Method', dataIndex: 'httpMethod', render: (v: string) => <Tag color={methodColor(v)}>{v}</Tag>, width: 80 },
                { title: 'Calls', dataIndex: 'calls', align: 'right', render: (v: number) => v.toLocaleString() },
                { title: 'Avg', dataIndex: 'avgDurationMs', align: 'right', render: (v: number) => `${v} ms` },
              ]}
              locale={{ emptyText: <Empty description="No API calls yet in this range" /> }}
            />
          </Card>
        </Col>
      </Row>

      {/* -- Heatmap (day-of-week × hour) ------------------------------------ */}
      <Card title={<span><HeatMapOutlined /> &nbsp; Activity heatmap (UTC)</span>} className="jm-card" style={{ marginBlockEnd: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <Heatmap data={heatmap} max={heatmapMax} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
          Each cell = total events (page views + API actions) for that weekday and hour. Darker = busier.
        </div>
      </Card>

      {/* -- Top users + queue stats ----------------------------------------- */}
      <Row gutter={[16, 16]} style={{ marginBlockEnd: 16 }}>
        <Col xs={24} md={16}>
          <Card title={<span><TrophyOutlined /> &nbsp; Top users by activity</span>} className="jm-card">
            <Table<TopUser>
              rowKey="userId"
              dataSource={topUsers}
              pagination={false}
              size="small"
              columns={[
                { title: 'User', dataIndex: 'userName' },
                { title: 'Page views', dataIndex: 'pageViews', align: 'right', render: (v: number) => v.toLocaleString() },
                { title: 'Actions', dataIndex: 'actionCalls', align: 'right', render: (v: number) => v.toLocaleString() },
                { title: 'Total', render: (_, r) => (r.pageViews + r.actionCalls).toLocaleString(), align: 'right' },
                { title: 'Last seen', dataIndex: 'lastSeenUtc', render: (v: string) => <Tooltip title={v}>{formatDate(v)}</Tooltip> },
              ]}
              locale={{ emptyText: <Empty description="No user activity yet in this range" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Telemetry queue" className="jm-card">
            <KvList rows={[
              ['Queue depth', queue.currentDepth.toLocaleString()],
              ['Total enqueued', queue.totalEnqueued.toLocaleString()],
              ['Total flushed', queue.totalFlushed.toLocaleString()],
              ['Total dropped', queue.totalDropped > 0
                ? <Tag color="red">{queue.totalDropped.toLocaleString()}</Tag>
                : <Tag color="green">0</Tag>],
            ]} />
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
              Drops indicate the bounded queue overflowed and the flush worker fell behind. If non-zero, raise the queue capacity or batch size.
            </div>
          </Card>
        </Col>
      </Row>

      {/* -- Bar chart: pages vs actions per day ------------------------------ */}
      <Card title="Pages vs API actions per day" className="jm-card">
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={dauData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" />
              <YAxis fontSize={11} stroke="#94a3b8" />
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Pages" fill={ACCENT.cyan} />
              <Bar dataKey="Actions" fill={ACCENT.financial} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function Heatmap({ data, max }: { data: HourlyActivity[]; max: number }) {
  // Re-shape into a 7x24 matrix.
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const cell of data) {
    if (cell.dayOfWeek >= 0 && cell.dayOfWeek < 7 && cell.hour >= 0 && cell.hour < 24) {
      grid[cell.dayOfWeek][cell.hour] = cell.eventCount;
    }
  }

  const cellSize = 20;
  const labelW = 36;
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
      <thead>
        <tr>
          <th style={{ width: labelW }} />
          {Array.from({ length: 24 }, (_, h) => (
            <th key={h} style={{ width: cellSize, textAlign: 'center', color: 'var(--jm-gray-500)', fontWeight: 400 }}>
              {h % 3 === 0 ? h.toString().padStart(2, '0') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.map((row, dow) => (
          <tr key={dow}>
            <td style={{ width: labelW, textAlign: 'right', paddingInlineEnd: 6, color: 'var(--jm-gray-500)' }}>{DAY_LABELS[dow]}</td>
            {row.map((count, h) => {
              const intensity = max <= 0 ? 0 : count / max;
              const bg = intensity === 0
                ? 'transparent'
                : `rgba(124, 58, 237, ${0.08 + intensity * 0.85})`;
              return (
                <td
                  key={h}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background: bg,
                    border: '1px solid #f1f5f9',
                    textAlign: 'center',
                    color: intensity > 0.55 ? '#fff' : 'var(--jm-gray-700)',
                  }}
                >
                  <Tooltip title={`${DAY_LABELS[dow]} ${h.toString().padStart(2, '0')}:00 — ${count.toLocaleString()} events`}>
                    <span style={{ display: 'inline-block', width: '100%', height: '100%' }}>
                      {count > 0 && count >= max * 0.5 ? count : ''}
                    </span>
                  </Tooltip>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KvList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <table className="jm-tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: '6px 0', color: 'var(--jm-gray-500)', width: 140 }}>{k}</td>
            <td style={{ padding: '6px 0', color: 'var(--jm-gray-900)' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function shorten(s: string | null | undefined, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function methodColor(m: string): string {
  switch (m) {
    case 'GET': return 'green';
    case 'POST': return 'blue';
    case 'PUT':
    case 'PATCH': return 'orange';
    case 'DELETE': return 'red';
    default: return 'default';
  }
}
