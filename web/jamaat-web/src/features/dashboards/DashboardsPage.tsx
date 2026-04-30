import { Card, Row, Col, Statistic, Empty, Tag, Table, Button, Spin, Progress } from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, BarChartOutlined, DashboardOutlined,
  TeamOutlined, SafetyOutlined, ClockCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip, Legend,
} from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
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

function StatCard({ title, value, color, suffix }: { title: string; value: React.ReactNode; color?: string; suffix?: React.ReactNode }) {
  return (
    <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
      <Statistic title={title} value={value as any} valueStyle={color ? { color } : undefined} suffix={suffix} />
    </Card>
  );
}

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

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><StatCard title="Total loans" value={d.totalLoans} /></Col>
        <Col xs={12} md={6}><StatCard title="Disbursed" value={money(d.totalDisbursed, d.currency)} /></Col>
        <Col xs={12} md={6}><StatCard title="Repaid" value={money(d.totalRepaid, d.currency)} color="#0E5C40" /></Col>
        <Col xs={12} md={6}><StatCard title="Outstanding" value={money(d.totalOutstanding, d.currency)} color="#92400E" /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><StatCard title="Active" value={d.activeCount} /></Col>
        <Col xs={12} md={6}><StatCard title="Completed" value={d.completedCount} /></Col>
        <Col xs={12} md={6}><StatCard title="Defaulted" value={d.defaultedCount} color="#DC2626" /></Col>
        <Col xs={12} md={6}><StatCard title="Default rate" value={d.defaultRatePercent} suffix="%" /></Col>
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

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><StatCard title="Commitments outstanding" value={money(d.commitmentsOutstanding, d.currency)} color="#92400E" /></Col>
        <Col xs={12} md={6}><StatCard title="Overdue commitment installments" value={d.commitmentsOverdueCount} color="#DC2626" /></Col>
        <Col xs={12} md={6}><StatCard title="Returnables outstanding" value={money(d.returnablesOutstanding, d.currency)} color="#D97706" /></Col>
        <Col xs={12} md={6}><StatCard title="Overdue returnables" value={d.returnablesOverdueCount} color="#DC2626" /></Col>
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

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><StatCard title="Total members" value={d.totalMembers} /></Col>
        <Col xs={12} md={6}><StatCard title="Active" value={d.activeMembers} color="#0E5C40" /></Col>
        <Col xs={12} md={6}><StatCard title="New this month" value={d.newThisMonth} /></Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <div style={{ fontSize: 14, color: 'var(--jm-gray-500)', marginBlockEnd: 8 }}>Verified</div>
            <Progress percent={verifiedPct} strokeColor="#0E5C40" />
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>{d.verifiedMembers} / {d.totalMembers}</div>
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

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><StatCard title="Audit events (30d)" value={d.auditEvents30d} /></Col>
        <Col xs={12} md={6}><StatCard title="Open errors" value={d.openErrors} color="#DC2626" /></Col>
        <Col xs={12} md={6}><StatCard title="Pending change requests" value={d.pendingChangeRequests} color="#D97706" /></Col>
        <Col xs={12} md={6}><StatCard title="Pending voucher approvals" value={d.pendingVoucherApprovals} color="#D97706" /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><StatCard title="Draft receipts" value={d.draftReceipts} /></Col>
        <Col xs={12} md={6}><StatCard title="Unverified members" value={d.unverifiedMembers} /></Col>
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

