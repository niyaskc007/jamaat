import { useMemo, useState } from 'react';
import {
  Card, Input, Select, Button, Table, Tag, Space, DatePicker, Switch, App as AntdApp,
} from 'antd';
import type { TableProps, TableColumnsType } from 'antd';
import {
  SearchOutlined, ReloadOutlined, EyeOutlined, CheckOutlined, BugOutlined, DesktopOutlined, ApiOutlined,
  MobileOutlined, ClockCircleOutlined, LinkOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { UserHoverCard } from '../../../shared/ui/UserHoverCard';
import { extractProblem } from '../../../shared/api/client';
import {
  errorLogsApi,
  ErrorSourceLabel, ErrorSeverityLabel, ErrorStatusLabel,
  type ErrorLog, type ErrorLogListQuery, type ErrorSource, type ErrorSeverity, type ErrorStatus,
} from './errorLogsApi';

const { RangePicker } = DatePicker;

export function ErrorLogsPage() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const [query, setQuery] = useState<ErrorLogListQuery>({ page: 1, pageSize: 25, sortBy: 'occurredAtUtc', sortDir: 'Desc' });
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([dayjs().subtract(7, 'day'), dayjs()]);

  const statsQuery = useQuery({ queryKey: ['errorLogs', 'stats'], queryFn: errorLogsApi.stats, refetchInterval: 30_000 });

  const effectiveQuery: ErrorLogListQuery = {
    ...query,
    fromUtc: range?.[0]?.startOf('day').toISOString(),
    toUtc: range?.[1]?.endOf('day').toISOString(),
  };

  const { data, isLoading, isFetching, refetch, isError } = useQuery({
    queryKey: ['errorLogs', 'list', effectiveQuery],
    queryFn: () => errorLogsApi.list(effectiveQuery),
    placeholderData: keepPreviousData,
  });

  const reviewMut = useMutation({
    mutationFn: (id: number) => errorLogsApi.review(id),
    onSuccess: () => { message.success('Marked as reviewed'); invalidateAll(); },
    onError: (err) => message.error(extractProblem(err).detail ?? 'Failed'),
  });
  const resolveMut = useMutation({
    mutationFn: (id: number) => errorLogsApi.resolve(id),
    onSuccess: () => { message.success('Resolved'); invalidateAll(); },
    onError: (err) => message.error(extractProblem(err).detail ?? 'Failed'),
  });
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['errorLogs'] });
  };

  const columns: TableColumnsType<ErrorLog> = useMemo(() => [
    {
      title: 'Time', dataIndex: 'occurredAtUtc', key: 'occurredAtUtc', width: 180, sorter: true,
      render: (v: string) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="jm-tnum" style={{ fontSize: 13 }}>{dayjs(v).format('DD MMM YYYY, HH:mm:ss')}</span>
          <span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{dayjs(v).fromNow()}</span>
        </div>
      ),
    },
    { title: 'Source', dataIndex: 'source', key: 'source', width: 110, render: (s: ErrorSource) => <SourceTag source={s} /> },
    { title: 'Severity', dataIndex: 'severity', key: 'severity', width: 110, render: (s: ErrorSeverity) => <SeverityTag severity={s} /> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (s: ErrorStatus) => <StatusTag status={s} /> },
    {
      title: 'Endpoint', dataIndex: 'endpoint', key: 'endpoint', width: 260,
      render: (v?: string | null, row?: ErrorLog) => v
        ? <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>
            <Tag style={{ marginInlineEnd: 6 }}>{row?.httpMethod ?? 'GET'}</Tag>{v}
          </span>
        : <span style={{ color: 'var(--jm-gray-400)' }}>-</span>,
    },
    {
      title: 'Message', dataIndex: 'message', key: 'message',
      render: (v: string) => <span style={{ color: 'var(--jm-gray-800)' }}>{v}</span>,
    },
  ], []);

  const expandedRowRender = (row: ErrorLog) => (
    <div style={{ padding: 16, background: 'var(--jm-surface-muted)', borderRadius: 8 }}>
      {/* Error message block */}
      <Card size="small" style={{ marginBlockEnd: 12 }} styles={{ body: { padding: 12 } }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--jm-gray-500)', marginBlockEnd: 4 }}>Error Message</div>
        <div style={{ fontSize: 14, color: 'var(--jm-gray-900)' }}>{row.message}</div>
      </Card>

      <Card size="small" style={{ marginBlockEnd: 12 }} styles={{ body: { padding: 12 } }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--jm-gray-500)', marginBlockEnd: 4 }}>Endpoint</div>
        <div className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13 }}>
          {row.httpMethod && <Tag>{row.httpMethod}</Tag>} {row.endpoint ?? '-'}
        </div>
        {row.correlationId && (
          <div style={{ marginBlockStart: 6, fontSize: 12, color: 'var(--jm-gray-500)' }}>
            Correlation ID: <span className="jm-tnum" style={{ color: 'var(--jm-primary-500)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{row.correlationId}</span>
          </div>
        )}
      </Card>

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBlockEnd: 12 }}>
        <Meta label="Exception Type" value={row.exceptionType} mono />
        <Meta label="HTTP Status" value={row.httpStatus?.toString()} />
        <Meta label="User" value={row.userName} />
        <Meta label="User Role" value={row.userRole} />
      </div>
      <div style={{ marginBlockEnd: 12 }}>
        <Meta label="User Agent" value={row.userAgent} small />
      </div>

      {/* Status Management */}
      <Card size="small" style={{ marginBlockEnd: 12 }} styles={{ body: { padding: 12 } }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--jm-gray-500)', marginBlockEnd: 8 }}>Status Management</div>
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => reviewMut.mutate(row.id)}
            disabled={row.status !== 1 || reviewMut.isPending}
            loading={reviewMut.isPending && reviewMut.variables === row.id}
          >Mark Reviewed</Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => resolveMut.mutate(row.id)}
            disabled={row.status === 3 || resolveMut.isPending}
            loading={resolveMut.isPending && resolveMut.variables === row.id}
          >Resolve</Button>
          {row.reviewedAtUtc && (
            <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
              Reviewed {dayjs(row.reviewedAtUtc).format('DD MMM HH:mm')}
              {row.reviewedByUserName && (
                <> by <UserHoverCard userId={row.reviewedByUserId ?? null} fallback={row.reviewedByUserName} /></>
              )}
            </span>
          )}
          {row.resolvedAtUtc && (
            <span style={{ fontSize: 12, color: 'var(--jm-success)' }}>
              Resolved {dayjs(row.resolvedAtUtc).format('DD MMM HH:mm')}
              {row.resolvedByUserName && (
                <> by <UserHoverCard userId={row.resolvedByUserId ?? null} fallback={row.resolvedByUserName} /></>
              )}
            </span>
          )}
        </Space>
      </Card>

      {/* Stack trace */}
      {row.stackTrace && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--jm-gray-500)', marginBlockEnd: 6 }}>Stack Trace</div>
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: '#0E1B26',
              color: '#CBD3DD',
              borderRadius: 8,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12.5,
              lineHeight: 1.6,
              overflow: 'auto',
              maxBlockSize: 320,
            }}
          >{row.stackTrace}</pre>
        </div>
      )}
    </div>
  );

  const onTableChange: TableProps<ErrorLog>['onChange'] = (pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    setQuery((q) => ({
      ...q,
      page: pagination.current ?? 1,
      pageSize: pagination.pageSize ?? 25,
      sortBy: (s?.field as string) ?? q.sortBy,
      sortDir: s?.order === 'ascend' ? 'Asc' : s?.order === 'descend' ? 'Desc' : q.sortDir,
    }));
  };

  return (
    <div>
      <PageHeader
        title="Error logs"
        subtitle="Platform-wide error tracking and diagnostics."
        actions={<Button icon={<ReloadOutlined />} onClick={() => { void refetch(); void statsQuery.refetch(); }} loading={isFetching && !isLoading}>Refresh</Button>}
      />

      {/* STATS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBlockEnd: 16,
      }}>
        <StatCard label="Today" value={statsQuery.data?.today} icon={<ClockCircleOutlined />} accent="#2563EB" />
        <StatCard label="Last 7 days" value={statsQuery.data?.last7Days} icon={<BugOutlined />} accent="#DC2626" />
        <StatCard label="Total" value={statsQuery.data?.total} icon={<BugOutlined />} accent="#DC2626" variant="danger" />
        <StatCard label="Open" value={statsQuery.data?.open} icon={<EyeOutlined />} accent="#D97706" variant="warn" />
        <StatCard label="Reviewed" value={statsQuery.data?.reviewed} icon={<EyeOutlined />} accent="#2563EB" />
        <StatCard label="Resolved" value={statsQuery.data?.resolved} icon={<CheckOutlined />} accent="#0A8754" variant="success" />
      </div>

      {/* FILTER BAR */}
      <Card style={{ marginBlockEnd: 16, border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 12 } }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <RangePicker
            value={range as [Dayjs, Dayjs] | null}
            onChange={(v) => { setRange(v as [Dayjs, Dayjs] | null); setQuery((q) => ({ ...q, page: 1 })); }}
            presets={[
              { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
              { label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: 'Last 30 days', value: [dayjs().subtract(30, 'day'), dayjs()] },
            ]}
            style={{ inlineSize: 260 }}
          />
          <Select
            placeholder="All sources" allowClear
            style={{ inlineSize: 140 }}
            value={query.source}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, source: v }))}
            options={Object.entries(ErrorSourceLabel).map(([k, l]) => ({ value: Number(k) as ErrorSource, label: l }))}
          />
          <Select
            placeholder="All severities" allowClear
            style={{ inlineSize: 140 }}
            value={query.severity}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, severity: v }))}
            options={Object.entries(ErrorSeverityLabel).map(([k, l]) => ({ value: Number(k) as ErrorSeverity, label: l }))}
          />
          <Select
            placeholder="All statuses" allowClear
            style={{ inlineSize: 140 }}
            value={query.status}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, status: v }))}
            options={Object.entries(ErrorStatusLabel).map(([k, l]) => ({ value: Number(k) as ErrorStatus, label: l }))}
          />
          <Input
            placeholder="Search by message, endpoint, or correlation ID"
            prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
            onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))}
            allowClear
            style={{ flex: 1, minInlineSize: 280 }}
          />
          <Space>
            <span style={{ fontSize: 13, color: 'var(--jm-gray-600)' }}>Group similar</span>
            <Switch checked={query.groupSimilar} onChange={(v) => setQuery((q) => ({ ...q, page: 1, groupSimilar: v }))} />
          </Space>
        </div>
      </Card>

      {/* TABLE */}
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<ErrorLog>
          rowKey="id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items ?? []}
          onChange={onTableChange}
          expandable={{ expandedRowRender, rowExpandable: () => true }}
          pagination={{
            current: query.page, pageSize: query.pageSize, total: data?.total ?? 0,
            showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200],
            showTotal: (total, [from, to]) => `${from}–${to} of ${total}`,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {isError && (
        <Card size="small" style={{ marginBlockStart: 16, borderColor: 'var(--jm-danger)' }}>
          <span style={{ color: 'var(--jm-danger)' }}>Failed to load error logs.</span>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, accent, variant }: { label: string; value: number | undefined; icon: React.ReactNode; accent: string; variant?: 'danger' | 'warn' | 'success' }) {
  const bgMap = {
    danger: 'color-mix(in srgb, #DC2626 6%, transparent)',
    warn: 'color-mix(in srgb, #D97706 6%, transparent)',
    success: 'color-mix(in srgb, #0A8754 6%, transparent)',
  };
  return (
    <Card
      size="small"
      styles={{ body: { padding: 16 } }}
      style={{
        border: variant ? `1px solid color-mix(in srgb, ${accent} 25%, var(--jm-border))` : '1px solid var(--jm-border)',
        background: variant ? bgMap[variant] : '#FFFFFF',
        boxShadow: 'var(--jm-shadow-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: accent, fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--jm-gray-500)' }}>{label}</span>
      </div>
      <div className="jm-tnum" style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif", fontSize: 28, fontWeight: 600, color: value === undefined ? 'var(--jm-gray-400)' : 'var(--jm-gray-900)', marginBlockStart: 4 }}>
        {value === undefined ? '-' : value.toLocaleString()}
      </div>
    </Card>
  );
}

function SourceTag({ source }: { source: ErrorSource }) {
  const cfg: Record<ErrorSource, { icon: React.ReactNode; label: string }> = {
    1: { icon: <ApiOutlined />, label: 'API' },
    2: { icon: <DesktopOutlined />, label: 'Web' },
    3: { icon: <MobileOutlined />, label: 'Mobile' },
    4: { icon: <ClockCircleOutlined />, label: 'Job' },
    5: { icon: <LinkOutlined />, label: 'Integration' },
  };
  const c = cfg[source];
  return (
    <Tag
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, background: 'var(--jm-primary-50)', color: 'var(--jm-primary-700)', border: 'none' }}
    >
      {c.icon} {c.label}
    </Tag>
  );
}

function SeverityTag({ severity }: { severity: ErrorSeverity }) {
  const cfg: Record<ErrorSeverity, { bg: string; color: string }> = {
    1: { bg: '#E0F2FE', color: '#075985' },
    2: { bg: '#FEF3C7', color: '#92400E' },
    3: { bg: '#FEE2E2', color: '#991B1B' },
    4: { bg: '#1E293B', color: '#FECACA' },
  };
  const c = cfg[severity];
  return <Tag style={{ margin: 0, background: c.bg, color: c.color, border: 'none', fontWeight: 500 }}>{ErrorSeverityLabel[severity]}</Tag>;
}

function StatusTag({ status }: { status: ErrorStatus }) {
  const cfg: Record<ErrorStatus, { bg: string; color: string }> = {
    1: { bg: '#FEF3C7', color: '#92400E' },
    2: { bg: '#DBEAFE', color: '#1E40AF' },
    3: { bg: '#D1FAE5', color: '#065F46' },
    4: { bg: '#E5E9EF', color: '#475569' },
  };
  const c = cfg[status];
  return <Tag style={{ margin: 0, background: c.bg, color: c.color, border: 'none', fontWeight: 500 }}>{ErrorStatusLabel[status]}</Tag>;
}

function Meta({ label, value, mono, small }: { label: string; value?: string | null; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--jm-gray-500)', marginBlockEnd: 4 }}>{label}</div>
      <div
        style={{
          fontSize: small ? 12 : 13,
          color: value ? 'var(--jm-gray-900)' : 'var(--jm-gray-400)',
          fontFamily: mono ? "'JetBrains Mono', ui-monospace, monospace" : undefined,
          wordBreak: 'break-all',
        }}
      >{value ?? '-'}</div>
    </div>
  );
}
