import { useState } from 'react';
import { Card, Input, Select, Table, Tag, DatePicker, Button, Typography } from 'antd';
import { SearchOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { api } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/format/format';

const { RangePicker } = DatePicker;

type AuditLog = {
  id: number; tenantId?: string | null; userId?: string | null; userName: string;
  correlationId: string; action: string; entityName: string; entityId: string;
  screen?: string | null; beforeJson?: string | null; afterJson?: string | null;
  ipAddress?: string | null; userAgent?: string | null; atUtc: string;
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string | undefined>();
  const [entityName, setEntityName] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const query = {
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

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Append-only record of every mutation with before/after snapshots." />
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
            expandedRowRender: (r) => (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12, background: 'var(--jm-surface-muted)' }}>
                <JsonBlock title="Before" value={r.beforeJson} />
                <JsonBlock title="After" value={r.afterJson} />
              </div>
            ),
          }}
          columns={[
            { title: 'Time', dataIndex: 'atUtc', key: 't', width: 180, render: (v: string) => formatDateTime(v) },
            { title: 'User', dataIndex: 'userName', key: 'u', width: 180 },
            { title: 'Action', dataIndex: 'action', key: 'a', width: 100, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
            { title: 'Entity', dataIndex: 'entityName', key: 'en', width: 160 },
            { title: 'Entity Id', dataIndex: 'entityId', key: 'ei', render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>{v}</span> },
            { title: 'Correlation', dataIndex: 'correlationId', key: 'c', width: 140, render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: 'var(--jm-primary-500)' }}>{v.slice(0, 10)}…</span> },
          ]}
          locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><SafetyOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No audit entries</div> }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
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

function tryFormat(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
