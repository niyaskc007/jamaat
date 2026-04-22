import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, DatePicker, App as AntdApp, Empty, Dropdown } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined,
  PrinterOutlined, StopOutlined, RollbackOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useQuery, keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ModuleEmptyState } from '../../shared/ui/ModuleEmptyState';
import { useAuth } from '../../shared/auth/useAuth';
import { money, formatDate } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { downloadCsv, fetchAllPages, toCsv } from '../../shared/export/csv';
import { DownloadOutlined } from '@ant-design/icons';
import {
  receiptsApi, PaymentModeLabel, ReceiptStatusLabel,
  type ReceiptListItem, type ReceiptListQuery, type ReceiptStatus, type PaymentMode,
} from './receiptsApi';

const { RangePicker } = DatePicker;

export function ReceiptsPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('receipt.create');
  const { message, modal } = AntdApp.useApp();

  const [query, setQuery] = useState<ReceiptListQuery>({ page: 1, pageSize: 25 });
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const effective: ReceiptListQuery = {
    ...query,
    fromDate: range?.[0]?.format('YYYY-MM-DD'),
    toDate: range?.[1]?.format('YYYY-MM-DD'),
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['receipts', effective],
    queryFn: () => receiptsApi.list(effective),
    placeholderData: keepPreviousData,
  });

  const cancelMut = useMutation({
    mutationFn: (args: { id: string; reason: string }) => receiptsApi.cancel(args.id, args.reason),
    onSuccess: () => { message.success('Receipt cancelled'); void qc.invalidateQueries({ queryKey: ['receipts'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const reverseMut = useMutation({
    mutationFn: (args: { id: string; reason: string }) => receiptsApi.reverse(args.id, args.reason),
    onSuccess: () => { message.success('Receipt reversed'); void qc.invalidateQueries({ queryKey: ['receipts'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<ReceiptListItem> = useMemo(() => [
    {
      title: 'Receipt #', dataIndex: 'receiptNumber', key: 'receiptNumber', width: 140,
      render: (v?: string, row?: ReceiptListItem) => v ? (
        <a onClick={(e) => { e.preventDefault(); navigate(`/receipts/${row!.id}`); }} style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</a>
      ) : <span style={{ color: 'var(--jm-gray-400)' }}>—</span>,
    },
    { title: 'Date', dataIndex: 'receiptDate', key: 'receiptDate', width: 120, render: (v: string) => formatDate(v) },
    { title: 'Member', dataIndex: 'memberNameSnapshot', key: 'member', render: (v: string, row) => (
      <div><div style={{ fontWeight: 500 }}>{v}</div>
        <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }} className="jm-tnum">ITS {row.itsNumberSnapshot}</div>
      </div>
    ) },
    { title: 'Amount', dataIndex: 'amountTotal', key: 'amount', width: 140, align: 'right',
      render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 110, render: (v: PaymentMode) => <Tag style={{ margin: 0 }}>{PaymentModeLabel[v]}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (s: ReceiptStatus) => <StatusTag status={s} /> },
    {
      key: 'actions', width: 56, fixed: 'right',
      render: (_: unknown, row: ReceiptListItem) => {
        const items: MenuProps['items'] = [
          { key: 'view', icon: <FileTextOutlined />, label: 'View', onClick: () => navigate(`/receipts/${row.id}`) },
          { key: 'pdf', icon: <PrinterOutlined />, label: 'Print PDF', disabled: !row.receiptNumber, onClick: () => void receiptsApi.openPdf(row.id, true) },
          { type: 'divider' },
          {
            key: 'cancel', icon: <StopOutlined />, label: 'Cancel', disabled: row.status !== 2,
            onClick: () => promptReason(modal, 'Cancel receipt', 'Reason for cancellation', (reason) => cancelMut.mutate({ id: row.id, reason })),
          },
          {
            key: 'reverse', icon: <RollbackOutlined />, label: 'Reverse', danger: true, disabled: row.status !== 2,
            onClick: () => promptReason(modal, 'Reverse receipt', 'Reason for reversal', (reason) => reverseMut.mutate({ id: row.id, reason })),
          },
        ];
        return <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      },
    },
  ], [cancelMut, modal, navigate, reverseMut]);

  const hasActiveFilters = !!(search || range || query.status !== undefined || query.paymentMode !== undefined);
  const empty = !isLoading && (data?.total ?? 0) === 0;
  const firstRun = empty && !hasActiveFilters;
  const canExport = hasPermission('reports.export') || hasPermission('receipt.view');
  const onExport = async () => {
    const { items, truncated } = await fetchAllPages<ReceiptListItem, ReceiptListQuery>(receiptsApi.list, effective);
    const csv = toCsv(items, [
      { header: 'Receipt #', value: (r) => r.receiptNumber ?? '' },
      { header: 'Date', value: (r) => r.receiptDate },
      { header: 'ITS', value: (r) => r.itsNumberSnapshot },
      { header: 'Member', value: (r) => r.memberNameSnapshot },
      { header: 'Amount', value: (r) => r.amountTotal },
      { header: 'Currency', value: (r) => r.currency },
      { header: 'Mode', value: (r) => PaymentModeLabel[r.paymentMode] },
      { header: 'Status', value: (r) => ReceiptStatusLabel[r.status] },
    ]);
    downloadCsv(`receipts_${new Date().toISOString().slice(0, 10)}${truncated ? '_truncated' : ''}.csv`, csv);
  };

  return (
    <div>
      <PageHeader
        title={t('nav.receipts')}
        subtitle="All inward donation and fund receipts."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canExport && <Button icon={<DownloadOutlined />} onClick={onExport}>Export CSV</Button>}
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/receipts/new')}>New Receipt</Button>
            )}
          </div>
        }
      />

      {firstRun ? (
        <ModuleEmptyState
          icon={<FileTextOutlined />}
          title="No receipts yet"
          description="Every inward payment is captured as a receipt. The ledger posts only when you Confirm, so drafts are safe to experiment with. Reprints and cancellations are audited."
          primaryAction={canCreate ? { label: 'Issue first receipt', onClick: () => navigate('/receipts/new') } : undefined}
          helpHref="/help"
        />
      ) : (
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ display: 'flex', gap: 8, padding: 12, borderBlockEnd: '1px solid var(--jm-border)', flexWrap: 'wrap' }}>
          <RangePicker value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
            presets={[
              { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
              { label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
            ]} style={{ inlineSize: 240 }} />
          <Input placeholder="Search by number, name, or ITS" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
            onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))} style={{ flex: 1, minInlineSize: 280 }} />
          <Select allowClear placeholder="Status" style={{ inlineSize: 140 }}
            value={query.status} onChange={(v) => setQuery((q) => ({ ...q, page: 1, status: v }))}
            options={Object.entries(ReceiptStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          <Select allowClear placeholder="Mode" style={{ inlineSize: 140 }}
            value={query.paymentMode} onChange={(v) => setQuery((q) => ({ ...q, page: 1, paymentMode: v }))}
            options={Object.entries(PaymentModeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>
        <Table<ReceiptListItem>
          rowKey="id" size="middle" loading={isLoading} columns={columns}
          dataSource={data?.items ?? []}
          pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total ?? 0, showSizeChanger: true, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          onChange={(p) => setQuery((q) => ({ ...q, page: p.current ?? 1, pageSize: p.pageSize ?? 25 }))}
          locale={{
            emptyText: empty ? (
              <Empty image={<FileTextOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />} styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No matches</div>
                    <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>No receipts match the current filters. Try adjusting the date range or clearing filters.</div>
                    <Button onClick={() => { setSearch(''); setRange(null); setQuery({ page: 1, pageSize: 25 }); }}>Clear filters</Button>
                  </div>
                } />
            ) : undefined,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
      )}
    </div>
  );
}

function StatusTag({ status }: { status: ReceiptStatus }) {
  const cfg: Record<ReceiptStatus, { bg: string; color: string }> = {
    1: { bg: '#FEF3C7', color: '#92400E' },
    2: { bg: '#D1FAE5', color: '#065F46' },
    3: { bg: '#E5E9EF', color: '#475569' },
    4: { bg: '#FEE2E2', color: '#991B1B' },
  };
  const c = cfg[status];
  return <Tag style={{ margin: 0, background: c.bg, color: c.color, border: 'none', fontWeight: 500 }}>{ReceiptStatusLabel[status]}</Tag>;
}

function promptReason(modal: ReturnType<typeof AntdApp.useApp>['modal'], title: string, label: string, onOk: (reason: string) => void) {
  let reason = '';
  modal.confirm({
    title,
    content: (
      <div style={{ marginBlockStart: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--jm-gray-600)', marginBlockEnd: 6 }}>{label}</div>
        <Input.TextArea onChange={(e) => { reason = e.target.value; }} rows={3} autoFocus />
      </div>
    ),
    okText: 'Submit',
    okButtonProps: { danger: true },
    onOk: () => {
      if (!reason.trim()) { throw new Error('Reason required'); }
      onOk(reason);
    },
  });
}
