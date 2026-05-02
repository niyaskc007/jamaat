import { useMemo, useState } from 'react';
import {
  Card, Table, Typography, Empty, Input, Select, DatePicker, Row, Col, Space, Button, Tooltip,
  Grid,
} from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, GlobalOutlined, ClockCircleOutlined, ReloadOutlined,
  SearchOutlined, ExportOutlined, DesktopOutlined, MobileOutlined, AppleOutlined, AndroidOutlined,
  CodeOutlined, ChromeOutlined, EnvironmentOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ResponsiveContainer, BarChart, Bar, Tooltip as RTooltip, XAxis, Cell } from 'recharts';
import { CountryFlag } from './CountryFlag';

dayjs.extend(relativeTime);

export type LoginAttemptVm = {
  id: number;
  userId: string | null;
  identifier: string;
  attemptedAtUtc: string;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  geoCountry: string | null;
  geoCity: string | null;
};

type Props = {
  rows: LoginAttemptVm[];
  loading?: boolean;
  /// "tenant" = admin global view (shows identifier column + export)
  /// "user"   = admin per-user view (no identifier column)
  /// "self"   = member's own view (no identifier, no export, gentler messaging)
  scope: 'tenant' | 'user' | 'self';
  onRefresh?: () => void;
};

/// Unified login-history view used by:
///   - Admin tenant-wide tab (UsersPage > Login history)
///   - Admin per-user drawer tab
///   - Member's own portal page
///
/// All visual tokens (colours, spacings, radii, shadows) come from `app/tokens.css`; reusable
/// patterns (KPI tile, status row, identifier avatar, mobile-card-with-edge) live in
/// `app/portal.css`. Editing those two files re-themes this view automatically.
export function LoginHistoryView({ rows, loading, scope, onRefresh }: Props) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  // --- filters ---
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<'all' | 'success' | 'failed'>('all');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (outcome === 'success' && !r.success) return false;
      if (outcome === 'failed' && r.success) return false;
      if (range) {
        const t = dayjs(r.attemptedAtUtc);
        if (t.isBefore(range[0].startOf('day')) || t.isAfter(range[1].endOf('day'))) return false;
      }
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const haystack = [r.identifier, r.ipAddress, r.geoCountry, r.geoCity, r.userAgent]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
  }, [rows, outcome, range, search]);

  const kpi = useMemo(() => {
    const total = filtered.length;
    const success = filtered.filter((r) => r.success).length;
    const failed = total - success;
    const today = filtered.filter((r) => dayjs(r.attemptedAtUtc).isAfter(dayjs().startOf('day'))).length;
    const uniqueIps = new Set(filtered.map((r) => r.ipAddress).filter(Boolean)).size;
    return { total, success, failed, today, uniqueIps, successRate: total ? Math.round((success / total) * 100) : 0 };
  }, [filtered]);

  const spark = useMemo(() => {
    const buckets: { label: string; success: number; failed: number; total: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day');
      const dayRows = rows.filter((r) => dayjs(r.attemptedAtUtc).isSame(d, 'day'));
      const success = dayRows.filter((r) => r.success).length;
      const failed = dayRows.length - success;
      buckets.push({ label: d.format('DD MMM'), success, failed, total: dayRows.length });
    }
    return buckets;
  }, [rows]);

  const exportCsv = () => {
    const header = ['Date', 'Identifier', 'Success', 'Reason', 'IP', 'Country', 'City', 'User-Agent'];
    const lines = [header.join(',')];
    for (const r of filtered) {
      lines.push([
        r.attemptedAtUtc, csvEscape(r.identifier), r.success ? 'true' : 'false',
        csvEscape(r.failureReason ?? ''), csvEscape(r.ipAddress ?? ''),
        csvEscape(r.geoCountry ?? ''), csvEscape(r.geoCity ?? ''), csvEscape(r.userAgent ?? ''),
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `login-history-${dayjs().format('YYYYMMDD-HHmm')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="jm-login-history jm-stack">
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Kpi icon={<ClockCircleOutlined />} label="Attempts" value={kpi.total}
            tone="neutral" sub={kpi.today > 0 ? `${kpi.today} today` : 'No activity today'} />
        </Col>
        <Col xs={12} md={6}>
          <Kpi icon={<CheckCircleFilled />} label="Success rate" value={`${kpi.successRate}%`}
            tone="success" sub={`${kpi.success.toLocaleString()} successful`} />
        </Col>
        <Col xs={12} md={6}>
          <Kpi icon={<CloseCircleFilled />} label="Failed" value={kpi.failed}
            tone={kpi.failed > 0 ? 'danger' : 'neutral'}
            sub={kpi.failed === 0 ? 'All clean' : `${Math.round((kpi.failed / Math.max(1, kpi.total)) * 100)}% of attempts`} />
        </Col>
        <Col xs={12} md={6}>
          <Kpi icon={<GlobalOutlined />} label="Unique IPs" value={kpi.uniqueIps}
            tone="info" sub={kpi.uniqueIps > 5 ? 'Diverse access' : 'Limited spread'} />
        </Col>
      </Row>

      {rows.length > 0 && (
        <Card size="small" className="jm-card jm-spark-card" styles={{ body: { padding: '8px 12px' } }}>
          <div className="jm-spark-header">
            <Typography.Text type="secondary" className="jm-spark-title">Last 14 days</Typography.Text>
            <Typography.Text type="secondary" className="jm-spark-legend">
              <span className="jm-dot jm-dot-success" /> success &nbsp;
              <span className="jm-dot jm-dot-danger" /> failed
            </Typography.Text>
          </div>
          <ResponsiveContainer width="100%" height={56}>
            <BarChart data={spark} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" hide />
              <RTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }}
              />
              <Bar dataKey="success" stackId="a" fill="var(--jm-success-fg-strong)" radius={[2, 2, 0, 0]}>
                {spark.map((_, i) => <Cell key={`s-${i}`} />)}
              </Bar>
              <Bar dataKey="failed" stackId="a" fill="var(--jm-danger-fg-strong)" radius={[2, 2, 0, 0]}>
                {spark.map((_, i) => <Cell key={`f-${i}`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card size="small" className="jm-card jm-filter-bar" styles={{ body: { padding: 12 } }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={9}>
            <Input
              placeholder={scope === 'self' ? 'Search by IP, country, device' : 'Search by identifier, IP, country, device'}
              prefix={<SearchOutlined className="jm-input-prefix-icon" />}
              allowClear value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select
              value={outcome} onChange={(v) => setOutcome(v)} className="jm-full-width"
              options={[
                { value: 'all', label: 'All outcomes' },
                { value: 'success', label: 'Success only' },
                { value: 'failed', label: 'Failed only' },
              ]}
            />
          </Col>
          <Col xs={24} md={7}>
            <DatePicker.RangePicker
              value={range as [Dayjs, Dayjs] | null}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              className="jm-full-width"
              presets={[
                { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                { label: 'Last 7 days', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] },
                { label: 'Last 30 days', value: [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] },
              ]}
            />
          </Col>
          <Col xs={12} md={3}>
            <Space className="jm-toolbar-end">
              {onRefresh && <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={onRefresh} /></Tooltip>}
              {scope !== 'self' && (
                <Tooltip title="Export filtered rows as CSV">
                  <Button icon={<ExportOutlined />} onClick={exportCsv} />
                </Tooltip>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {isMobile
        ? <MobileList rows={filtered} loading={loading} scope={scope} />
        : <DesktopTable rows={filtered} loading={loading} scope={scope} />}
    </div>
  );
}

// ---- Desktop table -----------------------------------------------------

function DesktopTable({ rows, loading, scope }: { rows: LoginAttemptVm[]; loading?: boolean; scope: Props['scope'] }) {
  return (
    <Card className="jm-card" styles={{ body: { padding: 0 } }}>
      <Table<LoginAttemptVm>
        rowKey="id" loading={loading} dataSource={rows}
        size="middle"
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100] }}
        rowClassName={(r) => `jm-login-row ${r.success ? 'jm-login-row-ok' : 'jm-login-row-bad'}`}
        locale={{ emptyText: <EmptyState scope={scope} /> }}
        columns={[
          {
            title: 'When', dataIndex: 'attemptedAtUtc', width: 200,
            render: (v: string) => (
              <div>
                <div className="jm-cell-when-primary">{dayjs(v).format('DD MMM YYYY HH:mm')}</div>
                <div className="jm-cell-when-rel">{dayjs(v).fromNow()}</div>
              </div>
            ),
          },
          ...(scope === 'tenant' ? [{
            title: 'Identifier', dataIndex: 'identifier' as const,
            render: (v: string) => <IdentifierBadge value={v} />,
          }] : []),
          {
            title: 'Outcome', dataIndex: 'success', width: 160,
            render: (s: boolean, row: LoginAttemptVm) => <OutcomeTag success={s} reason={row.failureReason} />,
          },
          {
            title: 'Where from', width: 240,
            render: (_, row: LoginAttemptVm) => <LocationCell row={row} />,
          },
          {
            title: 'Device', dataIndex: 'userAgent',
            render: (ua: string | null) => <DeviceCell ua={ua} />,
          },
        ]}
      />
    </Card>
  );
}

// ---- Mobile card stream ------------------------------------------------

function MobileList({ rows, loading, scope }: { rows: LoginAttemptVm[]; loading?: boolean; scope: Props['scope'] }) {
  if (loading) return <Card loading className="jm-card" />;
  if (rows.length === 0) return <Card className="jm-card"><EmptyState scope={scope} /></Card>;
  return (
    <div className="jm-mob-list">
      {rows.map((r) => (
        <Card
          key={r.id} size="small"
          className={`jm-card jm-mob-row ${r.success ? 'jm-mob-row-ok' : 'jm-mob-row-bad'}`}
          styles={{ body: { padding: 12 } }}
        >
          <div className="jm-mob-row-head">
            <div>
              <div className="jm-cell-when-primary">{dayjs(r.attemptedAtUtc).format('DD MMM HH:mm')}</div>
              <div className="jm-cell-when-rel">{dayjs(r.attemptedAtUtc).fromNow()}</div>
            </div>
            <OutcomeTag success={r.success} reason={r.failureReason} />
          </div>
          {scope === 'tenant' && <div className="jm-mob-row-identifier"><IdentifierBadge value={r.identifier} /></div>}
          <div className="jm-mob-row-meta">
            <LocationCell row={r} compact />
            <DeviceCell ua={r.userAgent} compact />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- Cells -------------------------------------------------------------

function OutcomeTag({ success, reason }: { success: boolean; reason: string | null }) {
  return success ? (
    <span className="jm-outcome-pill jm-outcome-pill-success">
      <CheckCircleFilled />
      <span>Success</span>
    </span>
  ) : (
    <span className="jm-outcome-pill jm-outcome-pill-danger">
      <CloseCircleFilled />
      <span>{prettyReason(reason)}</span>
    </span>
  );
}

function IdentifierBadge({ value }: { value: string }) {
  const initial = (value || '?').slice(0, 1).toUpperCase();
  const isIts = /^\d{6,8}$/.test(value);
  return (
    <Space size={8}>
      <span className={`jm-id-avatar ${isIts ? 'jm-id-avatar-its' : 'jm-id-avatar-email'}`}>{initial}</span>
      <span className={`jm-id-text ${isIts ? 'jm-tnum' : ''}`}>{value}</span>
    </Space>
  );
}

function LocationCell({ row, compact = false }: { row: LoginAttemptVm; compact?: boolean }) {
  const ip = row.ipAddress ?? '-';
  const labels = locationLabel(row);
  return (
    <div>
      <div className={`jm-loc-line ${compact ? 'jm-loc-line-compact' : ''}`}>
        {row.geoCountry
          ? <CountryFlag country={row.geoCountry} size={compact ? 12 : 14} />
          : <EnvironmentOutlined className="jm-input-prefix-icon" />}
        <span className="jm-loc-name">{labels.primary}</span>
      </div>
      <div className="jm-tnum jm-loc-ip">{ip}</div>
    </div>
  );
}

function DeviceCell({ ua, compact = false }: { ua: string | null; compact?: boolean }) {
  const { icon, label } = describeUa(ua);
  return (
    <Space size={6}>
      <span className="jm-device-icon">{icon}</span>
      <span className={`jm-device-label ${compact ? 'jm-device-label-compact' : ''}`}>{label}</span>
    </Space>
  );
}

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: number | string; sub: string;
  tone: 'success' | 'danger' | 'info' | 'warning' | 'neutral';
}) {
  return (
    <Card size="small" className="jm-card jm-kpi" styles={{ body: { padding: 14 } }}>
      <div className="jm-kpi-row">
        <span className={`jm-kpi-icon jm-kpi-icon-${tone}`}>{icon}</span>
        <div className="jm-kpi-body">
          <div className="jm-kpi-label">{label}</div>
          <div className="jm-tnum jm-kpi-value">{value}</div>
          <div className="jm-kpi-sub">{sub}</div>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ scope }: { scope: Props['scope'] }) {
  const msg = scope === 'self'
    ? 'No login attempts recorded yet. Once you sign in, every successful and failed attempt will show up here with the IP and device.'
    : 'No login attempts in the selected window.';
  return <Empty description={msg} className="jm-empty-padded" />;
}

// ---- helpers -----------------------------------------------------------

function prettyReason(r: string | null): string {
  if (!r) return 'Failed';
  const map: Record<string, string> = {
    bad_password: 'Bad password',
    user_not_found: 'Unknown user',
    user_inactive: 'Account inactive',
    login_not_allowed: 'Login disabled',
    temp_password_expired: 'Temp password expired',
    password_change_required: 'Password change required',
  };
  return map[r] ?? r.replace(/_/g, ' ');
}

function locationLabel(row: LoginAttemptVm): { primary: string; isLocal: boolean } {
  const geo = [row.geoCity, row.geoCountry].filter(Boolean).join(', ');
  if (geo) return { primary: geo, isLocal: false };
  const ip = row.ipAddress ?? '';
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) return { primary: 'Localhost (dev)', isLocal: true };
  if (ip.startsWith('10.') || ip.startsWith('192.168.')
      || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
      || ip.toLowerCase().startsWith('fe80:') || ip.toLowerCase().startsWith('fc')) {
    return { primary: 'Private network', isLocal: true };
  }
  return { primary: ip ? 'Unknown location' : '—', isLocal: false };
}

function describeUa(ua: string | null): { icon: React.ReactNode; label: string } {
  if (!ua) return { icon: <DesktopOutlined />, label: 'Unknown device' };
  if (/iPhone|iPad/.test(ua)) return { icon: <AppleOutlined />, label: 'iPhone / iPad' };
  if (/Android/.test(ua) && /Mobile/.test(ua)) return { icon: <AndroidOutlined />, label: 'Android phone' };
  if (/Edg\//.test(ua)) return { icon: <ChromeOutlined />, label: 'Microsoft Edge' };
  if (/Chrome\//.test(ua)) return { icon: <ChromeOutlined />, label: 'Chrome' };
  if (/Firefox\//.test(ua)) return { icon: <ChromeOutlined />, label: 'Firefox' };
  if (/Safari\//.test(ua)) return { icon: <AppleOutlined />, label: 'Safari' };
  if (/curl/.test(ua) || /python|wget|axios/i.test(ua)) return { icon: <CodeOutlined />, label: 'Script / curl' };
  return { icon: <MobileOutlined />, label: ua.slice(0, 40) };
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
