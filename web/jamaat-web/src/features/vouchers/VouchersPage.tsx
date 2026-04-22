import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, DatePicker, App as AntdApp, Empty, Dropdown, Space } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined,
  PrinterOutlined, CheckCircleFilled, StopOutlined, RollbackOutlined, WalletOutlined,
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
import {
  vouchersApi, PaymentModeLabel, VoucherStatusLabel,
  type VoucherListItem, type VoucherListQuery, type VoucherStatus, type PaymentMode,
} from './vouchersApi';

const { RangePicker } = DatePicker;

export function VouchersPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('voucher.create');
  const { message, modal } = AntdApp.useApp();

  const [query, setQuery] = useState<VoucherListQuery>({ page: 1, pageSize: 25 });
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const effective: VoucherListQuery = {
    ...query,
    fromDate: range?.[0]?.format('YYYY-MM-DD'),
    toDate: range?.[1]?.format('YYYY-MM-DD'),
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['vouchers', effective], queryFn: () => vouchersApi.list(effective), placeholderData: keepPreviousData,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => vouchersApi.approve(id),
    onSuccess: () => { message.success('Voucher approved and paid'); void qc.invalidateQueries({ queryKey: ['vouchers'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const cancelMut = useMutation({
    mutationFn: (args: { id: string; reason: string }) => vouchersApi.cancel(args.id, args.reason),
    onSuccess: () => { message.success('Voucher cancelled'); void qc.invalidateQueries({ queryKey: ['vouchers'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const reverseMut = useMutation({
    mutationFn: (args: { id: string; reason: string }) => vouchersApi.reverse(args.id, args.reason),
    onSuccess: () => { message.success('Voucher reversed'); void qc.invalidateQueries({ queryKey: ['vouchers'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<VoucherListItem> = useMemo(() => [
    {
      title: 'Voucher #', dataIndex: 'voucherNumber', key: 'vn', width: 140,
      render: (v?: string, row?: VoucherListItem) => v
        ? <a onClick={(e) => { e.preventDefault(); navigate(`/vouchers/${row!.id}`); }} style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</a>
        : <span style={{ color: 'var(--jm-gray-400)' }}>—</span>,
    },
    { title: 'Date', dataIndex: 'voucherDate', key: 'date', width: 120, render: (v: string) => formatDate(v) },
    { title: 'Pay to', dataIndex: 'payTo', key: 'payto', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'Amount', dataIndex: 'amountTotal', key: 'amt', width: 140, align: 'right',
      render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 110, render: (v: PaymentMode) => <Tag style={{ margin: 0 }}>{PaymentModeLabel[v]}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 140, render: (s: VoucherStatus) => <StatusTag status={s} /> },
    {
      key: 'actions', width: 56, fixed: 'right',
      render: (_: unknown, row: VoucherListItem) => {
        const items: MenuProps['items'] = [
          { key: 'view', icon: <WalletOutlined />, label: 'View', onClick: () => navigate(`/vouchers/${row.id}`) },
          { key: 'pdf', icon: <PrinterOutlined />, label: 'Print PDF', disabled: !row.voucherNumber, onClick: () => void vouchersApi.openPdf(row.id) },
          { type: 'divider' },
          { key: 'approve', icon: <CheckCircleFilled />, label: 'Approve & Pay', disabled: row.status !== 2, onClick: () => approveMut.mutate(row.id) },
          { key: 'cancel', icon: <StopOutlined />, label: 'Cancel', disabled: row.status === 4 || row.status === 5 || row.status === 6,
            onClick: () => promptReason(modal, 'Cancel voucher', 'Reason', (r) => cancelMut.mutate({ id: row.id, reason: r })) },
          { key: 'reverse', icon: <RollbackOutlined />, label: 'Reverse', danger: true, disabled: row.status !== 4,
            onClick: () => promptReason(modal, 'Reverse voucher', 'Reason', (r) => reverseMut.mutate({ id: row.id, reason: r })) },
        ];
        return <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      },
    },
  ], [approveMut, cancelMut, modal, navigate, reverseMut]);

  const hasActiveFilters = !!(search || range || query.status !== undefined);
  const empty = !isLoading && (data?.total ?? 0) === 0;
  const firstRun = empty && !hasActiveFilters;

  return (
    <div>
      <PageHeader
        title={t('nav.vouchers')}
        subtitle="Outgoing payment vouchers."
        actions={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/vouchers/new')}>New Voucher</Button> : null}
      />

      {firstRun ? (
        <ModuleEmptyState
          icon={<WalletOutlined />}
          title="No vouchers yet"
          description="Record outgoing payments here. Expense types over their configured threshold require approval before paying. Cancelled vouchers post nothing; paid ones hit the ledger."
          primaryAction={canCreate ? { label: 'New voucher', onClick: () => navigate('/vouchers/new') } : undefined}
          helpHref="/help"
        />
      ) : (
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ display: 'flex', gap: 8, padding: 12, borderBlockEnd: '1px solid var(--jm-border)', flexWrap: 'wrap' }}>
          <RangePicker value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} style={{ inlineSize: 240 }}
            presets={[
              { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
              { label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
            ]} />
          <Input placeholder="Search by number, payee or purpose" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
            onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))} style={{ flex: 1, minInlineSize: 280 }} />
          <Select allowClear placeholder="Status" style={{ inlineSize: 160 }}
            value={query.status} onChange={(v) => setQuery((q) => ({ ...q, page: 1, status: v }))}
            options={Object.entries(VoucherStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>
        <Table<VoucherListItem>
          rowKey="id" size="middle" loading={isLoading} columns={columns}
          dataSource={data?.items ?? []}
          pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total ?? 0, showSizeChanger: true, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          onChange={(p) => setQuery((q) => ({ ...q, page: p.current ?? 1, pageSize: p.pageSize ?? 25 }))}
          locale={{
            emptyText: empty ? (
              <Empty image={<WalletOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />} styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No matches</div>
                    <Space style={{ marginBlockStart: 8 }}>
                      <Button onClick={() => { setSearch(''); setRange(null); setQuery({ page: 1, pageSize: 25 }); }}>Clear filters</Button>
                    </Space>
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

function StatusTag({ status }: { status: VoucherStatus }) {
  const cfg: Record<VoucherStatus, { bg: string; color: string }> = {
    1: { bg: '#FEF3C7', color: '#92400E' },
    2: { bg: '#FEF3C7', color: '#D97706' },
    3: { bg: '#DBEAFE', color: '#1E40AF' },
    4: { bg: '#D1FAE5', color: '#065F46' },
    5: { bg: '#E5E9EF', color: '#475569' },
    6: { bg: '#FEE2E2', color: '#991B1B' },
  };
  const c = cfg[status];
  return <Tag style={{ margin: 0, background: c.bg, color: c.color, border: 'none', fontWeight: 500 }}>{VoucherStatusLabel[status]}</Tag>;
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
    okButtonProps: { danger: true },
    onOk: () => { if (!reason.trim()) throw new Error('reason required'); onOk(reason); },
  });
}
