import { useState } from 'react';
import { Card, DatePicker, Tabs, Table, Select, Empty, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money, formatDate } from '../../shared/format/format';
import { reportsApi } from '../ledger/ledgerApi';
import { accountsApi } from '../admin/master-data/chart-of-accounts/accountsApi';
import { useBaseCurrency } from '../../shared/hooks/useBaseCurrency';
import { useAuth } from '../../shared/auth/useAuth';
import { api } from '../../shared/api/client';

/// Fetches an XLSX from the given endpoint and triggers a browser download.
/// Using axios with responseType=blob so the auth header is attached automatically.
async function downloadXlsx(path: string, params: Record<string, string>, filename: string) {
  const { data } = await api.get<Blob>(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return <Button size="small" icon={<DownloadOutlined />} onClick={onClick}>Export XLSX</Button>;
}

const { RangePicker } = DatePicker;

export function ReportsPage() {
  const { t } = useTranslation('common');
  return (
    <div>
      <PageHeader title={t('nav.reports')} subtitle="Operational and financial reports." />
      <Tabs defaultActiveKey="daily" items={[
        { key: 'daily', label: 'Daily Collection', children: <DailyCollection /> },
        { key: 'fund', label: 'Fund-wise Collection', children: <FundWise /> },
        { key: 'payments', label: 'Daily Payments', children: <DailyPayments /> },
        { key: 'cashbook', label: 'Cash Book', children: <CashBook /> },
      ]} />
    </div>
  );
}

function useRange(defaultRange: [Dayjs, Dayjs] = [dayjs().subtract(30, 'day'), dayjs()]) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  return {
    range, setRange,
    from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'),
  };
}

function DailyCollection() {
  const { range, setRange, from, to } = useRange();
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['rpt', 'daily', from, to], queryFn: () => reportsApi.dailyCollection(from, to) });
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/daily-collection.xlsx', { from, to }, `daily-collection_${from}_${to}.xlsx`)} />}
      </div>
      <Table rowKey={(r) => `${r.date}-${r.currency}`} size="middle" loading={isLoading} dataSource={data ?? []}
        pagination={false}
        columns={[
          { title: 'Date', dataIndex: 'date', key: 'date', render: (v: string) => formatDate(v) },
          { title: 'Receipts', dataIndex: 'receiptCount', key: 'count', align: 'right', render: (v: number) => <span className="jm-tnum">{v}</span> },
          { title: 'Total', dataIndex: 'amountTotal', key: 'amt', align: 'right', render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
        ]}
        locale={{ emptyText: <Empty description="No receipts in this period" /> }}
      />
    </Card>
  );
}

function FundWise() {
  const { range, setRange, from, to } = useRange();
  const baseCurrency = useBaseCurrency();
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['rpt', 'fund', from, to], queryFn: () => reportsApi.fundWise(from, to) });
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/fund-wise.xlsx', { from, to }, `fund-wise_${from}_${to}.xlsx`)} />}
      </div>
      <Table rowKey="fundTypeId" size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
        columns={[
          { title: 'Code', dataIndex: 'fundTypeCode', key: 'c', width: 120, render: (v: string) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</span> },
          { title: 'Fund', dataIndex: 'fundTypeName', key: 'n' },
          { title: 'Lines', dataIndex: 'lineCount', key: 'lc', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
          { title: 'Total', dataIndex: 'amountTotal', key: 'amt', align: 'right', render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, baseCurrency)}</span> },
        ]}
        locale={{ emptyText: <Empty description="No fund-wise receipts" /> }}
      />
    </Card>
  );
}

function DailyPayments() {
  const { range, setRange, from, to } = useRange();
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['rpt', 'payments', from, to], queryFn: () => reportsApi.dailyPayments(from, to) });
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/daily-payments.xlsx', { from, to }, `daily-payments_${from}_${to}.xlsx`)} />}
      </div>
      <Table rowKey={(r) => `${r.date}-${r.currency}`} size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
        columns={[
          { title: 'Date', dataIndex: 'date', key: 'd', render: (v: string) => formatDate(v) },
          { title: 'Vouchers', dataIndex: 'voucherCount', key: 'vc', align: 'right', render: (v: number) => <span className="jm-tnum">{v}</span> },
          { title: 'Total', dataIndex: 'amountTotal', key: 'amt', align: 'right', render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
        ]}
        locale={{ emptyText: <Empty description="No payments in this period" /> }}
      />
    </Card>
  );
}

function CashBook() {
  const { range, setRange, from, to } = useRange();
  const baseCurrency = useBaseCurrency();
  const { hasPermission } = useAuth();
  const accountsQuery = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => accountsApi.list({ page: 1, pageSize: 500 }) });
  const cashLike = accountsQuery.data?.items.filter((a) => a.type === 1) ?? [];
  const [accountId, setAccountId] = useState<string | undefined>();
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'cashbook', accountId, from, to],
    queryFn: () => accountId ? reportsApi.cashBook(accountId, from, to) : Promise.resolve([]),
    enabled: !!accountId,
  });
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select style={{ inlineSize: 280 }} placeholder="Select cash/bank account"
          value={accountId} onChange={setAccountId}
          options={cashLike.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && accountId && (
          <ExportButton onClick={() => downloadXlsx('/api/v1/reports/cash-book.xlsx', { accountId, from, to }, `cash-book_${from}_${to}.xlsx`)} />
        )}
      </div>
      <Table rowKey={(r, i) => `${r.date}-${i}`} size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
        columns={[
          { title: 'Date', dataIndex: 'date', key: 'd', render: (v: string) => formatDate(v) },
          { title: 'Reference', dataIndex: 'reference', key: 'r', render: (v: string) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
          { title: 'Narration', dataIndex: 'narration', key: 'n' },
          { title: 'Debit', dataIndex: 'debit', key: 'de', align: 'right', width: 120, render: (v: number) => v ? <span className="jm-tnum">{money(v, baseCurrency)}</span> : '' },
          { title: 'Credit', dataIndex: 'credit', key: 'cr', align: 'right', width: 120, render: (v: number) => v ? <span className="jm-tnum">{money(v, baseCurrency)}</span> : '' },
          { title: 'Balance', dataIndex: 'balance', key: 'bal', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, baseCurrency)}</span> },
        ]}
        locale={{ emptyText: <Empty description={accountId ? "No entries in this period" : "Select an account to view its cash book"} /> }}
      />
    </Card>
  );
}
