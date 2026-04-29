import { useState } from 'react';
import { Card, Table, Tag, Select, DatePicker, Input, Empty, Drawer, Typography, Tooltip } from 'antd';
import { BellOutlined, MailOutlined, FileTextOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { formatDateTime } from '../../../shared/format/format';
import { api } from '../../../shared/api/client';

type NotificationKind = 1 | 2 | 3 | 4 | 5;
const KindLabel: Record<NotificationKind, string> = {
  1: 'Receipt confirmed', 2: 'Receipt pending approval',
  3: 'Voucher pending approval', 4: 'Contribution returned',
  5: 'QH loan disbursed',
};
const KindColor: Record<NotificationKind, string> = {
  1: 'green', 2: 'gold', 3: 'gold', 4: 'blue', 5: 'purple',
};

type NotificationChannel = 1 | 2;
const ChannelLabel: Record<NotificationChannel, string> = { 1: 'Log only', 2: 'Email' };

type NotificationStatus = 1 | 2 | 3;
const StatusLabel: Record<NotificationStatus, string> = { 1: 'Sent', 2: 'Failed', 3: 'Skipped' };
const StatusColor: Record<NotificationStatus, string> = { 1: 'green', 2: 'red', 3: 'default' };

type NotificationLog = {
  id: number;
  kind: NotificationKind;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject: string;
  body: string;
  recipient?: string | null;
  sourceId?: string | null;
  sourceReference?: string | null;
  failureReason?: string | null;
  attemptedAtUtc: string;
};

type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

/// Admin-only audit viewer for the notification log. Reads /api/v1/notifications which is
/// gated by admin.audit. Every system-fired notification (email or log-only) shows up here
/// with subject + body + delivery outcome - lets admins confirm "did the system tell the
/// contributor?" and triage SMTP failures.
export function NotificationLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [kind, setKind] = useState<NotificationKind | undefined>();
  const [status, setStatus] = useState<NotificationStatus | undefined>();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [selected, setSelected] = useState<NotificationLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-log', page, pageSize, kind, status, search, range?.[0]?.format('YYYY-MM-DD'), range?.[1]?.format('YYYY-MM-DD')],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (kind !== undefined) params.kind = kind;
      if (status !== undefined) params.status = status;
      if (search.trim()) params.search = search.trim();
      if (range?.[0]) params.fromDate = range[0].format('YYYY-MM-DD');
      if (range?.[1]) params.toDate = range[1].format('YYYY-MM-DD');
      const r = await api.get<PagedResult<NotificationLog>>('/api/v1/notifications', { params });
      return r.data;
    },
  });

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Every notification the system attempted, with delivery outcome." />

      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <DatePicker.RangePicker value={range} onChange={(v) => { setRange(v as [Dayjs, Dayjs] | null); setPage(1); }} style={{ inlineSize: 240 }}
            presets={[
              { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
              { label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
            ]} />
          <Select style={{ inlineSize: 220 }} placeholder="Kind" allowClear
            value={kind} onChange={(v) => { setKind(v); setPage(1); }}
            options={[1, 2, 3, 4, 5].map((k) => ({ value: k, label: KindLabel[k as NotificationKind] }))} />
          <Select style={{ inlineSize: 140 }} placeholder="Status" allowClear
            value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={[1, 2, 3].map((s) => ({ value: s, label: StatusLabel[s as NotificationStatus] }))} />
          <Input.Search style={{ inlineSize: 280 }} placeholder="Subject, recipient, source ref"
            value={search} onChange={(e) => setSearch(e.target.value)} onSearch={() => setPage(1)} allowClear />
        </div>
        <Table<NotificationLog>
          rowKey="id" size="middle" loading={isLoading}
          dataSource={data?.items ?? []}
          pagination={{
            current: page, pageSize, total: data?.total ?? 0, showSizeChanger: true,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            showTotal: (t, [f, to]) => `${f}–${to} of ${t}`,
          }}
          onRow={(row) => ({ onClick: () => setSelected(row), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'When', dataIndex: 'attemptedAtUtc', width: 160, render: (v: string) => formatDateTime(v) },
            { title: 'Kind', dataIndex: 'kind', width: 200, render: (k: NotificationKind) => <Tag color={KindColor[k]} style={{ margin: 0 }}>{KindLabel[k]}</Tag> },
            { title: 'Subject', dataIndex: 'subject', render: (v: string) => v },
            { title: 'Recipient', dataIndex: 'recipient', width: 200, render: (v?: string | null) => v ? <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>{v}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
            { title: 'Channel', dataIndex: 'channel', width: 110, render: (c: NotificationChannel) => <Tag style={{ margin: 0 }} icon={c === 2 ? <MailOutlined /> : <FileTextOutlined />}>{ChannelLabel[c]}</Tag> },
            { title: 'Status', dataIndex: 'status', width: 110, render: (s: NotificationStatus, row) => (
              <Tooltip title={s === 2 ? row.failureReason : undefined}>
                <Tag color={StatusColor[s]} style={{ margin: 0 }}>{StatusLabel[s]}</Tag>
              </Tooltip>
            ) },
          ]}
          locale={{
            emptyText: <Empty description="No notifications recorded for the current filter"
              image={<BellOutlined style={{ fontSize: 32, color: 'var(--jm-gray-400)' }} />} />,
          }}
        />
      </Card>

      <Drawer title={selected?.subject} width={640} open={!!selected} onClose={() => setSelected(null)} destroyOnHidden>
        {selected && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockEnd: 12 }}>
              <Tag color={KindColor[selected.kind]} style={{ margin: 0, marginInlineEnd: 8 }}>{KindLabel[selected.kind]}</Tag>
              <Tag color={StatusColor[selected.status]} style={{ margin: 0, marginInlineEnd: 8 }}>{StatusLabel[selected.status]}</Tag>
              <Tag style={{ margin: 0 }}>{ChannelLabel[selected.channel]}</Tag>
              <span style={{ marginInlineStart: 12 }}>{formatDateTime(selected.attemptedAtUtc)}</span>
            </div>
            {selected.recipient && (
              <div style={{ fontSize: 13, marginBlockEnd: 4 }}><strong>To:</strong> <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{selected.recipient}</span></div>
            )}
            {selected.sourceReference && (
              <div style={{ fontSize: 13, marginBlockEnd: 4 }}><strong>Source:</strong> {selected.sourceReference}</div>
            )}
            {selected.failureReason && (
              <div style={{ marginBlockEnd: 12, padding: 10, background: '#FEE2E2', borderRadius: 6, fontSize: 12, color: '#991B1B' }}>
                <strong>Failure:</strong> {selected.failureReason}
              </div>
            )}
            <Typography.Title level={5}>Body</Typography.Title>
            <pre style={{ background: '#F8FAFC', padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              {selected.body}
            </pre>
          </div>
        )}
      </Drawer>
    </div>
  );
}
