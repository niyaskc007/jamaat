import { useState } from 'react';
import { Card, Row, Col, Empty, Tag, Table, Button, Spin, Progress, Alert, Select, Space, Descriptions } from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, BarChartOutlined, DashboardOutlined,
  TeamOutlined, SafetyOutlined, ClockCircleOutlined, ThunderboltOutlined,
  CheckCircleOutlined, RiseOutlined, FallOutlined, WarningOutlined, StopOutlined,
  AuditOutlined, BugOutlined, FileSearchOutlined, FileTextOutlined, UserAddOutlined,
  UserOutlined, SafetyCertificateOutlined, PercentageOutlined,
  HourglassOutlined, ContainerOutlined, InfoCircleOutlined,
  CalendarOutlined, FileDoneOutlined, HomeOutlined, GoldOutlined,
  CarryOutOutlined, CreditCardOutlined, UsergroupAddOutlined, AppstoreOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip, Legend,
} from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { money, formatDate } from '../../shared/format/format';
import { dashboardApi } from '../ledger/ledgerApi';
import { useAuth } from '../../shared/auth/useAuth';
import { DashboardFilterBar, useDashboardFilters, filtersToMonths, filtersToDays, downloadDashboardXlsx } from './DashboardFilterBar';
import { UserHoverCard } from '../../shared/ui/UserHoverCard';

/// Compact `yyyymmdd` filename stamp used for XLSX exports. Local time is fine here â€” the
/// suffix is just a uniqueness/freshness hint, not data.
function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/// Catalog of every dashboard in the system. The card-grid landing iterates this list and
/// the slug routes (/dashboards/:slug) render the matching component. New dashboards land
/// here once and they show up everywhere.
type DashSlug =
  | 'operations' | 'treasury' | 'reliability'
  | 'qh-portfolio' | 'receivables' | 'member-engagement' | 'compliance'
  | 'events' | 'cheques' | 'families' | 'fund-enrollments'
  | 'cashflow' | 'qh-funnel' | 'commitment-types'
  | 'vouchers' | 'receipts' | 'member-assets' | 'sectors' | 'returnables'
  | 'notifications' | 'user-activity'
  | 'change-requests' | 'expense-types' | 'periods' | 'annual-summary'
  | 'reconciliation';

type DashEntry = {
  slug: DashSlug;
  title: string;
  group: 'Operations' | 'Financial' | 'Insight';
  description: string;
  icon: React.ReactNode;
  color: string;
  /// External dashboards open at their own URL (e.g. /accounting), inline ones render via `render`.
  href?: string;
  render?: () => React.ReactNode;
  /// Optional auth gate - if the current user lacks all of these the card is hidden.
  needsAny?: string[];
};

const DASHBOARDS: DashEntry[] = [
  // Operations
  {
    slug: 'operations', title: 'Operations', group: 'Operations',
    description: "Today's collection, pending approvals, recent activity. The cashier and approver home.",
    icon: <DashboardOutlined />, color: '#0E5C40',
    href: '/dashboard',
  },
  {
    slug: 'member-engagement', title: 'Member engagement', group: 'Operations',
    description: 'Member status, verification breakdown, new-member trend over the last year.',
    icon: <TeamOutlined />, color: '#0E7490',
    needsAny: ['member.view'],
    render: () => <MemberEngagementDashboard />,
  },
  {
    slug: 'events', title: 'Events', group: 'Operations',
    description: 'Registrations mix, fill rates, top events, monthly trend, and upcoming-events list.',
    icon: <CalendarOutlined />, color: '#0E5C40',
    needsAny: ['event.view'],
    render: () => <EventsDashboard />,
  },
  {
    slug: 'families', title: 'Families', group: 'Operations',
    description: 'Family size distribution, growth trend, top contributors, largest families.',
    icon: <HomeOutlined />, color: '#0E7490',
    needsAny: ['family.view'],
    render: () => <FamiliesDashboard />,
  },

  // Financial
  {
    slug: 'treasury', title: 'Treasury', group: 'Financial',
    description: 'Income vs expense trend, top contributors, voucher categories - the accounting home.',
    icon: <BarChartOutlined />, color: '#7C3AED',
    href: '/accounting',
    needsAny: ['accounting.view'],
  },
  {
    slug: 'qh-portfolio', title: 'QH portfolio', group: 'Financial',
    description: 'Loan status mix, repayment trend, top borrowers by outstanding, upcoming installments.',
    icon: <BankOutlined />, color: '#9333EA',
    needsAny: ['qh.view'],
    render: () => <QhPortfolioDashboard />,
  },
  {
    slug: 'receivables', title: 'Receivables aging', group: 'Financial',
    description: 'Aging buckets across pending commitments + matured returnables. The recovery worklist.',
    icon: <ClockCircleOutlined />, color: '#D97706',
    needsAny: ['reports.view'],
    render: () => <ReceivablesAgingDashboard />,
  },
  {
    slug: 'cheques', title: 'Cheques portfolio', group: 'Financial',
    description: 'Status mix, top banks, 12-week maturity timeline, recent bounces, top pledgers.',
    icon: <CreditCardOutlined />, color: '#7C3AED',
    needsAny: ['accounting.view'],
    render: () => <ChequesDashboard />,
  },
  {
    slug: 'fund-enrollments', title: 'Fund enrollments', group: 'Financial',
    description: 'Status mix, recurrence breakdown, by-fund-type ranking, monthly enrollment trend.',
    icon: <AppstoreOutlined />, color: '#0E7490',
    needsAny: ['enrollment.view'],
    render: () => <FundEnrollmentsDashboard />,
  },
  {
    slug: 'cashflow', title: 'Cashflow', group: 'Financial',
    description: 'Inflows vs outflows over the last 90 days, daily curve, top funds + voucher categories, mode mix.',
    icon: <FallOutlined />, color: '#0E5C40',
    needsAny: ['accounting.view'],
    render: () => <CashflowDashboard />,
  },
  {
    slug: 'qh-funnel', title: 'QH funnel', group: 'Financial',
    description: 'Loan requests vs approvals vs disbursements vs repayments. Approval rate, available pool, top borrowers.',
    icon: <BankOutlined />, color: '#7C3AED',
    needsAny: ['qh.view'],
    render: () => <QhFunnelDashboard />,
  },
  {
    slug: 'commitment-types', title: 'Commitment types', group: 'Financial',
    description: 'Per-template performance: counts, committed, paid, completion %, default rate. By-fund breakdown.',
    icon: <FileDoneOutlined />, color: '#D97706',
    needsAny: ['reports.view'],
    render: () => <CommitmentTypesDashboard />,
  },
  {
    slug: 'vouchers', title: 'Vouchers', group: 'Financial',
    description: 'Voucher status mix, payment-mode mix, top payees and purposes, daily outflow curve.',
    icon: <FileTextOutlined />, color: '#7C3AED',
    needsAny: ['accounting.view'],
    render: () => <VouchersDashboard />,
  },
  {
    slug: 'receipts', title: 'Receipts', group: 'Financial',
    description: 'Inflow analysis: payment mode, intention split, top contributors, daily curve. Filter by fund.',
    icon: <RiseOutlined />, color: '#0E5C40',
    needsAny: ['accounting.view'],
    render: () => <ReceiptsDashboard />,
  },
  {
    slug: 'returnables', title: 'Returnables', group: 'Financial',
    description: 'Returnable receipts portfolio - issued vs returned, age buckets, maturity timeline, top holders.',
    icon: <ContainerOutlined />, color: '#D97706',
    needsAny: ['accounting.view'],
    render: () => <ReturnablesDashboard />,
  },
  {
    slug: 'member-assets', title: 'Member assets', group: 'Insight',
    description: 'Asset portfolio: total estimated value, by kind, top members, sector distribution.',
    icon: <GoldOutlined />, color: '#9333EA',
    needsAny: ['member.view'],
    render: () => <MemberAssetsDashboard />,
  },
  {
    slug: 'sectors', title: 'Sectors', group: 'Insight',
    description: 'Per-sector member counts, contributions YTD, family/commitment counts, asset value.',
    icon: <TeamOutlined />, color: '#0E7490',
    needsAny: ['member.view'],
    render: () => <SectorsDashboard />,
  },
  {
    slug: 'notifications', title: 'Notifications', group: 'Insight',
    description: 'Sent vs failed vs skipped, channel mix, kind mix, daily volume, top failure reasons.',
    icon: <AuditOutlined />, color: '#0E7490',
    needsAny: ['admin.audit'],
    render: () => <NotificationsDashboard />,
  },
  {
    slug: 'user-activity', title: 'User activity', group: 'Insight',
    description: 'Admin audit events: top users, action mix, hour-of-day heatmap, top entities touched.',
    icon: <FileSearchOutlined />, color: '#475569',
    needsAny: ['admin.audit'],
    render: () => <UserActivityDashboard />,
  },
  {
    slug: 'change-requests', title: 'Change requests', group: 'Insight',
    description: 'Member profile change-request queue. Pending volume, by section, by requester, oldest open.',
    icon: <FileSearchOutlined />, color: '#D97706',
    needsAny: ['member.view'],
    render: () => <ChangeRequestsDashboard />,
  },
  {
    slug: 'expense-types', title: 'Expense types', group: 'Financial',
    description: 'Per-category voucher outflow analysis: usage, totals, average, last-used. 12-month trend.',
    icon: <FallOutlined />, color: '#DC2626',
    needsAny: ['accounting.view'],
    render: () => <ExpenseTypesDashboard />,
  },
  {
    slug: 'periods', title: 'Periods', group: 'Financial',
    description: 'Financial period management - status, age, draft/pending checklist, ready-to-close signal.',
    icon: <ClockCircleOutlined />, color: '#7C3AED',
    needsAny: ['accounting.view'],
    render: () => <PeriodsDashboard />,
  },
  {
    slug: 'annual-summary', title: 'Annual summary', group: 'Financial',
    description: 'Year-over-year income vs expense, by-fund roll-up, by voucher purpose. Excel-ready.',
    icon: <BarChartOutlined />, color: '#0E5C40',
    needsAny: ['reports.view'],
    render: () => <AnnualSummaryDashboard />,
  },
  {
    slug: 'reconciliation', title: 'Reconciliation', group: 'Financial',
    description: 'Bank accounts + COA balances. Stale-account flags + ready-to-close signal for month-end close.',
    icon: <SafetyCertificateOutlined />, color: '#9333EA',
    needsAny: ['accounting.view'],
    render: () => <ReconciliationDashboard />,
  },

  // Insight
  {
    slug: 'reliability', title: 'Reliability', group: 'Insight',
    description: 'Cross-member behavior overview - grade distribution, top reliable, members needing outreach.',
    icon: <ThunderboltOutlined />, color: '#0E5C40',
    href: '/admin/reliability',
    needsAny: ['admin.reliability'],
  },
  {
    slug: 'compliance', title: 'Compliance + audit', group: 'Insight',
    description: 'Audit volume, open errors, pending change requests, voucher approvals + draft receipts.',
    icon: <SafetyOutlined />, color: '#DC2626',
    needsAny: ['admin.audit'],
    render: () => <ComplianceDashboard />,
  },
];

export function DashboardsPage() {
  const navigate = useNavigate();
  const { dashSlug } = useParams<{ dashSlug?: string }>();
  const { hasPermission } = useAuth();

  const visible = DASHBOARDS.filter((d) =>
    !d.needsAny || d.needsAny.length === 0 || d.needsAny.some((p) => hasPermission(p)));

  const active = visible.find((d) => d.slug === dashSlug);
  if (active) {
    if (active.href && !active.render) {
      // Card was clicked but it's an external one - send the user there. Defensive only;
      // the landing page links to href directly so we shouldn't normally get here.
      navigate(active.href, { replace: true });
      return null;
    }
    return (
      <div>
        <PageHeader title={active.title} subtitle={active.description}
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>All dashboards</Button>} />
        {active.render?.()}
      </div>
    );
  }

  const groups: DashEntry['group'][] = ['Operations', 'Financial', 'Insight'];
  return (
    <div>
      <PageHeader title="Dashboards"
        subtitle="A focused dashboard for each part of the system. Bookmark or share the URL." />
      {groups.map((g) => {
        const list = visible.filter((d) => d.group === g);
        if (list.length === 0) return null;
        return (
          <div key={g} style={{ marginBlockEnd: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--jm-gray-500)', marginBlockEnd: 10,
            }}>{g}</div>
            <Row gutter={[12, 12]}>
              {list.map((d) => {
                const linkTo = d.href ?? `/dashboards/${d.slug}`;
                return (
                  <Col key={d.slug} xs={24} sm={12} lg={8} xl={6}>
                    <Link to={linkTo} style={{ textDecoration: 'none' }}>
                      <Card hoverable style={{ blockSize: '100%', border: '1px solid var(--jm-border)' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <span style={{
                            inlineSize: 36, blockSize: 36, borderRadius: 8,
                            background: `${d.color}1A`, color: d.color,
                            display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
                          }}>{d.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--jm-gray-900, #1F2937)', marginBlockEnd: 4 }}>{d.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', lineHeight: 1.5 }}>{d.description}</div>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  </Col>
                );
              })}
            </Row>
          </div>
        );
      })}
    </div>
  );
}

// -- Shared chart palette ----------------------------------------------------

const PIE_COLORS = ['#0E5C40', '#7C3AED', '#0E7490', '#D97706', '#DC2626', '#9333EA', '#475569'];

/// Accent palette - reused across dashboards so the same semantic always carries the same colour.
/// All hex values: positive = green, financial = purple, attention = amber, problem = red, neutral = slate.
const ACCENT = {
  positive: '#0E5C40',
  financial: '#7C3AED',
  cyan: '#0E7490',
  caution: '#D97706',
  danger: '#DC2626',
  neutral: '#475569',
} as const;

// -- QH Portfolio ------------------------------------------------------------

function QhPortfolioDashboard() {
  const q = useQuery({ queryKey: ['dash', 'qh-portfolio'], queryFn: dashboardApi.qhPortfolio });
  if (q.isLoading || !q.data) {
    return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  }
  const d = q.data;
  const trendData = d.repaymentTrend.map((p) => ({
    label: `${new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' })}`,
    Disbursed: p.disbursed, Repaid: p.repaid,
  }));

  const isEmpty = d.totalLoans === 0;

  return (
    <div>
      {isEmpty && (
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="No Qarzan Hasana loans yet"
          description="The lifecycle metrics, repayment trend, and borrower tables populate as loans are sanctioned and disbursed. Create a loan from the Qarzan Hasana module to start tracking."
          style={{ marginBlockEnd: 16 }}
        />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Total loans" value={d.totalLoans} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FallOutlined />} label="Disbursed" value={d.totalDisbursed} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Repaid" value={d.totalRepaid} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Outstanding" value={d.totalOutstanding} currency={d.currency} accent={ACCENT.caution} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<ThunderboltOutlined />} label="Active" value={d.activeCount} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Completed" value={d.completedCount} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Defaulted" value={d.defaultedCount} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Default rate" value={d.defaultRatePercent} format="number" suffix="%" accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Status distribution" size="small" className="jm-card">
            {d.byStatus.length === 0 ? <Empty description="No loans yet" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={d.byStatus} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} label>
                    {d.byStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Repayment trend (last 12 months)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                <Legend />
                <Line type="monotone" dataKey="Disbursed" stroke="#7C3AED" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Repaid" stroke="#0E5C40" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top borrowers by outstanding" size="small" className="jm-card">
            <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topBorrowers}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> Â· {r.fullName}</span> },
                { title: 'Loans', dataIndex: 'loanCount', key: 'l', align: 'right', width: 70, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Outstanding', dataIndex: 'outstanding', key: 'o', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No outstanding loans" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Upcoming installments (next 30 days)" size="small" className="jm-card">
            <Table rowKey={(r) => `${r.loanId}-${r.installmentNo}`} size="small" pagination={false} dataSource={d.upcomingInstallments}
              columns={[
                { title: 'Loan', dataIndex: 'loanCode', key: 'lc', width: 120, render: (v: string, row) => <Link to={`/qarzan-hasana/${row.loanId}`} className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</Link> },
                { title: 'Member', dataIndex: 'memberName', key: 'mn' },
                { title: 'Inst #', dataIndex: 'installmentNo', key: 'in', align: 'right', width: 70 },
                { title: 'Due', dataIndex: 'dueDate', key: 'd', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Amount', dataIndex: 'remainingAmount', key: 'a', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No installments due in the next 30 days" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Receivables Aging -------------------------------------------------------

function ReceivablesAgingDashboard() {
  const q = useQuery({ queryKey: ['dash', 'receivables-aging'], queryFn: dashboardApi.receivablesAging });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const isEmpty = d.commitmentsOutstanding === 0 && d.returnablesOutstanding === 0
    && d.commitmentsOverdueCount === 0 && d.returnablesOverdueCount === 0;

  return (
    <div>
      {isEmpty && (
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="No outstanding receivables"
          description="Aging buckets and the worklist appear once commitments are accepted with installment schedules, or once returnable receipts mature. Nothing is overdue right now."
          style={{ marginBlockEnd: 16 }}
        />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Commitments outstanding" value={d.commitmentsOutstanding} currency={d.currency} accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Overdue commitment installments" value={d.commitmentsOverdueCount} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ContainerOutlined />} label="Returnables outstanding" value={d.returnablesOutstanding} currency={d.currency} accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Overdue returnables" value={d.returnablesOverdueCount} format="number" accent={ACCENT.danger} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Commitment aging" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.commitmentBuckets}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any, name: any) => name === 'amount' ? money(Number(v) || 0, d.currency) : (v as number | string)} />
                <Bar dataKey="count" fill="#0E5C40" name="Installments" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Returnables aging" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.returnableBuckets}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any, name: any) => name === 'amount' ? money(Number(v) || 0, d.currency) : (v as number | string)} />
                <Bar dataKey="count" fill="#D97706" name="Receipts" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="10 oldest open obligations" size="small" className="jm-card">
            <Table rowKey={(r, i) => `${r.kind}-${r.reference}-${i}`} size="small" pagination={false} dataSource={d.oldestObligations}
              columns={[
                { title: 'Kind', dataIndex: 'kind', key: 'k', width: 110, render: (v: string) => <Tag color={v === 'Commitment' ? 'gold' : 'volcano'} style={{ margin: 0 }}>{v}</Tag> },
                { title: 'Reference', dataIndex: 'reference', key: 'r', width: 130, render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
                { title: 'Member', dataIndex: 'memberName', key: 'm' },
                { title: 'Due / matured', dataIndex: 'dueDate', key: 'd', width: 130, render: (v: string) => formatDate(v) },
                { title: 'Days overdue', dataIndex: 'daysOverdue', key: 'do', width: 110, render: (v: number) => <Tag color={v > 30 ? 'red' : 'gold'} style={{ margin: 0 }} className="jm-tnum">{v}</Tag> },
                { title: 'Amount', dataIndex: 'amount', key: 'a', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No overdue obligations" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Member Engagement -------------------------------------------------------

function MemberEngagementDashboard() {
  const q = useQuery({ queryKey: ['dash', 'member-engagement'], queryFn: () => dashboardApi.memberEngagement(12) });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const statusData = [
    { name: 'Active', value: d.activeMembers },
    { name: 'Inactive', value: d.inactiveMembers },
    { name: 'Deceased', value: d.deceasedMembers },
    { name: 'Suspended', value: d.suspendedMembers },
  ].filter((x) => x.value > 0);
  const verifData = [
    { name: 'Verified', value: d.verifiedMembers },
    { name: 'Pending', value: d.verificationPendingMembers },
    { name: 'Not started', value: d.verificationNotStartedMembers },
    { name: 'Rejected', value: d.verificationRejectedMembers },
  ].filter((x) => x.value > 0);
  const trendData = d.newMemberTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Members: p.count,
  }));
  const verifiedPct = d.totalMembers === 0 ? 0 : Math.round(d.verifiedMembers * 100 / d.totalMembers);

  const isEmpty = d.totalMembers === 0;

  return (
    <div>
      {isEmpty && (
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="No members yet"
          description="The status pies, verification chart, and growth trend populate as members are added or imported. Start from the Members module."
          style={{ marginBlockEnd: 16 }}
        />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<TeamOutlined />} label="Total members" value={d.totalMembers} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UserOutlined />} label="Active" value={d.activeMembers} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UserAddOutlined />} label="New this month" value={d.newThisMonth} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ boxShadow: 'var(--jm-shadow-1)', border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 20 } }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center',
                background: `color-mix(in srgb, ${ACCENT.positive} 12%, transparent)`,
                color: ACCENT.positive, fontSize: 18, flexShrink: 0,
              }}>
                <SafetyCertificateOutlined />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', fontWeight: 500, marginBlockEnd: 4 }}>Verified</div>
                <Progress percent={verifiedPct} strokeColor={ACCENT.positive} size="small" />
                <div className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>{d.verifiedMembers} / {d.totalMembers}</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="New members per month (last 12)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Members" stroke="#0E7490" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="Member status" size="small" className="jm-card">
            {statusData.length === 0 ? <Empty description="No members" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="Verification status" size="small" className="jm-card">
            {verifData.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={verifData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {verifData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Compliance + Audit ------------------------------------------------------

function ComplianceDashboard() {
  const q = useQuery({ queryKey: ['dash', 'compliance'], queryFn: dashboardApi.compliance });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const trendData = d.auditTrend30d.map((p) => ({
    label: p.date.slice(5),
    Events: p.count,
  }));

  const isEmpty = d.auditEvents30d === 0 && d.openErrors === 0 && d.pendingChangeRequests === 0
    && d.pendingVoucherApprovals === 0 && d.draftReceipts === 0;

  return (
    <div>
      {isEmpty && (
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="No compliance items pending"
          description="The audit-volume chart, error severity breakdown, and approval queues populate as activity flows through the system. Nothing requires attention right now."
          style={{ marginBlockEnd: 16 }}
        />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<AuditOutlined />} label="Audit events (30d)" value={d.auditEvents30d} format="number" accent={ACCENT.neutral} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<BugOutlined />} label="Open errors" value={d.openErrors} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FileSearchOutlined />} label="Pending change requests" value={d.pendingChangeRequests} format="number" accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Pending voucher approvals" value={d.pendingVoucherApprovals} format="number" accent={ACCENT.caution} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Draft receipts" value={d.draftReceipts} format="number" accent={ACCENT.neutral} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UserOutlined />} label="Unverified members" value={d.unverifiedMembers} format="number" accent={ACCENT.neutral} /></Col>
        <Col xs={12} md={12}>
          <Card size="small" className="jm-card">
            <div style={{ fontSize: 14, color: 'var(--jm-gray-500)', marginBlockEnd: 6 }}>Open financial period</div>
            {d.hasOpenPeriod ? (
              <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>{d.openPeriodName}</Tag>
            ) : (
              <Tag color="red" style={{ fontSize: 14, padding: '4px 12px' }}>No open period</Tag>
            )}
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
              {d.hasOpenPeriod ? 'Postings will land in this period.' : 'Open a period from Accounting to allow postings.'}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Audit volume (last 30 days)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="Events" fill="#475569" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="Errors by severity" size="small" className="jm-card">
            {d.errorsBySeverity.length === 0 ? <Empty description="No open errors" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.errorsBySeverity} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.errorsBySeverity.map((_, i) => <Cell key={i} fill={['#94A3B8', '#D97706', '#DC2626', '#7F1D1D'][i % 4]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="Change requests" size="small" className="jm-card">
            {d.changeRequestsByStatus.length === 0 ? <Empty description="No change requests" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.changeRequestsByStatus} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.changeRequestsByStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Events ------------------------------------------------------------------

function EventsDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const months = filtersToMonths(filters, 12);
  const q = useQuery({
    queryKey: ['dash', 'events', months],
    queryFn: () => dashboardApi.events(months),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const trendData = d.registrationTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Registrations: p.count,
  }));
  const isEmpty = d.totalEvents === 0 && d.totalRegistrations === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="12m" />
      <div style={{ blockSize: 12 }} />
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No events yet"
          description="Once events are created and members start registering, this dashboard fills in with status mix, fill rates, and upcoming-event roll-ups."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<CalendarOutlined />} label="Total events" value={d.totalEvents} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Upcoming" value={d.upcomingEvents} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UsergroupAddOutlined />} label="Registrations" value={d.totalRegistrations} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Avg fill" value={d.averageFillPercent} format="number" suffix="%" accent={ACCENT.caution} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Confirmed" value={d.confirmedRegistrations} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CarryOutOutlined />} label="Checked in" value={d.checkedInRegistrations} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Cancelled" value={d.cancelledRegistrations} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UserAddOutlined />} label="New this month" value={d.registrationsThisMonth} format="number" accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Registrations per month (last 12)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Registrations" stroke={ACCENT.financial} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="By status" size="small" className="jm-card">
            {d.registrationsByStatus.length === 0 ? <Empty description="No registrations" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.registrationsByStatus} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.registrationsByStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="By category" size="small" className="jm-card">
            {d.eventsByCategory.length === 0 ? <Empty description="No events" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.eventsByCategory} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.eventsByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top events by registrations" size="small" className="jm-card">
            <Table rowKey="eventId" size="small" pagination={false} dataSource={d.topEvents}
              columns={[
                { title: 'Event', key: 'n', render: (_, r) => <Link to={`/dashboards/events/${r.eventId}`}>{r.name}</Link> },
                { title: 'Date', dataIndex: 'eventDate', key: 'd', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Regs', dataIndex: 'registrationCount', key: 'r', align: 'right', width: 70, render: (v: number) => <span className="jm-tnum">{v}</span> },
                {
                  title: 'Fill', dataIndex: 'fillPercent', key: 'f', align: 'right', width: 100,
                  render: (v: number, row) => row.capacity == null
                    ? <span style={{ color: 'var(--jm-gray-400)' }}>â€”</span>
                    : <Tag color={v >= 90 ? 'red' : v >= 60 ? 'gold' : 'green'} className="jm-tnum" style={{ margin: 0 }}>{v}%</Tag>,
                },
              ]}
              locale={{ emptyText: <Empty description="No events" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Upcoming events" size="small" className="jm-card">
            <Table rowKey="eventId" size="small" pagination={false} dataSource={d.upcomingEventsList}
              columns={[
                { title: 'Event', key: 'n', render: (_, r) => <Link to={`/dashboards/events/${r.eventId}`}>{r.name}</Link> },
                { title: 'Date', dataIndex: 'eventDate', key: 'd', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Category', dataIndex: 'category', key: 'c', width: 110, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
                { title: 'Regs', dataIndex: 'registrationCount', key: 'r', align: 'right', width: 70, render: (v: number) => <span className="jm-tnum">{v}</span> },
              ]}
              locale={{ emptyText: <Empty description="No upcoming events" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Cheques portfolio -------------------------------------------------------

function ChequesDashboard() {
  const q = useQuery({ queryKey: ['dash', 'cheques'], queryFn: dashboardApi.cheques });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const timelineData = d.maturityTimeline.map((w) => ({
    label: w.weekStart.slice(5),
    Cheques: w.count,
    Amount: w.amount,
  }));
  const isEmpty = d.totalCheques === 0;

  return (
    <div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No post-dated cheques"
          description="Status mix, bank distribution, and the maturity timeline appear once cheques are pledged against commitments, receipts, or vouchers."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<CreditCardOutlined />} label="Total cheques" value={d.totalCheques} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Pledged" value={d.pledgedAmount} currency={d.currency} accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FileDoneOutlined />} label="Cleared" value={d.clearedAmount} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Bounced (90d)" value={d.bouncedAmount} currency={d.currency} accent={ACCENT.danger} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Overdue deposit" value={d.overdueDepositCount} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Maturing (12w)" value={d.upcomingMaturityCount} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Maturing value" value={d.upcomingMaturityAmount} currency={d.currency} accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Cancelled" value={d.cancelledCount} format="number" accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="12-week maturity timeline" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={timelineData}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip formatter={(v: any, name: any) => name === 'Amount' ? money(Number(v) || 0, d.currency) : (v as number | string)} />
                <Legend />
                <Bar dataKey="Cheques" fill={ACCENT.financial} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="Status mix" size="small" className="jm-card">
            {d.statusMix.length === 0 ? <Empty description="No cheques" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.statusMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.statusMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="By bank (top 8)" size="small" className="jm-card">
            {d.byBank.length === 0 ? <Empty description="No cheques" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byBank} layout="vertical" margin={{ left: 50 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={70} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top pledgers" size="small" className="jm-card">
            <Table rowKey={(r) => r.memberId ?? r.memberName} size="small" pagination={false} dataSource={d.topPledgers}
              columns={[
                { title: 'Member', dataIndex: 'memberName', key: 'm' },
                { title: 'Cheques', dataIndex: 'chequeCount', key: 'c', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Total', dataIndex: 'totalAmount', key: 't', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No pledgers" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Recent bounces" size="small" className="jm-card">
            <Table rowKey="chequeId" size="small" pagination={false} dataSource={d.recentBounces}
              columns={[
                { title: 'Cheque #', dataIndex: 'chequeNumber', key: 'cn', width: 110, render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
                { title: 'Member', dataIndex: 'memberName', key: 'm' },
                { title: 'Bank', dataIndex: 'drawnOnBank', key: 'b', width: 100 },
                { title: 'Bounced', dataIndex: 'bouncedOn', key: 'bo', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Amount', dataIndex: 'amount', key: 'a', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No bounces" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Families ----------------------------------------------------------------

function FamiliesDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const months = filtersToMonths(filters, 12);
  const q = useQuery({
    queryKey: ['dash', 'families', months],
    queryFn: () => dashboardApi.families(months),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const trendData = d.newFamiliesTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Families: p.count,
  }));
  const isEmpty = d.totalFamilies === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="12m" />
      <div style={{ blockSize: 12 }} />
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No families yet"
          description="The family-size buckets, growth trend, and contribution leaderboard fill in once families are created and members are linked."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<HomeOutlined />} label="Total families" value={d.totalFamilies} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Active" value={d.activeFamilies} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UsergroupAddOutlined />} label="Linked members" value={d.totalLinkedMembers} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Avg size" value={d.averageFamilySize} format="number" accent={ACCENT.caution} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<UserOutlined />} label="With head" value={d.familiesWithHead} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Without head" value={d.familiesWithoutHead} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="With YTD contrib" value={d.familiesWithContributionsYtd} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="YTD total" value={d.totalContributionsYtd} currency={d.currency} accent={ACCENT.financial} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="New families per month (last 12)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Families" stroke={ACCENT.cyan} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Family size distribution" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.sizeBuckets}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="count" fill={ACCENT.financial} name="Families" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top families by contribution (YTD)" size="small" className="jm-card">
            <Table rowKey="familyId" size="small" pagination={false} dataSource={d.topFamiliesByContribution}
              columns={[
                { title: 'Family', key: 'f', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.code}</span> Â· {r.familyName}</span> },
                { title: 'Members', dataIndex: 'memberCount', key: 'm', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'YTD total', dataIndex: 'totalAmount', key: 't', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No contributions yet" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Largest families" size="small" className="jm-card">
            <Table rowKey="familyId" size="small" pagination={false} dataSource={d.largestFamilies}
              columns={[
                { title: 'Family', key: 'f', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.code}</span> Â· {r.familyName}</span> },
                { title: 'Members', dataIndex: 'memberCount', key: 'm', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{v}</span> },
                { title: 'YTD total', dataIndex: 'totalAmount', key: 't', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No families" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Fund Enrollments --------------------------------------------------------

function FundEnrollmentsDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const months = filtersToMonths(filters, 12);
  const q = useQuery({
    queryKey: ['dash', 'fund-enrollments', months],
    queryFn: () => dashboardApi.fundEnrollments(months),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const trendData = d.enrollmentTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Enrollments: p.count,
  }));
  const isEmpty = d.totalEnrollments === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="12m" />
      <div style={{ blockSize: 12 }} />
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No enrollments yet"
          description="Status mix, recurrence breakdown, by-fund-type ranking, and the monthly trend populate as members are enrolled into funds."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<AppstoreOutlined />} label="Total enrollments" value={d.totalEnrollments} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Active" value={d.activeCount} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Draft" value={d.draftCount} format="number" accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Cancelled" value={d.cancelledCount} format="number" accent={ACCENT.danger} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<UserAddOutlined />} label="New this month" value={d.newThisMonth} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="New this year" value={d.newThisYear} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<GoldOutlined />} label="Recurring (active)" value={d.recurringActive} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FileDoneOutlined />} label="One-time (active)" value={d.oneTimeActive} format="number" accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Enrollments per month (last 12)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Enrollments" stroke={ACCENT.financial} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="Status mix" size="small" className="jm-card">
            {d.statusMix.length === 0 ? <Empty description="No enrollments" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.statusMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.statusMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="Recurrence" size="small" className="jm-card">
            {d.recurrenceMix.length === 0 ? <Empty description="No enrollments" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.recurrenceMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.recurrenceMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top funds by active enrollments" size="small" className="jm-card">
            <Table rowKey="fundTypeId" size="small" pagination={false} dataSource={d.topFundsByActiveCount}
              columns={[
                { title: 'Fund', key: 'f', render: (_, r) => <Link to={`/dashboards/fund-types/${r.fundTypeId}`}><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.fundCode}</span> Â· {r.fundName}</Link> },
                { title: 'Active', dataIndex: 'activeEnrollments', key: 'a', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{v}</span> },
                { title: 'Total', dataIndex: 'totalEnrollments', key: 't', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
              ]}
              locale={{ emptyText: <Empty description="No enrollments" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="By fund type (top 8)" size="small" className="jm-card">
            {d.byFundType.length === 0 ? <Empty description="No enrollments" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byFundType} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={80} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Cashflow ----------------------------------------------------------------

function CashflowDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const days = filtersToDays(filters, 90);
  const q = useQuery({
    queryKey: ['dash', 'cashflow', days],
    queryFn: () => dashboardApi.cashflow(days),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const isEmpty = d.totalInflow === 0 && d.totalOutflow === 0;
  const curve = d.dailyCurve.map((p) => ({
    label: p.date.slice(5),
    Inflow: p.inflow,
    Outflow: p.outflow,
    Net: p.net,
  }));

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="90d" />
      <div style={{ blockSize: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={() => downloadDashboardXlsx('/api/v1/dashboard/cashflow.xlsx', { days }, `cashflow_${todayStamp()}.xlsx`)}>
          Export XLSX
        </Button>
      </div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No cashflow activity in the selected window"
          description="Once receipts are confirmed and vouchers paid, the daily curve and category mix populate here."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label={`Inflow (${days}d)`} value={d.totalInflow} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FallOutlined />} label={`Outflow (${days}d)`} value={d.totalOutflow} currency={d.currency} accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label={`Net (${days}d)`} value={d.netCashflow} currency={d.currency} accent={d.netCashflow >= 0 ? ACCENT.positive : ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Pending outflow" value={d.pendingOutflow} currency={d.currency} accent={ACCENT.caution} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Inflow MTD" value={d.inflowThisMonth} currency={d.currency} accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Outflow MTD" value={d.outflowThisMonth} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Inflow MTD-1" value={d.inflowMtdPriorMonth} currency={d.currency} accent={ACCENT.neutral} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Outflow MTD-1" value={d.outflowMtdPriorMonth} currency={d.currency} accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Daily inflow vs outflow (last 90 days)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={curve}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={6} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                <Legend />
                <Bar dataKey="Inflow" fill={ACCENT.positive} />
                <Bar dataKey="Outflow" fill={ACCENT.danger} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Inflow by fund (top 8)" size="small" className="jm-card">
            {d.inflowByFund.length === 0 ? <Empty description="No inflows" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.inflowByFund} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                  <Bar dataKey="amount" fill={ACCENT.positive} name="Amount" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Outflow by purpose (top 8)" size="small" className="jm-card">
            {d.outflowByPurpose.length === 0 ? <Empty description="No outflows" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.outflowByPurpose} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                  <Bar dataKey="amount" fill={ACCENT.danger} name="Amount" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Inflow by payment mode" size="small" className="jm-card">
            {d.inflowByPaymentMode.length === 0 ? <Empty description="No inflows" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={d.inflowByPaymentMode} dataKey="amount" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.inflowByPaymentMode.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Outflow by payment mode" size="small" className="jm-card">
            {d.outflowByPaymentMode.length === 0 ? <Empty description="No outflows" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={d.outflowByPaymentMode} dataKey="amount" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.outflowByPaymentMode.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- QH Funnel ---------------------------------------------------------------

function QhFunnelDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const months = filtersToMonths(filters, 12);
  const q = useQuery({
    queryKey: ['dash', 'qh-funnel', months],
    queryFn: () => dashboardApi.qhFunnel(months),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const trendData = d.monthlyTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Requests: p.requests,
    Disbursements: p.disbursements,
  }));
  const isEmpty = d.totalRequests === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="12m" />
      <div style={{ blockSize: 12 }} />
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No loan requests yet"
          description="The funnel and approval-rate KPIs populate as members submit loan requests through the Qarzan Hasana module."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Total requests" value={d.totalRequests} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Pending" value={d.pending} format="number" accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Approved" value={d.approved} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Approval rate" value={d.approvalRatePercent} format="number" suffix="%" accent={ACCENT.positive} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FallOutlined />} label="Disbursed total" value={d.totalDisbursedAmount} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Repaid total" value={d.totalRepaidAmount} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Loan-pool contribs" value={d.contributionsToLoanPool} currency={d.currency} accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<GoldOutlined />} label="Available pool" value={d.availablePool} currency={d.currency} accent={d.availablePool >= 0 ? ACCENT.positive : ACCENT.danger} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Defaulted" value={d.defaulted} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Rejected" value={d.rejected} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Avg days to approve" value={d.averageDaysToApprove} format="number" accent={ACCENT.neutral} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Avg days to disburse" value={d.averageDaysToDisburse} format="number" accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Monthly requests vs disbursements" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Legend />
                <Bar dataKey="Requests" fill={ACCENT.cyan} />
                <Bar dataKey="Disbursements" fill={ACCENT.financial} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Funnel (count + amount at each stage)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={d.statusFunnel} layout="vertical" margin={{ left: 70 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={90} />
                <RTooltip formatter={(v: any, name: any) => name === 'amount' ? money(Number(v) || 0, d.currency) : v} />
                <Bar dataKey="count" fill={ACCENT.financial} name="Loans" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Top borrowers by current outstanding" size="small" className="jm-card">
            <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topBorrowers}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> Â· {r.fullName}</span> },
                { title: 'Loans', dataIndex: 'loanCount', key: 'l', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Outstanding', dataIndex: 'outstanding', key: 'o', align: 'right', width: 160, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No outstanding loans" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Commitment types --------------------------------------------------------

function CommitmentTypesDashboard() {
  const q = useQuery({ queryKey: ['dash', 'commitment-types'], queryFn: dashboardApi.commitmentTypes });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;

  const trendData = d.creationTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Commitments: p.count,
  }));
  const isEmpty = d.totalCommitments === 0;

  return (
    <div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No commitments yet"
          description="Per-template performance, fund breakdown, and the creation trend appear once members accept commitment agreements."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FileDoneOutlined />} label="Total commitments" value={d.totalCommitments} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Active" value={d.activeCount} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Defaulted" value={d.defaultedCount} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Overall progress" value={d.overallProgressPercent} format="number" suffix="%" accent={ACCENT.financial} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={8}><KpiCard icon={<RiseOutlined />} label="Total committed" value={d.totalCommitted} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={8}><KpiCard icon={<CheckCircleOutlined />} label="Total paid" value={d.totalPaid} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={8}><KpiCard icon={<HourglassOutlined />} label="Remaining" value={d.totalRemaining} currency={d.currency} accent={ACCENT.caution} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Creation trend (last 12 months)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Commitments" stroke={ACCENT.financial} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Status mix" size="small" className="jm-card">
            {d.statusMix.length === 0 ? <Empty description="No commitments" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.statusMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {d.statusMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="By template" size="small" className="jm-card">
            <Table rowKey={(r) => r.templateId ?? r.templateName} size="small" pagination={false} dataSource={d.byTemplate}
              columns={[
                { title: 'Template', dataIndex: 'templateName', key: 'n' },
                { title: 'Total', dataIndex: 'count', key: 'c', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Active', dataIndex: 'activeCount', key: 'a', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Defaulted', dataIndex: 'defaultedCount', key: 'def', align: 'right', width: 100, render: (v: number) => v > 0 ? <Tag color="red" className="jm-tnum" style={{ margin: 0 }}>{v}</Tag> : <span className="jm-tnum">0</span> },
                { title: 'Committed', dataIndex: 'committed', key: 'co', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
                { title: 'Paid', dataIndex: 'paid', key: 'p', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
                { title: 'Progress', dataIndex: 'progressPercent', key: 'pr', width: 130, render: (v: number) => <Progress percent={v} size="small" strokeColor={v >= 80 ? ACCENT.positive : v >= 40 ? ACCENT.caution : ACCENT.danger} /> },
              ]}
              locale={{ emptyText: <Empty description="No commitments" /> }}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="By fund (top 8 by committed)" size="small" className="jm-card">
            <Table rowKey="fundTypeId" size="small" pagination={false} dataSource={d.byFund}
              columns={[
                { title: 'Fund', key: 'f', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.fundCode}</span> Â· {r.fundName}</span> },
                { title: 'Count', dataIndex: 'count', key: 'c', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Committed', dataIndex: 'committed', key: 'co', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
                { title: 'Paid', dataIndex: 'paid', key: 'p', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No commitments" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Vouchers ----------------------------------------------------------------

function VouchersDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'vouchers', filters.from, filters.to],
    queryFn: () => dashboardApi.vouchers(filters.from, filters.to),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const daily = d.dailyOutflow.map((p) => ({ label: p.date.slice(5), Count: p.count, Amount: p.amount }));
  const monthly = d.monthlyVoucherCount.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Vouchers: p.count,
  }));
  const isEmpty = d.totalVouchers === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="90d" />
      <div style={{ blockSize: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={() => downloadDashboardXlsx('/api/v1/dashboard/vouchers.xlsx', { from: filters.from, to: filters.to }, `vouchers_${todayStamp()}.xlsx`)}>
          Export XLSX
        </Button>
      </div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No vouchers in the selected window"
          description="Adjust the date range or wait for new vouchers to be raised."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Total vouchers" value={d.totalVouchers} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Paid total" value={d.totalPaidAmount} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Pending approval" value={d.pendingApprovalAmount} currency={d.currency} accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FallOutlined />} label="Approved unpaid" value={d.approvedNotPaidAmount} currency={d.currency} accent={ACCENT.danger} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Avg voucher" value={d.averageVoucherAmount} currency={d.currency} accent={ACCENT.neutral} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Largest" value={d.maxVoucherAmount} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Cancelled" value={d.cancelledCount} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Pending clearance" value={d.pendingClearanceCount} format="number" accent={ACCENT.caution} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Daily outflow" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={6} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any, name: any) => name === 'Amount' ? money(Number(v) || 0, d.currency) : v} />
                <Legend />
                <Bar dataKey="Amount" fill={ACCENT.financial} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Status mix" size="small" className="jm-card">
            {d.statusMix.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.statusMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {d.statusMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="By payment mode" size="small" className="jm-card">
            {d.byPaymentMode.length === 0 ? <Empty description="No paid vouchers" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byPaymentMode} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={80} />
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                  <Bar dataKey="amount" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="By expense type (top 8)" size="small" className="jm-card">
            {d.byExpenseType.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byExpenseType} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={80} />
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                  <Bar dataKey="amount" fill={ACCENT.caution} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top payees" size="small" className="jm-card">
            <Table rowKey="label" size="small" pagination={false} dataSource={d.topPayees}
              columns={[
                { title: 'Payee', dataIndex: 'label' },
                { title: 'Vouchers', dataIndex: 'count', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Total', dataIndex: 'amount', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No payees" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Top purposes" size="small" className="jm-card">
            <Table rowKey="label" size="small" pagination={false} dataSource={d.byPurpose}
              columns={[
                { title: 'Purpose', dataIndex: 'label' },
                { title: 'Vouchers', dataIndex: 'count', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Total', dataIndex: 'amount', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No purposes" /> }}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="Monthly voucher count (12 months)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Vouchers" stroke={ACCENT.financial} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Receipts ----------------------------------------------------------------

function ReceiptsDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'receipts', filters.from, filters.to, filters.fundTypeId],
    queryFn: () => dashboardApi.receipts(filters.from, filters.to, filters.fundTypeId),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const daily = d.dailyInflow.map((p) => ({ label: p.date.slice(5), Amount: p.amount }));
  const isEmpty = d.totalAmount === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange showFundFilter defaultPreset="90d" />
      <div style={{ blockSize: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={() => downloadDashboardXlsx('/api/v1/dashboard/receipts.xlsx',
            { from: filters.from, to: filters.to, fundTypeId: filters.fundTypeId }, `receipts_${todayStamp()}.xlsx`)}>
          Export XLSX
        </Button>
      </div>
      {d.scopedFundName && (
        <Alert type="info" showIcon className="jm-alert-after-card"
          message={<>Scoped to fund: <Tag color="blue">{d.scopedFundName}</Tag></>} />
      )}
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No confirmed receipts in the selected window"
          description="Adjust filters or wait for new receipts to be confirmed."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Total inflow" value={d.totalAmount} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Receipts" value={d.confirmed} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<TeamOutlined />} label="Contributors" value={d.uniqueContributors} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Avg receipt" value={d.averageReceipt} currency={d.currency} accent={ACCENT.neutral} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Permanent" value={d.permanentAmount} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ContainerOutlined />} label="Returnable" value={d.returnableAmount} currency={d.currency} accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Largest" value={d.largestReceipt} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Pending clearance" value={d.pendingClearance} format="number" accent={ACCENT.caution} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Daily inflow" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={6} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                <Bar dataKey="Amount" fill={ACCENT.positive} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Payment mode" size="small" className="jm-card">
            {d.byPaymentMode.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.byPaymentMode} dataKey="amount" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {d.byPaymentMode.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="By fund (top 8)" size="small" className="jm-card">
            {d.byFund.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byFund} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                  <Bar dataKey="amount" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Intention" size="small" className="jm-card">
            {d.intentionSplit.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.intentionSplit} dataKey="amount" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {d.intentionSplit.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Top contributors" size="small" className="jm-card">
            <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topContributors}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> Â· {r.fullName}</span> },
                { title: 'Receipts', dataIndex: 'receiptCount', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Total', dataIndex: 'amount', align: 'right', width: 160, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No contributors" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Returnables -------------------------------------------------------------

function ReturnablesDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'returnables', filters.fundTypeId],
    queryFn: () => dashboardApi.returnables(filters.fundTypeId),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const timeline = d.upcomingMaturityTimeline.map((w) => ({ label: w.weekStart.slice(5), Count: w.count, Amount: w.amount }));
  const isEmpty = d.totalReturnable === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange={false} showFundFilter />
      <div style={{ blockSize: 12 }} />
      {d.scopedFundName && (
        <Alert type="info" showIcon className="jm-alert-after-card"
          message={<>Scoped to fund: <Tag color="blue">{d.scopedFundName}</Tag></>} />
      )}
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No returnable receipts"
          description="The portfolio populates as contributors deposit returnable contributions."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<ContainerOutlined />} label="Returnable receipts" value={d.totalReturnable} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Total issued" value={d.totalIssued} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Total returned" value={d.totalReturned} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Outstanding" value={d.outstanding} currency={d.currency} accent={ACCENT.caution} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Overdue count" value={d.overdueCount} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Overdue amount" value={d.overdueAmount} currency={d.currency} accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Matured open" value={d.maturedNotReturnedCount} format="number" accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Matured value" value={d.maturedNotReturnedAmount} currency={d.currency} accent={ACCENT.caution} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Age buckets (outstanding)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.ageBuckets}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any, name: any) => name === 'amount' ? money(Number(v) || 0, d.currency) : v} />
                <Bar dataKey="count" fill={ACCENT.caution} name="Receipts" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="12-week maturity timeline" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={timeline}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip formatter={(v: any, name: any) => name === 'Amount' ? money(Number(v) || 0, d.currency) : v} />
                <Legend />
                <Bar dataKey="Count" fill={ACCENT.financial} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="By fund (top 8)" size="small" className="jm-card">
            {d.byFund.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byFund} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                  <Bar dataKey="amount" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Maturity state" size="small" className="jm-card">
            {d.maturityStateMix.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.maturityStateMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {d.maturityStateMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="Top holders by outstanding" size="small" className="jm-card">
            <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topHolders}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> Â· {r.memberName}</span> },
                { title: 'Receipts', dataIndex: 'receiptCount', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Issued', dataIndex: 'totalIssued', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
                { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', width: 160, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No holders" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Member Assets -----------------------------------------------------------

function MemberAssetsDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'member-assets', filters.sectorId],
    queryFn: () => dashboardApi.memberAssets(filters.sectorId),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const trend = d.creationTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Assets: p.count,
  }));
  const isEmpty = d.totalAssets === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange={false} showSectorFilter />
      <div style={{ blockSize: 12 }} />
      {d.scopedSectorName && (
        <Alert type="info" showIcon className="jm-alert-after-card"
          message={<>Scoped to sector: <Tag color="blue">{d.scopedSectorName}</Tag></>} />
      )}
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No member assets"
          description="The portfolio populates as members register their owned assets (real estate, jewellery, vehicles, etc.)."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<GoldOutlined />} label="Total assets" value={d.totalAssets} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<TeamOutlined />} label="Members with assets" value={d.membersWithAssets} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Estimated value" value={d.totalEstimatedValue} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Largest asset" value={d.largestAssetValue} currency={d.currency} accent={ACCENT.caution} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="By kind" size="small" className="jm-card">
            {d.byKind.length === 0 ? <Empty description="No assets" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={d.byKind} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip formatter={(v: any, name: any) => name === 'amount' ? money(Number(v) || 0, d.currency) : v} />
                  <Bar dataKey="amount" fill={ACCENT.financial} name="Value" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Asset count trend (12 months)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Assets" stroke={ACCENT.cyan} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Top members by value" size="small" className="jm-card">
            <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topMembersByValue}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> Â· {r.fullName}</span> },
                { title: 'Assets', dataIndex: 'assetCount', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Total value', dataIndex: 'totalValue', align: 'right', width: 160, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No assets" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Assets by sector (top 8)" size="small" className="jm-card">
            {d.assetsBySector.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={d.assetsBySector} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Sectors -----------------------------------------------------------------

function SectorsDashboard() {
  const q = useQuery({ queryKey: ['dash', 'sectors'], queryFn: dashboardApi.sectors });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const isEmpty = d.totalSectors === 0;

  return (
    <div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No sectors configured"
          description="Add sectors from the Master data module and assign members to them."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<TeamOutlined />} label="Total sectors" value={d.totalSectors} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Active sectors" value={d.activeSectors} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UsergroupAddOutlined />} label="Members" value={d.totalMembers} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Without sector" value={d.membersWithoutSector} format="number" accent={ACCENT.danger} /></Col>
      </Row>
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Per-sector summary" size="small" className="jm-card">
            <Table rowKey="sectorId" size="small" pagination={{ pageSize: 25 }} dataSource={d.sectors}
              columns={[
                { title: 'Sector', key: 's', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.code}</span> Â· {r.name}</span> },
                { title: 'Active?', dataIndex: 'isActive', align: 'center', width: 80, render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
                { title: 'Members', dataIndex: 'memberCount', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Active', dataIndex: 'activeMembers', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Verified', dataIndex: 'verifiedMembers', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Families', dataIndex: 'familyCount', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Active commitments', dataIndex: 'commitmentCount', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'YTD contrib.', dataIndex: 'contributionsYtd', align: 'right', width: 150, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
                { title: 'Asset value', dataIndex: 'assetValue', align: 'right', width: 150, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No sectors" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Notifications -----------------------------------------------------------

const NOTIF_CHANNEL_LABEL = ['', 'LogOnly', 'Email', 'SMS', 'WhatsApp'];
const NOTIF_KIND_LABEL = ['', 'ReceiptConfirmed', 'ReceiptPendingApproval', 'VoucherPendingApproval',
  'ContributionReturned', 'QhLoanDisbursed', 'UserWelcome', 'TempPasswordIssued'];

function NotificationsDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'notifications', filters.from, filters.to],
    queryFn: () => dashboardApi.notifications(filters.from, filters.to),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const daily = d.dailyVolume.map((p) => ({ label: p.date.slice(5), Events: p.count }));
  const isEmpty = d.total === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="30d" />
      <div style={{ blockSize: 12 }} />
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No notifications in the selected window"
          description="Notifications are recorded as receipt/voucher/QH activities trigger them."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<AuditOutlined />} label="Total" value={d.total} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Sent" value={d.sentCount} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Failed" value={d.failedCount} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Delivery rate" value={d.deliveryRatePercent} format="number" suffix="%" accent={d.deliveryRatePercent >= 95 ? ACCENT.positive : d.deliveryRatePercent >= 80 ? ACCENT.caution : ACCENT.danger} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card title="Daily volume" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="Events" fill={ACCENT.financial} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Status mix" size="small" className="jm-card">
            {d.byStatus.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={d.byStatus} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {d.byStatus.map((_, i) => <Cell key={i} fill={['#0E5C40', '#DC2626', '#94A3B8'][i % 3]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="By channel" size="small" className="jm-card">
            {d.byChannel.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byChannel}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title="By notification kind" size="small" className="jm-card">
            {d.byKind.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.byKind} layout="vertical" margin={{ left: 100 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={130} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.financial} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top failure reasons" size="small" className="jm-card">
            <Table rowKey="label" size="small" pagination={false} dataSource={d.topFailureReasons}
              columns={[
                { title: 'Reason', dataIndex: 'label', ellipsis: true },
                { title: 'Count', dataIndex: 'count', align: 'right', width: 80, render: (v: number) => <span className="jm-tnum">{v}</span> },
              ]}
              locale={{ emptyText: <Empty description="No failures" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Recent failures" size="small" className="jm-card">
            <Table rowKey="id" size="small" pagination={false} dataSource={d.recentFailures}
              columns={[
                { title: 'When', dataIndex: 'attemptedAtUtc', width: 130, render: (v: string) => formatDate(v) },
                { title: 'Channel', dataIndex: 'channel', width: 90, render: (v: number) => <Tag>{NOTIF_CHANNEL_LABEL[v] ?? `#${v}`}</Tag> },
                { title: 'Subject', dataIndex: 'subject', ellipsis: true },
                { title: 'Reason', dataIndex: 'failureReason', ellipsis: true, render: (v: string | null) => <span style={{ color: 'var(--jm-danger-fg-strong)', fontSize: 12 }}>{v ?? 'â€”'}</span> },
              ]}
              locale={{ emptyText: <Empty description="No failures" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- User activity -----------------------------------------------------------

function UserActivityDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'user-activity', filters.from, filters.to],
    queryFn: () => dashboardApi.userActivity(filters.from, filters.to),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const daily = d.dailyVolume.map((p) => ({ label: p.date.slice(5), Events: p.count }));
  const hourly = d.hourOfDayHeatmap.map((p) => ({ label: `${p.hour.toString().padStart(2, '0')}h`, Events: p.count }));
  const isEmpty = d.totalEvents === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="30d" />
      <div style={{ blockSize: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={() => downloadDashboardXlsx('/api/v1/dashboard/user-activity.xlsx',
            { from: filters.from, to: filters.to }, `user-activity_${todayStamp()}.xlsx`)}>
          Export XLSX
        </Button>
      </div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No audit events in the selected window"
          description="Activity flows in as users create, update, or delete records anywhere in the app."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={8}><KpiCard icon={<AuditOutlined />} label="Total events" value={d.totalEvents} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={8}><KpiCard icon={<UserOutlined />} label="Unique users" value={d.uniqueUsers} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={8}><KpiCard icon={<FileSearchOutlined />} label="Unique entities" value={d.uniqueEntities} format="number" accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Daily volume" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="Events" fill={ACCENT.financial} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title="Hour-of-day heatmap (UTC)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourly}>
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="Events" fill={ACCENT.cyan} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Action mix" size="small" className="jm-card">
            {d.actionMix.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={d.actionMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.actionMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Top users" size="small" className="jm-card">
            <Table rowKey="label" size="small" pagination={false} dataSource={d.topUsers}
              columns={[
                { title: 'User', dataIndex: 'label' },
                { title: 'Events', dataIndex: 'count', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
              ]}
              locale={{ emptyText: <Empty description="No users" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Top entities touched" size="small" className="jm-card">
            <Table rowKey="label" size="small" pagination={false} dataSource={d.topEntities}
              columns={[
                { title: 'Entity', dataIndex: 'label' },
                { title: 'Events', dataIndex: 'count', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
              ]}
              locale={{ emptyText: <Empty description="No entities" /> }}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Recent events" size="small" className="jm-card">
            <Table rowKey={(r, i) => `${r.atUtc}-${i}`} size="small" pagination={false} dataSource={d.recentEvents}
              columns={[
                { title: 'When', dataIndex: 'atUtc', width: 170, render: (v: string) => formatDate(v) },
                { title: 'User', dataIndex: 'userName', width: 180,
                  render: (v: string, r) => <UserHoverCard userId={r.userId ?? null} fallback={v} /> },
                { title: 'Action', dataIndex: 'action', width: 100, render: (v: string) => <Tag color={v === 'Create' ? 'green' : v === 'Delete' ? 'red' : 'blue'}>{v}</Tag> },
                { title: 'Entity', dataIndex: 'entityName' },
                { title: 'Entity id', dataIndex: 'entityId', width: 280, ellipsis: true, render: (v: string | null) => <span className="jm-tnum" style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{v ?? 'â€”'}</span> },
              ]}
              locale={{ emptyText: <Empty description="No events" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Change Requests ---------------------------------------------------------

const CR_STATUS_LABEL = ['', 'Pending', 'Approved', 'Rejected'];

function ChangeRequestsDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'change-requests', filters.from, filters.to],
    queryFn: () => dashboardApi.changeRequests(filters.from, filters.to),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const daily = d.dailyVolume.map((p) => ({ label: p.date.slice(5), Requests: p.count }));
  const isEmpty = d.total === 0 && d.pending === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="90d" />
      <div style={{ blockSize: 12 }} />
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No change requests in the selected window"
          description="Once members submit profile changes through the portal, the queue will populate here."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Pending (all-time)" value={d.pending} format="number" accent={d.pending > 0 ? '#D97706' : '#475569'} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Approved (window)" value={d.approved} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Rejected (window)" value={d.rejected} format="number" accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Oldest pending (days)" value={d.oldestPendingDays} format="number" accent={d.oldestPendingDays > 14 ? ACCENT.danger : d.oldestPendingDays > 7 ? ACCENT.caution : ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card title="Daily volume" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="Requests" fill={ACCENT.financial} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Status mix" size="small" className="jm-card">
            {d.byStatus.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={d.byStatus} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label>
                    {d.byStatus.map((_, i) => <Cell key={i} fill={['#D97706', '#0E5C40', '#DC2626'][i % 3]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="By section" size="small" className="jm-card">
            {d.bySection.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.bySection} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Top requesters" size="small" className="jm-card">
            <Table rowKey="label" size="small" pagination={false} dataSource={d.byRequester}
              columns={[
                { title: 'Requester', dataIndex: 'label' },
                { title: 'Requests', dataIndex: 'count', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
              ]}
              locale={{ emptyText: <Empty description="No data" /> }}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Oldest pending requests (worklist)" size="small" className="jm-card">
            <Table rowKey="id" size="small" pagination={false} dataSource={d.oldestPending}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> Â· <Link to={`/dashboards/members/${r.memberId}`}>{r.memberName}</Link></span> },
                { title: 'Section', dataIndex: 'section', width: 130, render: (v: string) => <Tag>{v}</Tag> },
                { title: 'Requested by', dataIndex: 'requestedByUserName', width: 200,
                  render: (v: string, r) => <UserHoverCard userId={r.requestedByUserId ?? null} fallback={v} /> },
                { title: 'Requested', dataIndex: 'requestedAtUtc', width: 130, render: (v: string) => formatDate(v) },
                { title: 'Age', dataIndex: 'ageDays', width: 90, render: (v: number) => <Tag color={v > 14 ? 'red' : v > 7 ? 'gold' : 'default'} className="jm-tnum">{v}d</Tag> },
              ]}
              locale={{ emptyText: <Empty description="No pending requests" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Expense Types -----------------------------------------------------------

function ExpenseTypesDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const q = useQuery({
    queryKey: ['dash', 'expense-types', filters.from, filters.to],
    queryFn: () => dashboardApi.expenseTypes(filters.from, filters.to),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const trend = d.monthlyTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Amount: p.amount,
    Vouchers: p.count,
  }));
  const isEmpty = d.totalSpend === 0;

  return (
    <div>
      <DashboardFilterBar value={filters} onChange={setFilters} showTimeRange defaultPreset="90d" />
      <div style={{ blockSize: 12 }} />
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No paid vouchers in the selected window"
          description="Categorise expenses on each voucher line so this dashboard can surface the active categories."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<AppstoreOutlined />} label="Expense types" value={d.totalExpenseTypes} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Active" value={d.activeExpenseTypes} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Used (window)" value={d.usedExpenseTypes} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FallOutlined />} label="Total spend" value={d.totalSpend} currency={d.currency} accent={ACCENT.danger} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Total voucher outflow trend (last 12 months)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                <Line type="monotone" dataKey="Amount" stroke={ACCENT.danger} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="Per-category usage (filter window)" size="small" className="jm-card">
            <Table rowKey="expenseTypeId" size="small" pagination={{ pageSize: 25 }} dataSource={d.rows}
              columns={[
                { title: 'Code', dataIndex: 'code', width: 140, render: (v: string) => <span className="jm-tnum">{v}</span> },
                { title: 'Name', dataIndex: 'name' },
                { title: 'Active', dataIndex: 'isActive', width: 80, align: 'center', render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
                { title: 'Vouchers', dataIndex: 'voucherCount', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Total', dataIndex: 'totalAmount', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
                { title: 'Average', dataIndex: 'averageAmount', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
                { title: 'Last used', dataIndex: 'lastUsed', width: 120, render: (v: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>â€”</span> },
              ]}
              locale={{ emptyText: <Empty description="No expense types" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Periods management ------------------------------------------------------

const PERIOD_STATUS_LABEL = ['', 'Open', 'Closed', 'Locked'];

function PeriodsDashboard() {
  const q = useQuery({ queryKey: ['dash', 'periods'], queryFn: dashboardApi.periods });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const isEmpty = d.totalPeriods === 0;

  return (
    <div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No financial periods configured"
          description="Add a period from the Accounting module so postings have a window to land in."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Total periods" value={d.totalPeriods} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="Open" value={d.openPeriods} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Closed" value={d.closedPeriods} format="number" accent={ACCENT.neutral} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Current open (days)" value={d.currentPeriodOpenDays ?? 0} format="number" accent={ACCENT.financial} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Current period" size="small" className="jm-card" styles={{ body: { padding: 16 } }}>
            {d.currentPeriodId ? (
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="Period"><strong>{d.currentPeriodName}</strong></Descriptions.Item>
                <Descriptions.Item label="Open for"><span className="jm-tnum">{d.currentPeriodOpenDays} days</span></Descriptions.Item>
                <Descriptions.Item label="Draft receipts in window">
                  {d.draftReceiptsInOpenPeriod === 0
                    ? <Tag color="green">0 â€” clean</Tag>
                    : <Tag color="gold">{d.draftReceiptsInOpenPeriod} unconfirmed</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="Pending voucher approvals">
                  {d.pendingVoucherApprovalsInOpenPeriod === 0
                    ? <Tag color="green">0 â€” clean</Tag>
                    : <Tag color="gold">{d.pendingVoucherApprovalsInOpenPeriod} pending</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="Ready to close">
                  {d.readyToClose
                    ? <Tag color="green"><CheckCircleOutlined /> Yes â€” queue is empty</Tag>
                    : <Tag color="orange"><WarningOutlined /> Drain queues first</Tag>}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Empty description="No open period" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="All periods" size="small" className="jm-card">
            <Table rowKey="id" size="small" pagination={{ pageSize: 10 }} dataSource={d.periods}
              columns={[
                { title: 'Name', dataIndex: 'name' },
                { title: 'Range', key: 'r', render: (_, r) => <span className="jm-tnum">{formatDate(r.startDate)} â†’ {formatDate(r.endDate)}</span> },
                { title: 'Status', dataIndex: 'status', width: 100, render: (v: number) => <Tag color={v === 1 ? 'green' : 'default'}>{PERIOD_STATUS_LABEL[v] ?? v}</Tag> },
                { title: 'Age', dataIndex: 'ageDays', width: 80, render: (v: number) => <span className="jm-tnum">{v}d</span> },
              ]}
              locale={{ emptyText: <Empty description="No periods" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Annual Summary ----------------------------------------------------------

function AnnualSummaryDashboard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const q = useQuery({
    queryKey: ['dash', 'annual-summary', year],
    queryFn: () => dashboardApi.annualSummary(year),
  });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const monthly = d.monthly.map((p) => ({
    label: new Date(2000, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Income: p.income,
    Expense: p.expense,
    Net: p.net,
  }));
  const isEmpty = d.totalIncome === 0 && d.totalExpense === 0;
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div>
      <Card size="small" className="jm-card" styles={{ body: { padding: 12 } }}>
        <Space wrap size={[12, 8]}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Year</span>
          <Select size="small" value={year} onChange={(v) => setYear(v)}
            options={yearOptions.map((y) => ({ value: y, label: String(y) }))}
            style={{ minInlineSize: 110 }} />
          <Button size="small" icon={<DownloadOutlined />}
            onClick={() => downloadDashboardXlsx('/api/v1/dashboard/annual-summary.xlsx', { year }, `annual-summary_${year}.xlsx`)}>
            Export XLSX
          </Button>
        </Space>
      </Card>
      <div style={{ blockSize: 12 }} />

      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message={`No financial activity in ${d.year}`}
          description="Pick a different year, or wait for confirmed receipts and paid vouchers to land in this period."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={8}><KpiCard icon={<RiseOutlined />} label={`Income ${d.year}`} value={d.totalIncome} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={8}><KpiCard icon={<FallOutlined />} label={`Expense ${d.year}`} value={d.totalExpense} currency={d.currency} accent={ACCENT.danger} /></Col>
        <Col xs={12} md={8}><KpiCard icon={<BankOutlined />} label="Net" value={d.net} currency={d.currency} accent={d.net >= 0 ? ACCENT.positive : ACCENT.danger} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Income vs expense per month" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                <Legend />
                <Bar dataKey="Income" fill={ACCENT.positive} />
                <Bar dataKey="Expense" fill={ACCENT.danger} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={`Income by fund (${d.year})`} size="small" className="jm-card">
            <Table rowKey="fundTypeId" size="small" pagination={false} dataSource={d.byFund}
              columns={[
                { title: 'Code', dataIndex: 'fundCode', width: 130, render: (v: string) => <span className="jm-tnum">{v}</span> },
                { title: 'Fund', dataIndex: 'fundName' },
                { title: 'Receipts', dataIndex: 'receiptCount', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Income', dataIndex: 'income', align: 'right', width: 160, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No income" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Top voucher purposes" size="small" className="jm-card">
            <Table rowKey="label" size="small" pagination={false} dataSource={d.byVoucherPurpose}
              columns={[
                { title: 'Purpose', dataIndex: 'label', ellipsis: true },
                { title: 'Vouchers', dataIndex: 'count', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Amount', dataIndex: 'amount', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No expenses" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// -- Account reconciliation --------------------------------------------------

const ACCOUNT_TYPE_LABEL = ['', 'Asset', 'Liability', 'Income', 'Expense', 'Equity', 'Fund'];

function ReconciliationDashboard() {
  const q = useQuery({ queryKey: ['dash', 'reconciliation'], queryFn: dashboardApi.reconciliation });
  if (q.isLoading || !q.data) return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  const d = q.data;
  const isEmpty = d.bankAccountCount === 0 && d.coaAccountsCount === 0;

  return (
    <div>
      {isEmpty && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />}
          message="No accounts configured"
          description="Add bank accounts + chart-of-accounts entries from the Master Data module to start reconciling."
          style={{ marginBlockEnd: 16 }} />
      )}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Bank balance (active)" value={d.totalBankBalance} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Cheques in transit" value={d.inTransitAmount} currency={d.currency} accent={ACCENT.caution} caption={`${d.inTransitChequeCount} cheques`} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FallOutlined />} label="Pending vouchers" value={d.pendingVoucherAmount} currency={d.currency} accent={ACCENT.financial} caption={`${d.pendingVoucherCount} pending`} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Stale COA accounts" value={d.staleAccountsCount} format="number" accent={d.staleAccountsCount > 0 ? ACCENT.danger : ACCENT.neutral} caption={`> 30d since last entry`} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card title="Bank accounts" size="small" className="jm-card">
            <Table rowKey="id" size="small" pagination={false} dataSource={d.bankAccounts}
              columns={[
                { title: 'Bank account', key: 'b', render: (_, r) => (
                  <span>
                    <strong>{r.name}</strong>
                    <span style={{ color: 'var(--jm-gray-500)', fontSize: 11, marginInlineStart: 8 }}>{r.bankName}</span>
                    <div className="jm-tnum" style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{r.accountNumberMasked}</div>
                  </span>
                ) },
                { title: 'COA link', key: 'l', width: 200, render: (_, r) => r.accountingAccountId
                  ? <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.accountingAccountCode}</span> Â· {r.accountingAccountName}</span>
                  : <Tag color="red">Not linked</Tag>
                },
                { title: 'Currency', dataIndex: 'currency', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                { title: 'Ledger balance', dataIndex: 'ledgerBalance', align: 'right', width: 150, render: (v: number, r) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, r.currency)}</span> },
                { title: 'Pending vouchers', key: 'pv', align: 'right', width: 160, render: (_, r) => r.pendingVoucherCount > 0
                  ? <span><Tag color="gold" className="jm-tnum">{r.pendingVoucherCount}</Tag> <span className="jm-tnum">{money(r.pendingVoucherAmount, r.currency)}</span></span>
                  : <span style={{ color: 'var(--jm-gray-400)' }}>â€”</span>
                },
                { title: 'Last entry', dataIndex: 'lastEntryDate', width: 110, render: (v: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>â€”</span> },
                { title: 'Status', dataIndex: 'readinessLabel', width: 130, render: (v: string) => {
                  const color = v === 'Healthy' ? 'green' : v === 'Inactive' ? 'default'
                    : v === 'Stale â€” verify' ? 'red' : 'gold';
                  return <Tag color={color}>{v}</Tag>;
                } },
              ]}
              locale={{ emptyText: <Empty description="No bank accounts configured" /> }}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Chart of accounts (Asset / Liability / Equity / Fund)" size="small" className="jm-card">
            <Table rowKey="accountId" size="small" pagination={{ pageSize: 25 }} dataSource={d.coaAccounts}
              columns={[
                { title: 'Code', dataIndex: 'code', width: 130, render: (v: string) => <span className="jm-tnum">{v}</span> },
                { title: 'Account', dataIndex: 'name' },
                { title: 'Type', dataIndex: 'accountType', width: 110, render: (v: number) => <Tag>{ACCOUNT_TYPE_LABEL[v] ?? v}</Tag> },
                { title: 'Balance', dataIndex: 'balance', align: 'right', width: 150, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
                { title: 'Entries', dataIndex: 'entryCount', align: 'right', width: 90, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Last entry', dataIndex: 'lastEntryDate', width: 110, render: (v: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>â€”</span> },
                { title: 'Days', dataIndex: 'daysSinceLastEntry', align: 'right', width: 80, render: (v: number | null, r) => {
                  if (v === null) return <span style={{ color: 'var(--jm-gray-400)' }}>â€”</span>;
                  return <Tag color={r.isStale ? 'red' : v > 7 ? 'gold' : 'default'} className="jm-tnum">{v}d</Tag>;
                } },
              ]}
              locale={{ emptyText: <Empty description="No accounts" /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}



