import { Card, Row, Col, Button, Typography, Empty, Space, Alert, Progress } from 'antd';
import {
  WalletOutlined, FileTextOutlined, HeartOutlined, RiseOutlined, BankOutlined,
  PlusOutlined, SearchOutlined, ClockCircleOutlined, GiftOutlined,
  TeamOutlined, CalendarOutlined, UserOutlined, CheckCircleOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { authStore } from '../../../shared/auth/authStore';
import { KpiCard } from '../../../shared/ui/KpiCard';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { money, compactMoney } from '../../../shared/format/format';
import { portalMeApi, type MemberDashboard } from './portalMeApi';

/// Member portal home. Uses the SAME shared KpiCard + PageHeader + chart patterns as the
/// operator DashboardPage, just sourced from /portal/me/dashboard with member-scoped data.
/// Lifts the look-and-feel one-to-one rather than rolling a parallel component set.
export function MemberHomePage() {
  const user = authStore.getUser();
  const navigate = useNavigate();
  const dq = useQuery({ queryKey: ['portal-me-dashboard'], queryFn: portalMeApi.dashboard });
  const data = dq.data;
  const cur = data?.currency ?? 'INR';

  const greeting = getGreeting();
  const firstName = (user?.fullName ?? '').split(' ')[0];

  const trend = (data?.collectionTrend ?? []).map((p) => ({
    label: dayjs(p.month).format('MMM'),
    month: p.month,
    amount: p.amount,
  }));
  const trendTotal = trend.reduce((s, p) => s + p.amount, 0);
  const trendAvg = trend.length > 0 ? trendTotal / trend.length : 0;
  const fundShare = (data?.fundShare ?? []).slice(0, 8);

  // Same accent palette as the operator DashboardInsights donut.
  const FUND_COLORS = ['#0B6E63', '#1E40AF', '#7C3AED', '#D97706', '#0E7490', '#DC2626', '#0E5C40', '#9333EA'];

  return (
    <div className="jm-stack jm-portal-home">
      <div>
        <Typography.Paragraph className="jm-portal-home-date">
          {dayjs().format('dddd, DD MMMM YYYY')}
        </Typography.Paragraph>
        <PageHeader
          title={`${greeting}${firstName ? ', ' + firstName : ''}`}
          subtitle="Your contributions, commitments, loans and pending tasks - at a glance."
          actions={
            <Space>
              <Link to="/portal/me/profile">
                <Button icon={<UserOutlined />}>My profile</Button>
              </Link>
              <Link to="/portal/me/commitments/new">
                <Button type="primary" icon={<PlusOutlined />}>New commitment</Button>
              </Link>
            </Space>
          }
        />
      </div>

      {dq.isError && (
        <Alert type="error" showIcon
          message="Couldn't load your dashboard."
          description={(dq.error as Error)?.message ?? 'Please retry.'} />
      )}

      {data && data.pendingGuarantorRequests > 0 && (
        <Alert type="warning" showIcon
          message={`You have ${data.pendingGuarantorRequests} pending guarantor request${data.pendingGuarantorRequests === 1 ? '' : 's'}.`}
          description="A fellow member has asked you to act as kafil. Endorse or decline from your inbox."
          action={<Link to="/portal/me/guarantor-inbox"><Button type="primary" size="small">Open inbox</Button></Link>} />
      )}
      {data && data.nextInstallment && dayjs(data.nextInstallment.dueDate).diff(dayjs(), 'day') <= 7 && (
        <Alert type="info" showIcon
          message={`Instalment #${data.nextInstallment.installmentNo} of ${data.nextInstallment.commitmentCode} is due ${dayjs(data.nextInstallment.dueDate).fromNow()}.`}
          description={`${money(data.nextInstallment.amountDue, data.nextInstallment.currency)} for ${data.nextInstallment.fundName}.`}
          action={<Link to={`/portal/me/commitments/${data.nextInstallment.commitmentId}`}><Button type="primary" size="small">View commitment</Button></Link>} />
      )}

      {/* 4 headline KPIs, one-to-one with the operator dashboard's KpiCard. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<WalletOutlined />} label="YTD contributions"
            value={data?.ytdContributions ?? null} format="money" currency={cur}
            deltaPercent={data?.monthDelta ?? null}
            caption={`${data?.ytdReceiptCount ?? 0} receipt${(data?.ytdReceiptCount ?? 0) === 1 ? '' : 's'} this year`}
            accent="var(--jm-primary-500)" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<HeartOutlined />} label="Active commitments"
            value={data?.activeCommitments ?? null} format="number"
            deltaPercent={null}
            caption={data ? `${compactMoney(data.commitmentOutstanding, cur)} outstanding` : undefined}
            accent="#C9A34B" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<BankOutlined />} label="QH loans"
            value={data?.activeQhLoans ?? null} format="number"
            deltaPercent={null}
            caption={data ? `${compactMoney(data.qhOutstanding, cur)} outstanding` : undefined}
            accent="#2563EB" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<TeamOutlined />} label="Pending guarantor"
            value={data?.pendingGuarantorRequests ?? null} format="number"
            deltaPercent={null}
            caption={(data?.pendingGuarantorRequests ?? 0) > 0 ? 'Action required' : 'All caught up'}
            accent="#0A8754" />
        </Col>
      </Row>

      {/* Chart row: contribution trend (last 12 months) + fund share donut. Same shapes as
          the operator DashboardInsights so the visual language is identical. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Your contributions - last 12 months" size="small" className="jm-card jm-portal-chart-card"
            extra={<span className="jm-portal-chart-extra">Avg <span className="jm-tnum">{money(trendAvg, cur)}</span> · Total <span className="jm-tnum">{money(trendTotal, cur)}</span></span>}>
            {trend.length === 0 || trendTotal === 0 ? (
              <Empty description="No contribution history yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="memberTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0B6E63" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0B6E63" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={70}
                    tickFormatter={(v: number) => compactMoney(v, cur)} />
                  <Tooltip
                    formatter={(v: number) => money(v, cur)}
                    labelFormatter={(_l, p) => p[0]?.payload?.month ? dayjs(p[0].payload.month).format('MMMM YYYY') : ''}
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                  <Area type="monotone" dataKey="amount" stroke="none" fill="url(#memberTrendFill)" />
                  <Line type="monotone" dataKey="amount" stroke="#0B6E63" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Fund share" size="small" className="jm-card jm-portal-chart-card">
            {fundShare.length === 0 ? (
              <Empty description="No fund-attributed receipts yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={fundShare} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {fundShare.map((_, i) => <Cell key={i} fill={FUND_COLORS[i % FUND_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v, cur)} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Quick actions card - mirrors the operator dashboard pattern exactly. */}
      <Card title="Quick actions" className="jm-card jm-portal-quick-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <QuickAction icon={<HeartOutlined />} title="New commitment"
              description="Make a new pledge to a fund" accent="var(--jm-primary-500)"
              onClick={() => navigate('/portal/me/commitments/new')} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <QuickAction icon={<BankOutlined />} title="Apply for QH"
              description="Request a Qarzan Hasana loan" accent="#2563EB"
              onClick={() => navigate('/portal/me/qarzan-hasana/new')} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <QuickAction icon={<GiftOutlined />} title="Subscribe to a fund"
              description="Sabil, Mutafariq, Niyaz enrolment" accent="#C9A34B"
              onClick={() => navigate('/portal/me/fund-enrollments/new')} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <QuickAction icon={<SearchOutlined />} title="Find a receipt"
              description="Browse + download duplicate copies" accent="#0A8754"
              onClick={() => navigate('/portal/me/contributions')} />
          </Col>
        </Row>
      </Card>

      {/* Recent activity (left) + Active commitments (right) row. Same 14/10 split + same
          card chrome as the operator dashboard's bottom row. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Recent contributions"
            extra={<Link to="/portal/me/contributions"><Button type="link" size="small">View all</Button></Link>}
            className="jm-card jm-portal-activity-card"
            styles={{ body: { padding: 0 } }}>
            {dq.isLoading ? null : (data?.recentContributions.length ?? 0) > 0 ? (
              <div>
                {data!.recentContributions.map((r) => (
                  <Link key={r.id} to={`/portal/me/contributions/${r.id}`} className="jm-portal-activity-row">
                    <span className="jm-portal-activity-icon jm-portal-activity-icon--receipt">
                      <FileTextOutlined />
                    </span>
                    <div className="jm-portal-activity-body">
                      <div className="jm-portal-activity-headline">
                        <span className="jm-tnum jm-portal-activity-ref">{r.receiptNumber ?? '—'}</span>
                        <span className="jm-portal-activity-title">Contribution receipt</span>
                      </div>
                      <span className="jm-portal-activity-meta">{dayjs(r.receiptDate).fromNow()} · {dayjs(r.receiptDate).format('DD MMM YYYY')}</span>
                    </div>
                    <span className="jm-tnum jm-portal-activity-amt">{money(r.amount, r.currency)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty image={<ClockCircleOutlined className="jm-portal-empty-icon" />}
                description={<div className="jm-portal-empty-body">
                  <div className="jm-portal-empty-title">No contributions yet</div>
                  <div className="jm-portal-empty-sub">Receipts issued in your name appear here in real time.</div>
                </div>} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Active commitments" className="jm-card jm-portal-active-card"
            extra={<Link to="/portal/me/commitments"><Button type="link" size="small">Manage all</Button></Link>}>
            {(data?.activeCommitmentsList.length ?? 0) === 0 ? (
              <Empty description="No active commitments." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" size={12} className="jm-full-width">
                {data!.activeCommitmentsList.map((c) => {
                  const pct = c.totalAmount > 0 ? Math.round((c.paidAmount / c.totalAmount) * 100) : 0;
                  return (
                    <Link key={c.id} to={`/portal/me/commitments/${c.id}`} className="jm-portal-mini-commitment">
                      <div className="jm-portal-mini-commitment-head">
                        <strong>{c.code}</strong>
                        <span className="jm-tnum">{compactMoney(c.paidAmount, c.currency)} / {compactMoney(c.totalAmount, c.currency)}</span>
                      </div>
                      <div className="jm-portal-mini-commitment-fund">{c.fundName}</div>
                      <Progress percent={pct} showInfo={false} size="small"
                        strokeColor={{ from: 'var(--jm-primary-500)', to: 'var(--jm-success-fg-strong)' }} />
                      <div className="jm-portal-mini-commitment-foot">
                        <span className="jm-portal-mini-commitment-pct">{pct}% paid</span>
                        <span>{compactMoney(c.remainingAmount, c.currency)} outstanding</span>
                      </div>
                    </Link>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* Status strip + browse tiles. Replaces the previous "tiny tag list" with bordered
          summary cards (clickable through to the relevant sections). */}
      {data && (data.pendingChangeRequests > 0 || data.upcomingEventCount > 0) && (
        <Row gutter={[12, 12]}>
          {data.pendingChangeRequests > 0 && (
            <Col xs={12} md={6}>
              <SmallCard accent="#D97706" icon={<CheckCircleOutlined />}
                label="Profile changes awaiting review" value={data.pendingChangeRequests}
                onClick={() => navigate('/portal/me/profile')} />
            </Col>
          )}
          {data.upcomingEventCount > 0 && (
            <Col xs={12} md={6}>
              <SmallCard accent="#2563EB" icon={<CalendarOutlined />}
                label="Upcoming event registrations" value={data.upcomingEventCount}
                onClick={() => navigate('/portal/me/events')} />
            </Col>
          )}
        </Row>
      )}

      <BrowseTiles />
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function QuickAction({ icon, title, description, onClick, accent }: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void; accent: string;
}) {
  // Class-based version of the operator dashboard's QuickAction button (no inline styles).
  return (
    <button type="button" onClick={onClick} className="jm-portal-quick-action">
      <span className="jm-portal-quick-action-icon" data-accent={accent}>{icon}</span>
      <span className="jm-portal-quick-action-body">
        <span className="jm-portal-quick-action-title">{title}</span>
        <span className="jm-portal-quick-action-desc">{description}</span>
      </span>
    </button>
  );
}

function SmallCard({ accent, icon, label, value, onClick }: {
  accent: string; icon: React.ReactNode; label: string; value: number; onClick?: () => void;
}) {
  return (
    <Card hoverable size="small" className="jm-card jm-portal-small-card" onClick={onClick}
      data-accent={accent}>
      <div className="jm-portal-small-card-row">
        <span className="jm-portal-small-card-icon">{icon}</span>
        <div>
          <div className="jm-portal-small-card-label">{label}</div>
          <div className="jm-tnum jm-portal-small-card-value">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function BrowseTiles() {
  return (
    <Card title="Browse" className="jm-card">
      <Row gutter={[12, 12]}>
        <BrowseTile to="/portal/me/contributions" icon={<GiftOutlined />} title="Contributions" hint="Receipts + duplicate copies" />
        <BrowseTile to="/portal/me/commitments" icon={<HeartOutlined />} title="Commitments" hint="Pledges + schedule" />
        <BrowseTile to="/portal/me/fund-enrollments" icon={<GiftOutlined />} title="Patronages" hint="Sabil / Mutafariq / Niyaz" />
        <BrowseTile to="/portal/me/qarzan-hasana" icon={<BankOutlined />} title="Qarzan Hasana" hint="Loans + applications" />
        <BrowseTile to="/portal/me/guarantor-inbox" icon={<TeamOutlined />} title="Guarantor inbox" hint="Endorse / decline kafil" />
        <BrowseTile to="/portal/me/events" icon={<CalendarOutlined />} title="Events" hint="Registrations" />
        <BrowseTile to="/portal/me/profile" icon={<UserOutlined />} title="My profile" hint="Contact + address" />
        <BrowseTile to="/portal/me/login-history" icon={<HistoryOutlined />} title="Login history" hint="Session audit" />
      </Row>
    </Card>
  );
}

function BrowseTile({ to, icon, title, hint }: { to: string; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <Col xs={12} sm={8} md={6} lg={6}>
      <Link to={to} className="jm-portal-browse-tile">
        <span className="jm-portal-browse-tile-icon">{icon}</span>
        <div>
          <div className="jm-portal-browse-tile-title">{title}</div>
          <div className="jm-portal-browse-tile-hint">{hint}</div>
        </div>
      </Link>
    </Col>
  );
}

// Keep the export so existing routing keeps working.
export type { MemberDashboard };
