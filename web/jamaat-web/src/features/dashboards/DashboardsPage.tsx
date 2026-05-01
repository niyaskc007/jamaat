import { useState } from 'react';
import {
  Card, Row, Col, Statistic, Empty, Tag, Table, Button, Spin, Progress, Alert, Select, Segmented,
} from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, BarChartOutlined, DashboardOutlined,
  TeamOutlined, SafetyOutlined, ClockCircleOutlined, ThunderboltOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip, Legend,
} from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money, formatDate } from '../../shared/format/format';
import { dashboardApi, type NamedCountPoint } from '../ledger/ledgerApi';
import { useAuth } from '../../shared/auth/useAuth';

/// Catalog of every dashboard. The card-grid landing iterates this list and slug routes
/// (/dashboards/:slug) render the matching component. Drop a new entry in DASHBOARDS to
/// register a new dashboard everywhere it should show up.
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
  {
    slug: 'operations', title: 'Operations', group: 'Operations',
    description: "Today's collection, pending approvals, recent activity. The cashier and approver home.",
    icon: <DashboardOutlined />, color: '#0E5C40',
    href: '/dashboard',
  },
  {
    slug: 'member-engagement', title: 'Member engagement', group: 'Operations',
    description: 'Status, verification, gender / age / sector / role splits, new-member trend.',
    icon: <TeamOutlined />, color: '#0E7490',
    needsAny: ['member.view'],
    render: () => <MemberEngagementDashboard />,
  },
  {
    slug: 'treasury', title: 'Treasury', group: 'Financial',
    description: 'Income vs expense, top contributors, voucher categories - the accounting home.',
    icon: <BarChartOutlined />, color: '#7C3AED',
    href: '/accounting',
    needsAny: ['accounting.view'],
  },
  {
    slug: 'qh-portfolio', title: 'QH portfolio', group: 'Financial',
    description: 'Status mix, repayment trend, top borrowers, upcoming installments, scheme/gold breakdown.',
    icon: <BankOutlined />, color: '#9333EA',
    needsAny: ['qh.view'],
    render: () => <QhPortfolioDashboard />,
  },
  {
    slug: 'receivables', title: 'Receivables aging', group: 'Financial',
    description: 'Aging buckets across commitments + returnables, cheque pipeline, upcoming maturities.',
    icon: <ClockCircleOutlined />, color: '#D97706',
    needsAny: ['reports.view'],
    render: () => <ReceivablesAgingDashboard />,
  },
  {
    slug: 'reliability', title: 'Reliability', group: 'Insight',
    description: 'Cross-member behavior overview - grade distribution, top reliable, members needing outreach.',
    icon: <ThunderboltOutlined />, color: '#0E5C40',
    href: '/admin/reliability',
    needsAny: ['admin.reliability'],
  },
  {
    slug: 'compliance', title: 'Compliance + audit', group: 'Insight',
    description: 'Audit volume + top users + entities, errors by severity/source, change-request queues.',
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

// -- Shared helpers ----------------------------------------------------------

const PIE_COLORS = ['#0E5C40', '#7C3AED', '#0E7490', '#D97706', '#DC2626', '#9333EA', '#475569', '#92400E'];

function StatCard({ title, value, color, suffix }: { title: string; value: React.ReactNode; color?: string; suffix?: React.ReactNode }) {
  return (
    <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
      <Statistic title={title} value={value as any} valueStyle={color ? { color } : undefined} suffix={suffix} />
    </Card>
  );
}

/// Wraps a useQuery result for a dashboard call. Returns null while loading-or-errored,
/// rendering a Spin or an actionable error card. Without this we'd hang on infinite spinners
/// when the API is down or a permission is missing.
function DashShell<T>({ query, children }: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => void };
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) {
    return <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>;
  }
  if (query.isError || !query.data) {
    const err: any = query.error;
    const status = err?.response?.status;
    const isAuth = status === 401 || status === 403;
    const message = isAuth
      ? "You don't have permission to view this dashboard, or your session has expired."
      : (err?.message ?? "Couldn't load this dashboard. The API may be unavailable.");
    return (
      <Alert type={isAuth ? 'warning' : 'error'} showIcon message="Failed to load dashboard" description={message}
        action={<Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>Retry</Button>} />
    );
  }
  return <>{children(query.data)}</>;
}

/// Small table-ish card that renders a NamedCountPoint[] as ranked rows. Used for "top X"
/// panels and lightweight category breakdowns where a chart would be overkill.
function NamedRanking({ title, rows, emptyText, valueLabel = 'Count' }: {
  title: string; rows: NamedCountPoint[]; emptyText: string; valueLabel?: string;
}) {
  return (
    <Card title={title} size="small" style={{ border: '1px solid var(--jm-border)' }}>
      {rows.length === 0 ? <Empty description={emptyText} /> : (
        <Table rowKey={(r, i) => `${r.label}-${i}`} size="small" pagination={false} dataSource={rows}
          columns={[
            { title: 'Label', dataIndex: 'label', key: 'l' },
            { title: valueLabel, dataIndex: 'count', key: 'c', align: 'right', width: 90,
              render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{v}</span> },
          ]} />
      )}
    </Card>
  );
}

function NamedPieCard({ title, rows, emptyText, height = 240, palette = PIE_COLORS }: {
  title: string; rows: NamedCountPoint[]; emptyText: string; height?: number; palette?: string[];
}) {
  return (
    <Card title={title} size="small" style={{ border: '1px solid var(--jm-border)' }}>
      {rows.length === 0 ? <Empty description={emptyText} /> : (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={Math.round(height * 0.35)} label>
              {rows.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <RTooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// -- QH Portfolio ------------------------------------------------------------

function QhPortfolioDashboard() {
  const q = useQuery({ queryKey: ['dash', 'qh-portfolio'], queryFn: dashboardApi.qhPortfolio, retry: false });
  return (
    <DashShell query={q}>
      {(d) => {
        const trendData = d.repaymentTrend.map((p) => ({
          label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
          Disbursed: p.disbursed, Repaid: p.repaid,
        }));
        const statusBucketsAsNamed: NamedCountPoint[] = d.byStatus.map((b) => ({ label: b.label, count: b.count }));
        const schemeBucketsAsNamed: NamedCountPoint[] = d.bySchemeMix.map((b) => ({ label: b.label, count: b.count }));

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
            <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
              <Col xs={12} md={6}><StatCard title="Avg loan size" value={money(d.averageLoanSize, d.currency)} /></Col>
              <Col xs={12} md={6}><StatCard title="Avg installments" value={d.averageInstallments} /></Col>
              <Col xs={12} md={6}><StatCard title="Gold-backed loans" value={`${d.goldBackedCount} (${money(d.goldBackedTotal, d.currency)})`} /></Col>
              <Col xs={12} md={6}><StatCard title="Overdue installments" value={d.overdueInstallmentsTotal} color={d.overdueInstallmentsTotal > 0 ? '#DC2626' : undefined} /></Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} lg={12}>
                <NamedPieCard title="Status distribution" rows={statusBucketsAsNamed} emptyText="No loans yet" />
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
                <NamedPieCard title="Scheme mix" rows={schemeBucketsAsNamed} emptyText="No loans" />
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="Top borrowers by outstanding" style={{ border: '1px solid var(--jm-border)' }}>
                  <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topBorrowers}
                    columns={[
                      { title: 'Member', key: 'm', render: (_, r) => <Link to={`/members/${r.memberId}`}><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> · {r.fullName}</Link> },
                      { title: 'Loans', dataIndex: 'loanCount', key: 'l', align: 'right', width: 70, render: (v: number) => <span className="jm-tnum">{v}</span> },
                      { title: 'Outstanding', dataIndex: 'outstanding', key: 'o', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
                    ]}
                    locale={{ emptyText: <Empty description="No outstanding loans" /> }}
                  />
                </Card>
              </Col>

              <Col xs={24}>
                <Card size="small" title="Upcoming installments (next 30 days)" style={{ border: '1px solid var(--jm-border)' }}>
                  <Table rowKey={(r) => `${r.loanId}-${r.installmentNo}`} size="small" pagination={{ pageSize: 10 }} dataSource={d.upcomingInstallments}
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
      }}
    </DashShell>
  );
}

// -- Receivables Aging -------------------------------------------------------

type ReceivablesKind = 'all' | 'commitments' | 'returnables';

function ReceivablesAgingDashboard() {
  const [kind, setKind] = useState<ReceivablesKind>('all');
  const q = useQuery({ queryKey: ['dash', 'receivables-aging'], queryFn: dashboardApi.receivablesAging, retry: false });

  return (
    <DashShell query={q}>
      {(d) => {
        const oldestFiltered = d.oldestObligations.filter((o) => {
          if (kind === 'commitments') return o.kind === 'Commitment';
          if (kind === 'returnables') return o.kind === 'Returnable';
          return true;
        });

        return (
          <div>
            {/* Filter strip - lets the user narrow the oldest-obligations table without re-querying. */}
            <Card size="small" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 12 }}>
              <Segmented
                value={kind}
                onChange={(v) => setKind(v as ReceivablesKind)}
                options={[
                  { label: 'All obligations', value: 'all' },
                  { label: 'Commitments only', value: 'commitments' },
                  { label: 'Returnables only', value: 'returnables' },
                ]}
              />
            </Card>

            <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
              <Col xs={12} md={6}><StatCard title="Commitments outstanding" value={money(d.commitmentsOutstanding, d.currency)} color="#92400E" /></Col>
              <Col xs={12} md={6}><StatCard title="Overdue commitment installments" value={d.commitmentsOverdueCount} color={d.commitmentsOverdueCount > 0 ? '#DC2626' : undefined} /></Col>
              <Col xs={12} md={6}><StatCard title="Returnables outstanding" value={money(d.returnablesOutstanding, d.currency)} color="#D97706" /></Col>
              <Col xs={12} md={6}><StatCard title="Overdue returnables" value={d.returnablesOverdueCount} color={d.returnablesOverdueCount > 0 ? '#DC2626' : undefined} /></Col>
            </Row>

            <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
              <Col xs={12} md={6}><StatCard title="Cheques in pipeline" value={`${d.chequesPledgedCount} pledged`} /></Col>
              <Col xs={12} md={18}>
                <Card size="small" title="Cheque pipeline" style={{ border: '1px solid var(--jm-border)' }}>
                  {d.chequePipeline.length === 0 ? <Empty description="No cheques in pipeline" /> : (
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={d.chequePipeline} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="statusLabel" type="category" tick={{ fontSize: 11 }} width={90} />
                        <RTooltip formatter={(v: any) => Number(v).toLocaleString()} />
                        <Bar dataKey="count" name="Cheques" fill="#1E40AF" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
            </Row>

            {(kind === 'all' || kind === 'commitments') && (
              <Row gutter={[12, 12]}>
                <Col xs={24} lg={12}>
                  <Card title="Commitment aging" size="small" style={{ border: '1px solid var(--jm-border)' }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={d.commitmentBuckets}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <RTooltip formatter={(v: any, name: any) => name === 'amount' ? money(Number(v) || 0, d.currency) : (v as number | string)} />
                        <Bar dataKey="count" fill="#0E5C40" name="Installments" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <NamedRanking title="Open commitments by fund" rows={d.commitmentsByFund} emptyText="No open commitments" valueLabel="Count" />
                </Col>
              </Row>
            )}

            {(kind === 'all' || kind === 'returnables') && (
              <Row gutter={[12, 12]} style={{ marginBlockStart: kind === 'all' ? 12 : 0 }}>
                <Col xs={24} lg={12}>
                  <Card title="Returnables aging" size="small" style={{ border: '1px solid var(--jm-border)' }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={d.returnableBuckets}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <RTooltip formatter={(v: any, name: any) => name === 'amount' ? money(Number(v) || 0, d.currency) : (v as number | string)} />
                        <Bar dataKey="count" fill="#D97706" name="Receipts" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card size="small" title="Upcoming maturities (next 30 days)" style={{ border: '1px solid var(--jm-border)' }}>
                    <Table rowKey="receiptId" size="small" pagination={false} dataSource={d.upcomingMaturities}
                      columns={[
                        { title: 'Receipt', dataIndex: 'receiptNumber', key: 'rn', width: 130, render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
                        { title: 'Member', dataIndex: 'memberName', key: 'mn' },
                        { title: 'Maturity', dataIndex: 'maturityDate', key: 'md', width: 110, render: (v: string) => formatDate(v) },
                        { title: 'Outstanding', dataIndex: 'outstanding', key: 'o', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
                      ]}
                      locale={{ emptyText: <Empty description="No returnables maturing in the next 30 days" /> }}
                    />
                  </Card>
                </Col>
              </Row>
            )}

            <Row gutter={[12, 12]} style={{ marginBlockStart: 12 }}>
              <Col xs={24}>
                <Card title={`Top oldest open obligations (${oldestFiltered.length})`} size="small" style={{ border: '1px solid var(--jm-border)' }}>
                  <Table rowKey={(r, i) => `${r.kind}-${r.reference}-${i}`} size="small" pagination={false} dataSource={oldestFiltered}
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
      }}
    </DashShell>
  );
}

// -- Member Engagement -------------------------------------------------------

function MemberEngagementDashboard() {
  const [months, setMonths] = useState<number>(12);
  const q = useQuery({
    queryKey: ['dash', 'member-engagement', months],
    queryFn: () => dashboardApi.memberEngagement(months),
    retry: false,
  });
  return (
    <DashShell query={q}>
      {(d) => {
        const statusData: NamedCountPoint[] = [
          { label: 'Active', count: d.activeMembers },
          { label: 'Inactive', count: d.inactiveMembers },
          { label: 'Deceased', count: d.deceasedMembers },
          { label: 'Suspended', count: d.suspendedMembers },
        ].filter((x) => x.count > 0);
        const verifData: NamedCountPoint[] = [
          { label: 'Verified', count: d.verifiedMembers },
          { label: 'Pending', count: d.verificationPendingMembers },
          { label: 'Not started', count: d.verificationNotStartedMembers },
          { label: 'Rejected', count: d.verificationRejectedMembers },
        ].filter((x) => x.count > 0);
        const trendData = d.newMemberTrend.map((p) => ({
          label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
          Members: p.count,
        }));
        const verifiedPct = d.totalMembers === 0 ? 0 : Math.round(d.verifiedMembers * 100 / d.totalMembers);

        return (
          <div>
            <Card size="small" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 12 }}>
              <span style={{ fontSize: 13, marginInlineEnd: 8 }}>Trend window</span>
              <Select value={months} onChange={setMonths} style={{ inlineSize: 140 }}
                options={[6, 12, 24, 36].map((m) => ({ value: m, label: `Last ${m} months` }))} />
            </Card>

            <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
              <Col xs={12} md={6}><StatCard title="Total members" value={d.totalMembers} /></Col>
              <Col xs={12} md={6}><StatCard title="Active" value={d.activeMembers} color="#0E5C40" /></Col>
              <Col xs={12} md={6}><StatCard title="New this month" value={d.newThisMonth} /></Col>
              <Col xs={12} md={6}><StatCard title="New this year" value={d.newThisYear} /></Col>
            </Row>
            <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
              <Col xs={24} md={12}>
                <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
                  <div style={{ fontSize: 14, color: 'var(--jm-gray-500)', marginBlockEnd: 8 }}>Verified profile coverage</div>
                  <Progress percent={verifiedPct} strokeColor="#0E5C40" />
                  <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>{d.verifiedMembers} of {d.totalMembers} verified</div>
                </Card>
              </Col>
              <Col xs={12} md={6}><StatCard title="Pending verification" value={d.verificationPendingMembers} color="#D97706" /></Col>
              <Col xs={12} md={6}><StatCard title="Verification rejected" value={d.verificationRejectedMembers} color="#DC2626" /></Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} lg={12}>
                <Card title={`New members per month (last ${months})`} size="small" style={{ border: '1px solid var(--jm-border)' }}>
                  {trendData.length === 0 ? <Empty description="No data" /> : (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={trendData}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <RTooltip />
                        <Line type="monotone" dataKey="Members" stroke="#0E7490" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={6}><NamedPieCard title="Member status" rows={statusData} emptyText="No members" /></Col>
              <Col xs={24} lg={6}><NamedPieCard title="Verification" rows={verifData} emptyText="No data" /></Col>

              <Col xs={24} md={12} lg={6}><NamedPieCard title="Gender" rows={d.genderSplit} emptyText="No gender data" /></Col>
              <Col xs={24} md={12} lg={6}><NamedPieCard title="Marital status" rows={d.maritalSplit} emptyText="No data" /></Col>
              <Col xs={24} md={12} lg={6}><NamedPieCard title="Age brackets" rows={d.ageBrackets} emptyText="No DOB captured" /></Col>
              <Col xs={24} md={12} lg={6}><NamedPieCard title="Hajj status" rows={d.hajjSplit} emptyText="No data" /></Col>

              <Col xs={24} md={12} lg={8}><NamedPieCard title="Misaq status" rows={d.misaqSplit} emptyText="No data" /></Col>
              <Col xs={24} md={12} lg={8}><NamedRanking title="Members by sector" rows={d.sectorSplit} emptyText="No sectors assigned" /></Col>
              <Col xs={24} md={12} lg={8}><NamedRanking title="Family role distribution" rows={d.familyRoleSplit} emptyText="No roles set" /></Col>
            </Row>
          </div>
        );
      }}
    </DashShell>
  );
}

// -- Compliance + Audit ------------------------------------------------------

function ComplianceDashboard() {
  const [days, setDays] = useState<number>(30);
  const q = useQuery({
    queryKey: ['dash', 'compliance', days],
    queryFn: () => dashboardApi.compliance(days),
    retry: false,
  });

  return (
    <DashShell query={q}>
      {(d) => {
        const auditTrendData = d.auditTrend.map((p) => ({ label: p.date.slice(5), Events: p.count }));
        const errorTrendData = d.errorTrend.map((p) => ({ label: p.date.slice(5), Errors: p.count }));

        return (
          <div>
            <Card size="small" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 12 }}>
              <span style={{ fontSize: 13, marginInlineEnd: 8 }}>Window</span>
              <Segmented
                value={days}
                onChange={(v) => setDays(Number(v))}
                options={[
                  { label: '7d', value: 7 },
                  { label: '30d', value: 30 },
                  { label: '90d', value: 90 },
                  { label: '180d', value: 180 },
                  { label: '365d', value: 365 },
                ]}
              />
            </Card>

            <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
              <Col xs={12} md={6}><StatCard title={`Audit events (${d.windowDays}d)`} value={d.auditEventsTotal} /></Col>
              <Col xs={12} md={6}><StatCard title="Open errors" value={d.openErrors} color={d.openErrors > 0 ? '#DC2626' : undefined} /></Col>
              <Col xs={12} md={6}><StatCard title="Pending change requests" value={d.pendingChangeRequests} color={d.pendingChangeRequests > 0 ? '#D97706' : undefined} /></Col>
              <Col xs={12} md={6}><StatCard title="Pending voucher approvals" value={d.pendingVoucherApprovals} color={d.pendingVoucherApprovals > 0 ? '#D97706' : undefined} /></Col>
            </Row>
            <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
              <Col xs={12} md={6}><StatCard title="Draft receipts" value={d.draftReceipts} /></Col>
              <Col xs={12} md={6}><StatCard title="Unverified members" value={d.unverifiedMembers} /></Col>
              <Col xs={24} md={12}>
                <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
                  <div style={{ fontSize: 14, color: 'var(--jm-gray-500)', marginBlockEnd: 6 }}>Open financial period</div>
                  {d.hasOpenPeriod ? (
                    <span>
                      <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>{d.openPeriodName}</Tag>
                      {d.periodOpenDays != null && <span style={{ marginInlineStart: 8, fontSize: 12, color: 'var(--jm-gray-600)' }}>open for {d.periodOpenDays} day(s)</span>}
                    </span>
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
                <Card title={`Audit volume (${d.windowDays} days)`} size="small" style={{ border: '1px solid var(--jm-border)' }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={auditTrendData}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(auditTrendData.length / 10))} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip />
                      <Bar dataKey="Events" fill="#475569" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title={`Error volume (${d.windowDays} days)`} size="small" style={{ border: '1px solid var(--jm-border)' }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={errorTrendData}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(errorTrendData.length / 10))} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip />
                      <Bar dataKey="Errors" fill="#DC2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>

              <Col xs={24} md={12} lg={6}>
                <NamedPieCard title="Errors by severity" rows={d.errorsBySeverity} emptyText="No open errors"
                  palette={['#94A3B8', '#D97706', '#DC2626', '#7F1D1D']} />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <NamedPieCard title="Errors by source" rows={d.errorsBySource} emptyText="No open errors" />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <NamedPieCard title="Change requests" rows={d.changeRequestsByStatus} emptyText="No change requests" />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <NamedRanking title={`Top users by audit (${d.windowDays}d)`} rows={d.topUsersByAudit} emptyText="No audit activity" valueLabel="Events" />
              </Col>

              <Col xs={24}>
                <NamedRanking title={`Top entities by audit (${d.windowDays}d)`} rows={d.topEntitiesByAudit} emptyText="No audit activity" valueLabel="Events" />
              </Col>
            </Row>
          </div>
        );
      }}
    </DashShell>
  );
}
