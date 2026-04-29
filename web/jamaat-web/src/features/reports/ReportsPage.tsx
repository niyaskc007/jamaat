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
import { membersApi } from '../members/membersApi';
import { fundTypesApi } from '../admin/master-data/fund-types/fundTypesApi';
import { Tag } from 'antd';
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
        { key: 'member', label: 'Member Contribution', children: <MemberContribution /> },
        { key: 'cheque', label: 'Cheque-wise', children: <ChequeWise /> },
        { key: 'fund-balance', label: 'Fund Balance (Dual)', children: <FundBalance /> },
        { key: 'returnable', label: 'Returnable Contributions', children: <ReturnableContributions /> },
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

function MemberContribution() {
  const { range, setRange, from, to } = useRange();
  const { hasPermission } = useAuth();
  // Member picker — fetch active members so the report can be run quickly. We don't lazy-search
  // here because the count is small enough; if a Jamaat grows large, swap to type-ahead lookup.
  const membersQuery = useQuery({ queryKey: ['members', 'for-report'], queryFn: () => membersApi.list({ page: 1, pageSize: 500, status: 1 }) });
  const [memberId, setMemberId] = useState<string | undefined>();
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'mc', memberId, from, to],
    queryFn: () => memberId ? reportsApi.memberContribution(memberId, from, to) : Promise.resolve([]),
    enabled: !!memberId,
  });
  const total = (data ?? []).reduce((s, r) => s + r.amount, 0);
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select style={{ inlineSize: 320 }} placeholder="Select member"
          showSearch optionFilterProp="label"
          value={memberId} onChange={setMemberId}
          options={(membersQuery.data?.items ?? []).map((m) => ({ value: m.id, label: `${m.itsNumber} · ${m.fullName}` }))} />
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && memberId && (
          <ExportButton onClick={() => downloadXlsx('/api/v1/reports/member-contribution.xlsx', { memberId, from, to }, `member-contribution_${from}_${to}.xlsx`)} />
        )}
      </div>
      <Table rowKey={(_, i) => String(i)} size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
        columns={[
          { title: 'Date', dataIndex: 'receiptDate', key: 'd', width: 110, render: (v: string) => formatDate(v) },
          { title: 'Receipt #', dataIndex: 'receiptNumber', key: 'rn', width: 120, render: (v: string) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
          { title: 'Fund', dataIndex: 'fundName', key: 'fn', render: (v: string, row) => <span><strong>{row.fundCode}</strong> — {v}</span> },
          { title: 'Period', dataIndex: 'periodReference', key: 'pr', width: 120, render: (v?: string | null) => v ?? '—' },
          { title: 'Purpose', dataIndex: 'purpose', key: 'pu', render: (v?: string | null) => v ?? '—' },
          { title: 'Amount', dataIndex: 'amount', key: 'a', align: 'right', width: 140, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, row.currency)}</span> },
        ]}
        summary={(rows) => rows.length > 0 ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={5} align="right"><strong>Total</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right"><span className="jm-tnum" style={{ fontWeight: 700, fontSize: 15 }}>{money(total, rows[0].currency)}</span></Table.Summary.Cell>
          </Table.Summary.Row>
        ) : null}
        locale={{ emptyText: <Empty description={memberId ? 'No contributions in this period' : 'Select a member to view their contribution history'} /> }}
      />
    </Card>
  );
}

function FundBalance() {
  // Dual-balance view per fund (batch 5 of fund-management uplift).
  // Shows total cash received, returnable obligation, and net fund strength side-by-side
  // so the Jamaat doesn't mistake returnable money for permanent income.
  const fundsQ = useQuery({ queryKey: ['fundTypes', 'all'], queryFn: () => fundTypesApi.list({ page: 1, pageSize: 200, active: true }) });
  const [fundTypeId, setFundTypeId] = useState<string | undefined>();
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'fund-balance', fundTypeId],
    queryFn: () => fundTypeId ? reportsApi.fundBalance(fundTypeId) : Promise.resolve(null),
    enabled: !!fundTypeId,
  });

  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 24 } }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlockEnd: 16 }}>
        <Select style={{ inlineSize: 320 }} placeholder="Select fund"
          showSearch optionFilterProp="label"
          value={fundTypeId} onChange={setFundTypeId}
          options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} — ${f.nameEnglish}` }))} />
      </div>
      {!fundTypeId && <Empty description="Select a fund to see its dual-balance view" />}
      {fundTypeId && isLoading && <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left column: total cash view */}
          <Card size="small" title="Total cash received">
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter Tight', 'Inter', sans-serif" }} className="jm-tnum">
              {money(data.totalCashReceived, data.currency)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
              Permanent: <span className="jm-tnum">{money(data.permanentReceived, data.currency)}</span>
              <br />
              Returnable: <span className="jm-tnum">{money(data.returnableReceived, data.currency)}</span>
              <br />
              {data.receiptCount} receipt(s) confirmed
            </div>
          </Card>
          {/* Right column: net fund strength */}
          <Card size="small" title="Net fund strength" style={{ background: 'rgba(11,110,99,0.05)' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--jm-primary-500)', fontFamily: "'Inter Tight', 'Inter', sans-serif" }} className="jm-tnum">
              {money(data.netFundStrength, data.currency)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
              Total received: <span className="jm-tnum">{money(data.totalCashReceived, data.currency)}</span>
              <br />
              Less outstanding obligation: <span className="jm-tnum">−{money(data.outstandingReturnObligation, data.currency)}</span>
              <br />
              Already returned: <span className="jm-tnum">{money(data.alreadyReturned, data.currency)}</span>
            </div>
          </Card>
        </div>
      )}
      {data && (
        <Empty
          image={null}
          imageStyle={{ display: 'none' }}
          description={
            <div style={{ marginBlockStart: 16, fontSize: 12, color: 'var(--jm-gray-500)', textAlign: 'left' }}>
              <strong>Why two numbers?</strong> Total cash is what the fund has received from contributors.
              Net strength subtracts the still-outstanding return obligation — that part of the cash is
              effectively borrowed from contributors and must be returned. Without this distinction,
              reports would treat returnable money as permanent income and overstate the fund.
            </div>
          }
        />
      )}
    </Card>
  );
}

function ReturnableContributions() {
  // Lists every returnable receipt with its maturity status, agreement, and remaining
  // returnable balance. Hub for the contribution-return workflow once the return-processing
  // UI ships in a follow-up.
  const fundsQ = useQuery({ queryKey: ['fundTypes', 'all'], queryFn: () => fundTypesApi.list({ page: 1, pageSize: 200, active: true }) });
  const [fundTypeId, setFundTypeId] = useState<string | undefined>();
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'returnable', fundTypeId],
    queryFn: () => reportsApi.returnableContributions(fundTypeId),
  });
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select style={{ inlineSize: 320 }} placeholder="All funds (or pick one)"
          allowClear showSearch optionFilterProp="label"
          value={fundTypeId} onChange={setFundTypeId}
          options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} — ${f.nameEnglish}` }))} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/returnable-contributions.xlsx', fundTypeId ? { fundTypeId } : {}, `returnable-contributions_${new Date().toISOString().slice(0, 10)}.xlsx`)} />}
      </div>
      <Table rowKey={(r) => r.receiptId} size="middle" loading={isLoading} dataSource={data ?? []} pagination={{ pageSize: 25 }}
        columns={[
          { title: 'Receipt date', dataIndex: 'receiptDate', key: 'rd', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Receipt #', dataIndex: 'receiptNumber', key: 'rn', width: 130, render: (v?: string | null) => v ?? '—' },
          { title: 'Member', dataIndex: 'memberName', key: 'mn', render: (v: string, row) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.itsNumber}</span> · {v}</span> },
          { title: 'Fund', dataIndex: 'fundTypeName', key: 'f', render: (v: string, row) => `${row.fundTypeCode} — ${v}` },
          { title: 'Amount', dataIndex: 'amountTotal', key: 'a', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum">{money(v, row.currency)}</span> },
          { title: 'Returned', dataIndex: 'amountReturned', key: 'rt', align: 'right', width: 130, render: (v: number, row) => v ? <span className="jm-tnum" style={{ color: 'var(--jm-gray-700)' }}>{money(v, row.currency)}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
          { title: 'Outstanding', dataIndex: 'amountReturnable', key: 'ob', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
          { title: 'Maturity', dataIndex: 'maturityDate', key: 'm', width: 120, render: (v: string | null, row) => v ? <span><span style={{ display: 'block' }}>{formatDate(v)}</span><Tag color={row.isMatured ? 'green' : 'gold'} style={{ margin: 0, fontSize: 11 }}>{row.isMatured ? 'Matured' : 'Not matured'}</Tag></span> : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
          { title: 'Agreement', dataIndex: 'agreementReference', key: 'ag', width: 150, render: (v?: string | null) => v ? <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>{v}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
        ]}
        locale={{ emptyText: <Empty description="No returnable contributions" /> }}
      />
    </Card>
  );
}

function ChequeWise() {
  const { range, setRange, from, to } = useRange();
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['rpt', 'cheque', from, to], queryFn: () => reportsApi.chequeWise(from, to) });
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/cheque-wise.xlsx', { from, to }, `cheque-wise_${from}_${to}.xlsx`)} />}
      </div>
      <Table rowKey={(_, i) => String(i)} size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
        columns={[
          { title: 'Receipt date', dataIndex: 'receiptDate', key: 'rd', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Receipt #', dataIndex: 'receiptNumber', key: 'rn', width: 120, render: (v?: string | null) => v ?? '—' },
          { title: 'ITS', dataIndex: 'itsNumber', key: 'its', width: 110, render: (v: string) => <span className="jm-tnum">{v}</span> },
          { title: 'Member', dataIndex: 'memberName', key: 'mn' },
          { title: 'Cheque #', dataIndex: 'chequeNumber', key: 'cn', width: 130, render: (v?: string | null) => v ? <span className="jm-tnum">{v}</span> : '—' },
          { title: 'Cheque date', dataIndex: 'chequeDate', key: 'cd', width: 120, render: (v?: string | null) => v ? formatDate(v) : '—' },
          { title: 'Bank', dataIndex: 'bankAccountName', key: 'b', render: (v?: string | null) => v ?? '—' },
          { title: 'Amount', dataIndex: 'amount', key: 'a', align: 'right', width: 140, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, row.currency)}</span> },
          { title: 'Status', dataIndex: 'status', key: 's', width: 110 },
        ]}
        locale={{ emptyText: <Empty description="No cheque receipts in this period" /> }}
      />
    </Card>
  );
}
