import { useState } from 'react';
import { Card, DatePicker, Table, Select, Empty, Button, Switch, InputNumber, Row, Col } from 'antd';
import {
  DownloadOutlined, ArrowLeftOutlined,
  CalendarOutlined, PieChartOutlined, WalletOutlined, BookOutlined as LedgerIcon,
  UserOutlined, FileSearchOutlined, BankOutlined, GiftOutlined,
  HistoryOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money, formatDate } from '../../shared/format/format';
import { reportsApi } from '../ledger/ledgerApi';
import { QhStatusLabel, QhStatusColor, type QhStatus } from '../qarzan-hasana/qarzanHasanaApi';
import { StatusLabel as CommitmentStatusLabel, StatusColor as CommitmentStatusColor, type CommitmentStatus } from '../commitments/commitmentsApi';
import { accountsApi } from '../admin/master-data/chart-of-accounts/accountsApi';
import { membersApi } from '../members/membersApi';
import { fundTypesApi } from '../admin/master-data/fund-types/fundTypesApi';
import { eventsApi } from '../events/eventsApi';
import { fundCategoriesApi } from '../admin/master-data/fund-categories/fundCategoriesApi';
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

/// Catalog of every report - drives the landing grid AND the routed sub-page renderer.
/// Slug doubles as the URL segment, so /reports/daily-collection routes to the matching
/// component. Add a new report here once and it shows up everywhere.
type ReportSlug =
  | 'daily-collection' | 'fund-wise' | 'daily-payments' | 'cash-book'
  | 'member-contribution' | 'cheque-wise' | 'fund-balance' | 'returnable'
  | 'outstanding-loans' | 'pending-commitments' | 'overdue-returns';

type ReportEntry = {
  slug: ReportSlug;
  title: string;
  group: 'Daily ops' | 'Fund analytics' | 'Receivables & obligations' | 'Member-centric';
  description: string;
  icon: React.ReactNode;
  color: string;
  render: () => React.ReactNode;
};

const REPORTS: ReportEntry[] = [
  // Daily ops - what cashiers and accountants need every morning
  { slug: 'daily-collection', title: 'Daily Collection', group: 'Daily ops',
    description: 'Money in, day by day. Receipt count + total per currency for any date range.',
    icon: <CalendarOutlined />, color: '#0E5C40', render: () => <DailyCollection /> },
  { slug: 'daily-payments', title: 'Daily Payments', group: 'Daily ops',
    description: 'Money out (vouchers), day by day. Pairs with Daily Collection for net flow.',
    icon: <CalendarOutlined />, color: '#92400E', render: () => <DailyPayments /> },
  { slug: 'cash-book', title: 'Cash Book', group: 'Daily ops',
    description: 'Per-account ledger - dr/cr movement with running balance for any account.',
    icon: <LedgerIcon />, color: '#475569', render: () => <CashBook /> },
  { slug: 'cheque-wise', title: 'Cheque-wise Receipts', group: 'Daily ops',
    description: 'Every cheque-mode receipt with bank + cheque #. Drives bank reconciliation.',
    icon: <BankOutlined />, color: '#1E40AF', render: () => <ChequeWise /> },

  // Fund analytics - which funds are doing what
  { slug: 'fund-wise', title: 'Fund-wise Collection', group: 'Fund analytics',
    description: 'Receipts grouped by fund + payment-mode breakdown. Filter by event or category.',
    icon: <PieChartOutlined />, color: '#0B6E63', render: () => <FundWise /> },
  { slug: 'fund-balance', title: 'Fund Balance (Dual)', group: 'Fund analytics',
    description: 'For one fund: total cash in, permanent vs returnable split, net fund strength.',
    icon: <WalletOutlined />, color: '#7C3AED', render: () => <FundBalance /> },
  { slug: 'returnable', title: 'Returnable Contributions', group: 'Fund analytics',
    description: 'Every receipt held under returnable terms - maturity, agreement, balance.',
    icon: <GiftOutlined />, color: '#B45309', render: () => <ReturnableContributions /> },

  // Receivables & obligations - what the Jamaat owes / is owed
  { slug: 'outstanding-loans', title: 'Outstanding QH Loans', group: 'Receivables & obligations',
    description: 'Active QH loans with non-zero balance. Overdue-first ordering for the recovery queue.',
    icon: <BankOutlined />, color: '#9333EA', render: () => <OutstandingLoans /> },
  { slug: 'pending-commitments', title: 'Pending Commitments', group: 'Receivables & obligations',
    description: 'Active commitments still owing money - paid/total instalments + next due date.',
    icon: <ClockCircleOutlined />, color: '#D97706', render: () => <PendingCommitments /> },
  { slug: 'overdue-returns', title: 'Overdue Returns', group: 'Receivables & obligations',
    description: 'Returnable receipts past maturity with non-zero outstanding - the cashier worklist.',
    icon: <WarningOutlined />, color: '#DC2626', render: () => <OverdueReturns /> },

  // Member-centric
  { slug: 'member-contribution', title: 'Member Contribution', group: 'Member-centric',
    description: 'Per-member receipt history with fund + period breakdown. One member at a time.',
    icon: <UserOutlined />, color: '#0E7490', render: () => <MemberContribution /> },
];

export function ReportsPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { reportSlug } = useParams<{ reportSlug?: string }>();

  // Sub-route mode - render the matching report inline. The card grid links to
  // /reports/<slug> so the user can bookmark or share a specific report.
  const active = REPORTS.find((r) => r.slug === reportSlug);
  if (active) {
    return (
      <div>
        <PageHeader title={active.title} subtitle={active.description}
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>All reports</Button>} />
        {active.render()}
      </div>
    );
  }

  // Landing - card grid grouped by purpose.
  const groups = Array.from(new Set(REPORTS.map((r) => r.group)));
  return (
    <div>
      <PageHeader title={t('nav.reports')}
        subtitle="Operational and financial reports. Each card opens a focused report - bookmark or share the URL." />
      {groups.map((g) => (
        <div key={g} style={{ marginBlockEnd: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--jm-gray-500)', marginBlockEnd: 10,
          }}>{g}</div>
          <Row gutter={[12, 12]}>
            {REPORTS.filter((r) => r.group === g).map((r) => (
              <Col key={r.slug} xs={24} sm={12} lg={8} xl={6}>
                <Link to={`/reports/${r.slug}`} style={{ textDecoration: 'none' }}>
                  <Card hoverable style={{ blockSize: '100%', border: '1px solid var(--jm-border)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{
                        inlineSize: 36, blockSize: 36, borderRadius: 8,
                        background: `${r.color}1A`, color: r.color,
                        display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
                      }}>{r.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--jm-gray-900, #1F2937)', marginBlockEnd: 4 }}>{r.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', lineHeight: 1.5 }}>{r.description}</div>
                      </div>
                    </div>
                  </Card>
                </Link>
              </Col>
            ))}
          </Row>
        </div>
      ))}
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

/// Subdued cell renderer for the per-mode breakdown columns - dashes-out zeros so the eye
/// jumps to the cells with actual money in them.
function ModeAmount({ v, cur }: { v: number; cur: string }) {
  if (!v) return <span style={{ color: 'var(--jm-gray-400)' }}>-</span>;
  return <span className="jm-tnum">{money(v, cur)}</span>;
}

function FundWise() {
  const { range, setRange, from, to } = useRange();
  const baseCurrency = useBaseCurrency();
  const { hasPermission } = useAuth();
  const [eventId, setEventId] = useState<string | undefined>();
  const [fundCategoryId, setFundCategoryId] = useState<string | undefined>();
  const eventsQ = useQuery({ queryKey: ['events', 'for-reports'], queryFn: () => eventsApi.list({ pageSize: 200 }) });
  const categoriesQ = useQuery({ queryKey: ['fund-categories', 'reports'], queryFn: () => fundCategoriesApi.list(true) });
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'fund', from, to, eventId, fundCategoryId],
    queryFn: () => reportsApi.fundWise(from, to, { eventId, fundCategoryId }),
  });
  const exportParams = {
    from, to,
    ...(eventId ? { eventId } : {}),
    ...(fundCategoryId ? { fundCategoryId } : {}),
  };
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
        <Select style={{ inlineSize: 220 }} placeholder="All categories" allowClear showSearch optionFilterProp="label"
          value={fundCategoryId} onChange={setFundCategoryId}
          options={(categoriesQ.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <Select style={{ inlineSize: 240 }} placeholder="All events / functions" allowClear showSearch optionFilterProp="label"
          value={eventId} onChange={setEventId}
          options={(eventsQ.data?.items ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/fund-wise.xlsx', exportParams, `fund-wise_${from}_${to}.xlsx`)} />}
      </div>
      <Table rowKey="fundTypeId" size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
        scroll={{ x: 1200 }}
        columns={[
          { title: 'Code', dataIndex: 'fundTypeCode', key: 'c', width: 110, fixed: 'left', render: (v: string) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</span> },
          { title: 'Fund', dataIndex: 'fundTypeName', key: 'n', width: 200, fixed: 'left' },
          { title: 'Lines', dataIndex: 'lineCount', key: 'lc', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
          { title: 'Total', dataIndex: 'amountTotal', key: 'amt', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, baseCurrency)}</span> },
          { title: 'Cash', dataIndex: 'amountCash', key: 'mc', align: 'right', width: 110, render: (v: number) => <ModeAmount v={v} cur={baseCurrency} /> },
          { title: 'Cheque', dataIndex: 'amountCheque', key: 'mq', align: 'right', width: 110, render: (v: number) => <ModeAmount v={v} cur={baseCurrency} /> },
          { title: 'Bank xfer', dataIndex: 'amountBankTransfer', key: 'mb', align: 'right', width: 110, render: (v: number) => <ModeAmount v={v} cur={baseCurrency} /> },
          { title: 'Card', dataIndex: 'amountCard', key: 'mca', align: 'right', width: 100, render: (v: number) => <ModeAmount v={v} cur={baseCurrency} /> },
          { title: 'Online', dataIndex: 'amountOnline', key: 'mo', align: 'right', width: 100, render: (v: number) => <ModeAmount v={v} cur={baseCurrency} /> },
          { title: 'UPI', dataIndex: 'amountUpi', key: 'mu', align: 'right', width: 100, render: (v: number) => <ModeAmount v={v} cur={baseCurrency} /> },
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
  // Member picker - fetch active members so the report can be run quickly. We don't lazy-search
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
          { title: 'Fund', dataIndex: 'fundName', key: 'fn', render: (v: string, row) => <span><strong>{row.fundCode}</strong> - {v}</span> },
          { title: 'Period', dataIndex: 'periodReference', key: 'pr', width: 120, render: (v?: string | null) => v ?? '-' },
          { title: 'Purpose', dataIndex: 'purpose', key: 'pu', render: (v?: string | null) => v ?? '-' },
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
          options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.nameEnglish}` }))} />
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
              Net strength subtracts the still-outstanding return obligation - that part of the cash is
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
          options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.nameEnglish}` }))} />
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/returnable-contributions.xlsx', fundTypeId ? { fundTypeId } : {}, `returnable-contributions_${new Date().toISOString().slice(0, 10)}.xlsx`)} />}
      </div>
      <Table rowKey={(r) => r.receiptId} size="middle" loading={isLoading} dataSource={data ?? []} pagination={{ pageSize: 25 }}
        columns={[
          { title: 'Receipt date', dataIndex: 'receiptDate', key: 'rd', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Receipt #', dataIndex: 'receiptNumber', key: 'rn', width: 130, render: (v?: string | null) => v ?? '-' },
          { title: 'Member', dataIndex: 'memberName', key: 'mn', render: (v: string, row) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.itsNumber}</span> · {v}</span> },
          { title: 'Fund', dataIndex: 'fundTypeName', key: 'f', render: (v: string, row) => `${row.fundTypeCode} - ${v}` },
          { title: 'Amount', dataIndex: 'amountTotal', key: 'a', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum">{money(v, row.currency)}</span> },
          { title: 'Returned', dataIndex: 'amountReturned', key: 'rt', align: 'right', width: 130, render: (v: number, row) => v ? <span className="jm-tnum" style={{ color: 'var(--jm-gray-700)' }}>{money(v, row.currency)}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Outstanding', dataIndex: 'amountReturnable', key: 'ob', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
          { title: 'Maturity', dataIndex: 'maturityDate', key: 'm', width: 120, render: (v: string | null, row) => v ? <span><span style={{ display: 'block' }}>{formatDate(v)}</span><Tag color={row.isMatured ? 'green' : 'gold'} style={{ margin: 0, fontSize: 11 }}>{row.isMatured ? 'Matured' : 'Not matured'}</Tag></span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Agreement', dataIndex: 'agreementReference', key: 'ag', width: 150, render: (v?: string | null) => v ? <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>{v}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
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
          { title: 'Receipt #', dataIndex: 'receiptNumber', key: 'rn', width: 120, render: (v?: string | null) => v ?? '-' },
          { title: 'ITS', dataIndex: 'itsNumber', key: 'its', width: 110, render: (v: string) => <span className="jm-tnum">{v}</span> },
          { title: 'Member', dataIndex: 'memberName', key: 'mn' },
          { title: 'Cheque #', dataIndex: 'chequeNumber', key: 'cn', width: 130, render: (v?: string | null) => v ? <span className="jm-tnum">{v}</span> : '-' },
          { title: 'Cheque date', dataIndex: 'chequeDate', key: 'cd', width: 120, render: (v?: string | null) => v ? formatDate(v) : '-' },
          { title: 'Bank', dataIndex: 'bankAccountName', key: 'b', render: (v?: string | null) => v ?? '-' },
          { title: 'Amount', dataIndex: 'amount', key: 'a', align: 'right', width: 140, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, row.currency)}</span> },
          { title: 'Status', dataIndex: 'status', key: 's', width: 110 },
        ]}
        locale={{ emptyText: <Empty description="No cheque receipts in this period" /> }}
      />
    </Card>
  );
}

/// Outstanding QH loan balances. Each row = one loan with non-zero outstanding amount.
/// Default sort puts loans with overdue instalments first so the recovery queue is at the top.
function OutstandingLoans() {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [status, setStatus] = useState<QhStatus | undefined>();
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'outstanding-loans', status, overdueOnly],
    queryFn: () => reportsApi.outstandingLoans({ status, overdueOnly }),
  });
  const params = {
    ...(status !== undefined ? { status: String(status) } : {}),
    ...(overdueOnly ? { overdueOnly: 'true' } : {}),
  };
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select style={{ inlineSize: 200 }} placeholder="All active statuses" allowClear
          value={status} onChange={(v) => setStatus(v)}
          options={[5, 6, 8].map((s) => ({ value: s, label: QhStatusLabel[s as QhStatus] }))} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Switch checked={overdueOnly} onChange={setOverdueOnly} size="small" />
          <span style={{ fontSize: 13 }}>Overdue only</span>
        </span>
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/outstanding-loans.xlsx', params, `outstanding-loans_${new Date().toISOString().slice(0, 10)}.xlsx`)} />}
      </div>
      <Table rowKey={(r) => r.loanId} size="middle" loading={isLoading} dataSource={data ?? []} pagination={{ pageSize: 25 }}
        columns={[
          { title: 'Loan #', dataIndex: 'code', key: 'code', width: 120, render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
          { title: 'Member', key: 'm', render: (_, row) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.memberItsNumber}</span> · {row.memberName}</span> },
          { title: 'Disbursed', dataIndex: 'amountDisbursed', key: 'd', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum">{money(v, row.currency)}</span> },
          { title: 'Repaid', dataIndex: 'amountRepaid', key: 'r', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ color: 'var(--jm-gray-700)' }}>{money(v, row.currency)}</span> },
          { title: 'Outstanding', dataIndex: 'amountOutstanding', key: 'o', align: 'right', width: 140, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
          { title: 'Progress', dataIndex: 'progressPercent', key: 'p', width: 100, render: (v: number) => <span className="jm-tnum">{v.toFixed(1)}%</span> },
          { title: 'Disbursed on', dataIndex: 'disbursedOn', key: 'do', width: 120, render: (v?: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Last payment', dataIndex: 'lastPaymentDate', key: 'lp', width: 120, render: (v?: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Age', dataIndex: 'ageDays', key: 'age', width: 80, render: (v?: number | null) => v != null ? <span className="jm-tnum">{v}d</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Inst', key: 'i', width: 90, render: (_, row) => <span className="jm-tnum">{row.installmentCount}</span> },
          { title: 'Overdue', dataIndex: 'overdueInstallments', key: 'ov', width: 90, render: (v: number) => v > 0 ? <Tag color="red" style={{ margin: 0 }}>{v}</Tag> : <span style={{ color: 'var(--jm-gray-400)' }}>0</span> },
          { title: 'Status', dataIndex: 'status', key: 's', width: 110, render: (v: number) => <Tag color={QhStatusColor[v as QhStatus]} style={{ margin: 0 }}>{QhStatusLabel[v as QhStatus]}</Tag> },
        ]}
        locale={{ emptyText: <Empty description="No outstanding loans" /> }}
      />
    </Card>
  );
}

/// Pending commitments - active or paused commitments that still owe money. Default sort
/// surfaces overdue commitments first; secondary sort by next-due-date so chasers can work
/// the list top-to-bottom in calendar order.
function PendingCommitments() {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [status, setStatus] = useState<CommitmentStatus | undefined>();
  const fundsQ = useQuery({ queryKey: ['fundTypes', 'all'], queryFn: () => fundTypesApi.list({ page: 1, pageSize: 200, active: true }) });
  const [fundTypeId, setFundTypeId] = useState<string | undefined>();
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'pending-commitments', status, fundTypeId, overdueOnly],
    queryFn: () => reportsApi.pendingCommitments({ status, fundTypeId, overdueOnly }),
  });
  const params = {
    ...(status !== undefined ? { status: String(status) } : {}),
    ...(fundTypeId ? { fundTypeId } : {}),
    ...(overdueOnly ? { overdueOnly: 'true' } : {}),
  };
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select style={{ inlineSize: 180 }} placeholder="Active + Paused" allowClear
          value={status} onChange={(v) => setStatus(v)}
          options={[1, 2, 5, 6].map((s) => ({ value: s, label: CommitmentStatusLabel[s as CommitmentStatus] }))} />
        <Select style={{ inlineSize: 280 }} placeholder="All funds" allowClear showSearch optionFilterProp="label"
          value={fundTypeId} onChange={setFundTypeId}
          options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.nameEnglish}` }))} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Switch checked={overdueOnly} onChange={setOverdueOnly} size="small" />
          <span style={{ fontSize: 13 }}>Overdue only</span>
        </span>
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/pending-commitments.xlsx', params, `pending-commitments_${new Date().toISOString().slice(0, 10)}.xlsx`)} />}
      </div>
      <Table rowKey={(r) => r.commitmentId} size="middle" loading={isLoading} dataSource={data ?? []} pagination={{ pageSize: 25 }}
        columns={[
          { title: 'Code', dataIndex: 'code', key: 'code', width: 110, render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
          { title: 'Party', key: 'p', render: (_, row) => (
            <span>{row.partyName}
              <span style={{ display: 'block', fontSize: 11, color: 'var(--jm-gray-500)' }} className="jm-tnum">
                {row.memberItsNumber ?? row.familyCode ?? '-'}
              </span>
            </span>
          ) },
          { title: 'Fund', dataIndex: 'fundTypeName', key: 'f', render: (v: string, row) => `${row.fundTypeCode} - ${v}` },
          { title: 'Total', dataIndex: 'totalAmount', key: 't', align: 'right', width: 120, render: (v: number, row) => <span className="jm-tnum">{money(v, row.currency)}</span> },
          { title: 'Paid', dataIndex: 'paidAmount', key: 'pd', align: 'right', width: 120, render: (v: number, row) => <span className="jm-tnum" style={{ color: 'var(--jm-gray-700)' }}>{money(v, row.currency)}</span> },
          { title: 'Remaining', dataIndex: 'remainingAmount', key: 'r', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
          { title: 'Inst (paid/total)', key: 'inst', width: 130, render: (_, row) => <span className="jm-tnum">{row.paidInstallments}/{row.installmentCount}</span> },
          { title: 'Overdue', dataIndex: 'overdueInstallments', key: 'ov', width: 90, render: (v: number) => v > 0 ? <Tag color="red" style={{ margin: 0 }}>{v}</Tag> : <span style={{ color: 'var(--jm-gray-400)' }}>0</span> },
          { title: 'Next due', dataIndex: 'nextDueDate', key: 'nd', width: 120, render: (v?: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Status', dataIndex: 'status', key: 's', width: 110, render: (v: number) => <Tag color={CommitmentStatusColor[v as CommitmentStatus]} style={{ margin: 0 }}>{CommitmentStatusLabel[v as CommitmentStatus]}</Tag> },
        ]}
        locale={{ emptyText: <Empty description="No pending commitments" /> }}
      />
    </Card>
  );
}

/// Returnable receipts past their maturity date with non-zero outstanding balance. The
/// "exit door is open but money hasn't gone out yet" worklist - tells the cashier exactly
/// which contributors are owed money the Jamaat is sitting on.
function OverdueReturns() {
  const fundsQ = useQuery({ queryKey: ['fundTypes', 'all'], queryFn: () => fundTypesApi.list({ page: 1, pageSize: 200, active: true }) });
  const [fundTypeId, setFundTypeId] = useState<string | undefined>();
  const [minDays, setMinDays] = useState<number | null>(null);
  const { hasPermission } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['rpt', 'overdue-returns', fundTypeId, minDays],
    queryFn: () => reportsApi.overdueReturns({ fundTypeId, minDaysOverdue: minDays ?? undefined }),
  });
  const params = {
    ...(fundTypeId ? { fundTypeId } : {}),
    ...(minDays ? { minDaysOverdue: String(minDays) } : {}),
  };
  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select style={{ inlineSize: 280 }} placeholder="All funds" allowClear showSearch optionFilterProp="label"
          value={fundTypeId} onChange={setFundTypeId}
          options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.nameEnglish}` }))} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Min days overdue
          <InputNumber size="small" min={0} value={minDays} onChange={(v) => setMinDays(v ?? null)} style={{ inlineSize: 80 }} />
        </span>
        <div style={{ flex: 1 }} />
        {hasPermission('reports.export') && <ExportButton onClick={() => downloadXlsx('/api/v1/reports/overdue-returns.xlsx', params, `overdue-returns_${new Date().toISOString().slice(0, 10)}.xlsx`)} />}
      </div>
      <Table rowKey={(r) => r.receiptId} size="middle" loading={isLoading} dataSource={data ?? []} pagination={{ pageSize: 25 }}
        columns={[
          { title: 'Receipt #', dataIndex: 'receiptNumber', key: 'rn', width: 130, render: (v?: string | null) => v ? <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> : '-' },
          { title: 'Receipt date', dataIndex: 'receiptDate', key: 'rd', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Member', key: 'm', render: (_, row) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.itsNumber}</span> · {row.memberName}</span> },
          { title: 'Fund', dataIndex: 'fundTypeName', key: 'f', render: (v: string, row) => `${row.fundTypeCode} - ${v}` },
          { title: 'Amount', dataIndex: 'amountTotal', key: 'a', align: 'right', width: 120, render: (v: number, row) => <span className="jm-tnum">{money(v, row.currency)}</span> },
          { title: 'Returned', dataIndex: 'amountReturned', key: 'rt', align: 'right', width: 120, render: (v: number, row) => v ? <span className="jm-tnum" style={{ color: 'var(--jm-gray-700)' }}>{money(v, row.currency)}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Outstanding', dataIndex: 'amountOutstanding', key: 'o', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600, color: '#92400E' }}>{money(v, row.currency)}</span> },
          { title: 'Maturity', dataIndex: 'maturityDate', key: 'md', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Days overdue', dataIndex: 'daysOverdue', key: 'do', width: 110, render: (v: number) => <Tag color={v > 30 ? 'red' : 'gold'} style={{ margin: 0 }} className="jm-tnum">{v}</Tag> },
          { title: 'Agreement', dataIndex: 'agreementReference', key: 'ag', width: 140, render: (v?: string | null) => v ? <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>{v}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
        ]}
        locale={{ emptyText: <Empty description="No matured-but-not-returned contributions" /> }}
      />
    </Card>
  );
}
