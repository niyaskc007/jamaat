import { useState } from 'react';
import { Card, Input, Select, Table, Tag, DatePicker, Button, Typography, Segmented, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, SafetyOutlined, DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/format/format';
import { downloadCsv, fetchAllPages, toCsv } from '../../shared/export/csv';

const { RangePicker } = DatePicker;

type AuditLog = {
  id: number; tenantId?: string | null; userId?: string | null; userName: string;
  correlationId: string; action: string; entityName: string; entityId: string;
  screen?: string | null; beforeJson?: string | null; afterJson?: string | null;
  ipAddress?: string | null; userAgent?: string | null; atUtc: string;
};

type AuditQuery = {
  page: number; pageSize: number; search?: string; action?: string; entityName?: string;
  fromUtc?: string; toUtc?: string;
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string | undefined>();
  const [entityName, setEntityName] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const query: AuditQuery = {
    page, pageSize, search: search || undefined,
    action, entityName,
    fromUtc: range?.[0]?.startOf('day').toISOString(),
    toUtc: range?.[1]?.endOf('day').toISOString(),
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['audit', query],
    queryFn: async () => (await api.get<{ items: AuditLog[]; total: number }>('/api/v1/audit-logs', { params: query })).data,
    placeholderData: keepPreviousData,
  });

  const onExport = async () => {
    const listFn = async (q: AuditQuery) =>
      (await api.get<{ items: AuditLog[]; total: number }>('/api/v1/audit-logs', { params: q })).data;
    const { items, truncated } = await fetchAllPages<AuditLog, AuditQuery>(listFn, query);
    const csv = toCsv(items, [
      { header: 'Time (UTC)', value: (r) => r.atUtc },
      { header: 'User', value: (r) => r.userName },
      { header: 'Action', value: (r) => r.action },
      { header: 'Entity', value: (r) => r.entityName },
      { header: 'Entity Id', value: (r) => r.entityId },
      { header: 'Correlation', value: (r) => r.correlationId },
      { header: 'Screen', value: (r) => r.screen ?? '' },
      { header: 'IP', value: (r) => r.ipAddress ?? '' },
    ]);
    downloadCsv(`audit_${new Date().toISOString().slice(0, 10)}${truncated ? '_truncated' : ''}.csv`, csv);
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only record of every mutation with before/after snapshots."
        actions={<Button icon={<DownloadOutlined />} onClick={onExport}>Export CSV</Button>}
      />
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ display: 'flex', gap: 8, padding: 12, borderBlockEnd: '1px solid var(--jm-border)', flexWrap: 'wrap' }}>
          <RangePicker value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} style={{ inlineSize: 260 }} />
          <Select allowClear placeholder="Action" value={action} onChange={setAction} style={{ inlineSize: 140 }}
            options={['Create', 'Update', 'Delete'].map((x) => ({ value: x, label: x }))} />
          <Select allowClear placeholder="Entity" value={entityName} onChange={setEntityName} style={{ inlineSize: 180 }}
            options={['Receipt', 'Voucher', 'Member', 'FundType', 'Account', 'BankAccount', 'NumberingSeries', 'ExpenseType', 'FinancialPeriod', 'ApplicationUser'].map((x) => ({ value: x, label: x }))} />
          <Input placeholder="Search user, entity id, correlation" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} onBlur={() => setPage(1)} style={{ flex: 1, minInlineSize: 220 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>
        <Table<AuditLog>
          rowKey="id" size="middle" loading={isLoading} dataSource={data?.items ?? []}
          pagination={{ current: page, pageSize, total: data?.total ?? 0, showSizeChanger: true,
            onChange: (p, s) => { setPage(p); setPageSize(s); }, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          expandable={{
            expandedRowRender: (r) => <AuditRowDetail row={r} />,
          }}
          columns={[
            { title: 'Time', dataIndex: 'atUtc', key: 't', width: 180, render: (v: string) => formatDateTime(v) },
            { title: 'User', dataIndex: 'userName', key: 'u', width: 180 },
            { title: 'Action', dataIndex: 'action', key: 'a', width: 100, render: (v: string) => <ActionTag action={v} /> },
            { title: 'Entity', dataIndex: 'entityName', key: 'en', width: 160 },
            { title: 'Entity Id', dataIndex: 'entityId', key: 'ei', render: (v: string, row: AuditLog) => <EntityLink entityName={row.entityName} entityId={v} /> },
            { title: 'Correlation', dataIndex: 'correlationId', key: 'c', width: 140, render: (v: string) => (
              <Tooltip title={v}><span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: 'var(--jm-primary-500)' }}>{v.slice(0, 10)}…</span></Tooltip>
            ) },
          ]}
          locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><SafetyOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No audit entries</div> }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  );
}

function ActionTag({ action }: { action: string }) {
  const color = action === 'Create' ? 'green' : action === 'Delete' ? 'red' : action === 'Update' ? 'blue' : 'default';
  return <Tag color={color} style={{ margin: 0 }}>{action}</Tag>;
}

/// Map audit entityName → SPA route. Unknown entities render the raw id only.
/// Keep this list conservative — only entities with a real detail route should
/// become links, otherwise we'd send reviewers to 404s.
const ENTITY_ROUTE: Record<string, (id: string) => string> = {
  Receipt: (id) => `/receipts/${id}`,
  Voucher: (id) => `/vouchers/${id}`,
  Member: (id) => `/members/${id}`,
  Commitment: (id) => `/commitments/${id}`,
  QarzanHasanaLoan: (id) => `/qarzan-hasana/${id}`,
  Event: (id) => `/events/${id}`,
};

function EntityLink({ entityName, entityId }: { entityName: string; entityId: string }) {
  const monoStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 };
  const to = ENTITY_ROUTE[entityName]?.(entityId);
  if (!to) return <span className="jm-tnum" style={monoStyle}>{entityId}</span>;
  return (
    <Link to={to} style={{ ...monoStyle, color: 'var(--jm-primary-500)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <LinkOutlined style={{ fontSize: 11 }} />
      {entityId}
    </Link>
  );
}

/// Expanded row body: toggles between a field-by-field diff (default) and raw JSON.
/// Diff mode is faster to scan for "what actually changed" — JSON mode stays for the
/// rare case where a reviewer needs the exact original payload.
function AuditRowDetail({ row }: { row: AuditLog }) {
  const [mode, setMode] = useState<'diff' | 'json'>('diff');
  return (
    <div style={{ padding: 12, background: 'var(--jm-surface-muted)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBlockEnd: 10 }}>
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as 'diff' | 'json')}
          options={[
            { label: 'Field diff', value: 'diff' },
            { label: 'Raw JSON', value: 'json' },
          ]}
        />
        {row.screen && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Screen: <code>{row.screen}</code></Typography.Text>}
        {row.ipAddress && <Typography.Text type="secondary" style={{ fontSize: 12 }}>IP: <code>{row.ipAddress}</code></Typography.Text>}
      </div>
      {mode === 'diff'
        ? <FieldDiff before={row.beforeJson} after={row.afterJson} />
        : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <JsonBlock title="Before" value={row.beforeJson} />
            <JsonBlock title="After" value={row.afterJson} />
          </div>}
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--jm-gray-500)', marginBlockEnd: 6 }}>{title}</div>
      {value ? (
        <pre style={{ margin: 0, padding: 12, background: '#0E1B26', color: '#CBD3DD', borderRadius: 8, fontSize: 11.5, maxBlockSize: 240, overflow: 'auto' }}>
          {tryFormat(value)}
        </pre>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>— none —</Typography.Text>
      )}
    </div>
  );
}

/// Render a recursive before→after diff. Nested objects expand into dotted paths
/// (e.g. address.city), arrays into bracket-indexed paths (lines[0].amount).
/// Skips paths whose serialised values are identical so reviewers see only what changed.
function FieldDiff({ before, after }: { before?: string | null; after?: string | null }) {
  const b = parseOrNull(before);
  const a = parseOrNull(after);

  // Creates & deletes have only one side — fall back to showing the single object's fields.
  if (!b && !a) return <Typography.Text type="secondary" style={{ fontSize: 12 }}>No payload captured.</Typography.Text>;
  if (!b) return <SideOnly kind="New" obj={a ?? {}} />;
  if (!a) return <SideOnly kind="Deleted" obj={b} />;

  const rows = collectDiffRows(b, a, '');
  if (rows.length === 0) {
    return <Typography.Text type="secondary" style={{ fontSize: 12 }}>No fields changed.</Typography.Text>;
  }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid var(--jm-border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 1fr 1fr', fontSize: 12, fontWeight: 600, background: 'var(--jm-surface-muted)', padding: '8px 12px' }}>
        <div>Path</div><div>Before</div><div>After</div>
      </div>
      {rows.map((r, i) => (
        <div key={r.path} style={{
          display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 1fr 1fr',
          fontSize: 12, padding: '6px 12px',
          borderBlockStart: i === 0 ? 'none' : '1px solid var(--jm-border)',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        }}>
          <div style={{ color: 'var(--jm-gray-700)', fontWeight: 500, overflowWrap: 'anywhere' }}>{r.path}</div>
          <div style={{ color: '#991B1B', background: 'rgba(254, 226, 226, 0.4)', padding: '2px 6px', borderRadius: 4, overflowWrap: 'anywhere' }}>{fmt(r.before)}</div>
          <div style={{ color: '#065F46', background: 'rgba(209, 250, 229, 0.4)', padding: '2px 6px', borderRadius: 4, overflowWrap: 'anywhere' }}>{fmt(r.after)}</div>
        </div>
      ))}
    </div>
  );
}

type DiffRow = { path: string; before: unknown; after: unknown };

/// Walk both sides in parallel, emitting one DiffRow per leaf that differs. Leaves are
/// scalars (string/number/bool/null), arrays (compared element-wise), and objects whose
/// keys we recurse into. We compare by JSON.stringify so equal nested structures collapse.
function collectDiffRows(before: unknown, after: unknown, path: string, out: DiffRow[] = [], depth = 0): DiffRow[] {
  // Cap recursion to keep deeply nested payloads from overwhelming the table.
  if (depth > 6) {
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ path, before, after });
    return out;
  }

  if (JSON.stringify(before) === JSON.stringify(after)) return out;

  const bIsObj = isPlainObject(before);
  const aIsObj = isPlainObject(after);
  if (bIsObj && aIsObj) {
    const keys = Array.from(new Set([...Object.keys(before as object), ...Object.keys(after as object)])).sort();
    for (const k of keys) {
      const childPath = path ? `${path}.${k}` : k;
      collectDiffRows((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k], childPath, out, depth + 1);
    }
    return out;
  }

  const bIsArr = Array.isArray(before);
  const aIsArr = Array.isArray(after);
  if (bIsArr && aIsArr) {
    const len = Math.max((before as unknown[]).length, (after as unknown[]).length);
    for (let i = 0; i < len; i++) {
      const childPath = `${path}[${i}]`;
      collectDiffRows((before as unknown[])[i], (after as unknown[])[i], childPath, out, depth + 1);
    }
    return out;
  }

  // Mixed types or scalars → leaf
  out.push({ path: path || '(root)', before, after });
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function SideOnly({ kind, obj }: { kind: 'New' | 'Deleted'; obj: Record<string, unknown> }) {
  const keys = Object.keys(obj);
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid var(--jm-border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: 'var(--jm-surface-muted)', fontSize: 12, fontWeight: 600 }}>
        {kind === 'New' ? 'Fields (new record)' : 'Fields (deleted record)'}
      </div>
      {keys.map((k, i) => (
        <div key={k} style={{
          display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 2fr',
          fontSize: 12, padding: '6px 12px',
          borderBlockStart: i === 0 ? 'none' : '1px solid var(--jm-border)',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        }}>
          <div style={{ color: 'var(--jm-gray-700)', fontWeight: 500 }}>{k}</div>
          <div style={{ color: kind === 'New' ? '#065F46' : '#991B1B', overflowWrap: 'anywhere' }}>{fmt(obj[k])}</div>
        </div>
      ))}
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function parseOrNull(s?: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try { const p = JSON.parse(s); return typeof p === 'object' && p !== null ? p as Record<string, unknown> : null; }
  catch { return null; }
}

function tryFormat(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
