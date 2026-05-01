import { Card, Row, Col, Empty, Tag, Table, Button, Spin, Progress, Alert } from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, BarChartOutlined, DashboardOutlined,
  TeamOutlined, SafetyOutlined, ClockCircleOutlined, ThunderboltOutlined,
  CheckCircleOutlined, RiseOutlined, FallOutlined, WarningOutlined, StopOutlined,
  AuditOutlined, BugOutlined, FileSearchOutlined, FileTextOutlined, UserAddOutlined,
  UserOutlined, SafetyCertificateOutlined, PercentageOutlined,
  HourglassOutlined, ContainerOutlined, InfoCircleOutlined,
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

/// Catalog of every dashboard in the system. The card-grid landing iterates this list and
/// the slug routes (/dashboards/:slug) render the matching component. New dashboards land
/// here once and they show up everywhere.
type DashSlug =
  | 'operations' | 'treasury' | 'reliability'
  | 'qh-portfolio' | 'receivables' | 'member-engagement' | 'compliance';

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
          <Card title="Status distribution" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Repayment trend (last 12 months)" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Top borrowers by outstanding" size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topBorrowers}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> · {r.fullName}</span> },
                { title: 'Loans', dataIndex: 'loanCount', key: 'l', align: 'right', width: 70, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Outstanding', dataIndex: 'outstanding', key: 'o', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No outstanding loans" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Upcoming installments (next 30 days)" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Commitment aging" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Returnables aging" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="10 oldest open obligations" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="New members per month (last 12)" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Member status" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Verification status" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Audit volume (last 30 days)" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Errors by severity" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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
          <Card title="Change requests" size="small" style={{ border: '1px solid var(--jm-border)' }}>
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

