import { Card, Row, Col, Typography, Space, Statistic, Tag, Empty, Skeleton, Alert, Button, Avatar, Progress } from 'antd';
import {
  GiftOutlined, HeartOutlined, BankOutlined, TeamOutlined, CalendarOutlined,
  HistoryOutlined, UserOutlined, DollarOutlined, ClockCircleOutlined,
  WarningOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';
import { authStore } from '../../../shared/auth/authStore';
import { portalMeApi } from './portalMeApi';

/// Time-of-day-aware greeting line + the same in Arabic. Keeps tone respectful for the
/// community context.
function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'As-salamu alaykum';
  if (h < 12) return 'Sabah el-khair';
  if (h < 17) return 'Marhaban';
  return 'Masa el-khair';
}

/// Hijri (Umm al-Qura) calendar via the platform Intl API - no extra plugin required, all
/// modern browsers support the calendar key. Falls back to '' if the runtime can't render it.
function formatHijri(d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(d);
  } catch { return ''; }
}

/// Member portal home. Real KPI dashboard sourced from /api/v1/portal/me/dashboard +
/// quick-link tiles below for navigation discoverability. All numbers come from the API; nothing
/// is hard-coded. Visual styling lives in app/portal.css under the .jm-portal-* / .jm-kpi-* classes.
type Tone = 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'accent' | 'neutral';

export function MemberHomePage() {
  const user = authStore.getUser();
  const dq = useQuery({ queryKey: ['portal-me-dashboard'], queryFn: portalMeApi.dashboard });
  const data = dq.data;
  const cur = data?.currency ?? 'INR';

  const now = new Date();
  const hijri = formatHijri(now);
  const firstName = user?.fullName?.split(' ')[0] ?? 'Member';
  const initial = (user?.fullName ?? '?').slice(0, 1).toUpperCase();

  return (
    <div>
      {/* Hero greeting card: gradient background + avatar + dual date stack + primary CTA
          when there's something actionable. Replaces the bare H3 + intro paragraph. */}
      <div className="jm-portal-hero">
        <Avatar size={72} className="jm-portal-hero-avatar">{initial}</Avatar>
        <div>
          <div className="jm-portal-hero-greeting">
            {greetingFor(now)}, <span className="jm-portal-hero-name">{firstName}</span>
          </div>
          <div className="jm-portal-hero-meta">
            <span>{dayjs(now).format('dddd, DD MMM YYYY')}</span>
            {hijri && <span className="jm-portal-hero-meta-hijri">{hijri}</span>}
          </div>
        </div>
        {data?.pendingGuarantorRequests ? (
          <div className="jm-portal-hero-cta">
            <Link to="/portal/me/guarantor-inbox">
              <Button type="primary">{data.pendingGuarantorRequests} action{data.pendingGuarantorRequests === 1 ? '' : 's'} pending</Button>
            </Link>
          </div>
        ) : null}
      </div>

      {dq.isError && (
        <Alert type="error" showIcon className="jm-portal-dashboard-alert"
          message="Couldn't load your dashboard."
          description={(dq.error as Error)?.message ?? 'Please retry.'} />
      )}

      {/* --- Active-invite banners (only render when there's something to do) -- */}
      {data && data.pendingGuarantorRequests > 0 && (
        <Alert type="warning" showIcon className="jm-portal-dashboard-alert"
          message={`You have ${data.pendingGuarantorRequests} pending guarantor request${data.pendingGuarantorRequests === 1 ? '' : 's'}.`}
          description="A fellow member has asked you to act as a kafil for their Qarzan Hasana application. Endorse or decline from your inbox."
          action={<Link to="/portal/me/guarantor-inbox"><Button type="primary" size="small">Open inbox</Button></Link>} />
      )}
      {data && data.nextInstallment && dayjs(data.nextInstallment.dueDate).diff(dayjs(), 'day') <= 7 && (
        <Alert type="info" showIcon className="jm-portal-dashboard-alert"
          message={`Installment #${data.nextInstallment.installmentNo} of ${data.nextInstallment.commitmentCode} is due ${dayjs(data.nextInstallment.dueDate).fromNow()}.`}
          description={`${formatCur(data.nextInstallment.amountDue)} ${data.nextInstallment.currency} for ${data.nextInstallment.fundName}.`}
          action={<Link to={`/portal/me/commitments/${data.nextInstallment.commitmentId}`}><Button type="primary" size="small">View commitment</Button></Link>} />
      )}
      {data && data.pendingChangeRequests > 0 && (
        <Alert type="info" showIcon className="jm-portal-dashboard-alert"
          message={`${data.pendingChangeRequests} profile change${data.pendingChangeRequests === 1 ? '' : 's'} awaiting administrator review.`}
          description="No further action required from you - you'll be notified once the change has been reviewed."
          action={<Link to="/portal/me/profile"><Button size="small">View profile</Button></Link>} />
      )}

      {/* --- KPI strip ----------------------------------------------------- */}
      <Row gutter={[16, 16]}>
        <KpiCol><KpiCard
          loading={dq.isLoading} icon={<DollarOutlined />} tone="success"
          label="YTD contributions" suffix={cur}
          value={data?.ytdContributions}
          hint={`${data?.ytdReceiptCount ?? 0} receipt${(data?.ytdReceiptCount ?? 0) === 1 ? '' : 's'} this year`}
          to="/portal/me/contributions"
        /></KpiCol>
        <KpiCol><KpiCard
          loading={dq.isLoading} icon={<HeartOutlined />} tone="accent"
          label="Active commitments" value={data?.activeCommitments}
          hint={data ? `${formatCur(data.commitmentOutstanding)} ${cur} outstanding` : ''}
          to="/portal/me/commitments"
        /></KpiCol>
        <KpiCol><KpiCard
          loading={dq.isLoading} icon={<BankOutlined />} tone="info"
          label="Active QH loans" value={data?.activeQhLoans}
          hint={data ? `${formatCur(data.qhOutstanding)} ${cur} outstanding` : ''}
          to="/portal/me/qarzan-hasana"
        /></KpiCol>
        <KpiCol><KpiCard
          loading={dq.isLoading} icon={<TeamOutlined />} tone="warning"
          label="Pending guarantor requests" value={data?.pendingGuarantorRequests}
          hint={(data?.pendingGuarantorRequests ?? 0) > 0 ? 'Action required' : 'All caught up'}
          to="/portal/me/guarantor-inbox"
        /></KpiCol>
      </Row>

      {/* --- Up next + recent activity ------------------------------------ */}
      <Row gutter={[16, 16]} className="jm-portal-section-spaced">
        <Col xs={24} md={12}>
          <Card className="jm-card" title={<Space><ClockCircleOutlined /> Up next</Space>}>
            {dq.isLoading ? <Skeleton active /> : (
              <>
                {data?.nextInstallment ? (
                  <div>
                    <Typography.Paragraph className="jm-portal-upnext-text">
                      Installment <strong>#{data.nextInstallment.installmentNo}</strong> of <strong>{data.nextInstallment.commitmentCode}</strong> ({data.nextInstallment.fundName}) is due on{' '}
                      <strong>{dayjs(data.nextInstallment.dueDate).format('DD MMM YYYY')}</strong>.
                    </Typography.Paragraph>
                    <Statistic className="jm-portal-upnext-amt"
                      value={data.nextInstallment.amountDue}
                      suffix={data.nextInstallment.currency}
                      precision={2}
                    />
                    <div className="jm-portal-upnext-cta">
                      <Link to={`/portal/me/commitments/${data.nextInstallment.commitmentId}`}>
                        <Button type="primary" size="small">View commitment <ArrowRightOutlined /></Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No upcoming installments." />
                )}
                {data && (data.pendingChangeRequests > 0 || data.upcomingEventCount > 0) && (
                  <Space wrap className="jm-portal-upnext-tags">
                    {data.pendingChangeRequests > 0 && (
                      <Tag icon={<WarningOutlined />} color="gold">
                        {data.pendingChangeRequests} profile change{data.pendingChangeRequests === 1 ? '' : 's'} awaiting review
                      </Tag>
                    )}
                    {data.upcomingEventCount > 0 && (
                      <Tag icon={<CalendarOutlined />} color="blue">
                        {data.upcomingEventCount} event registration{data.upcomingEventCount === 1 ? '' : 's'}
                      </Tag>
                    )}
                  </Space>
                )}
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card className="jm-card" title={<Space><GiftOutlined /> Recent contributions</Space>}
            extra={<Link to="/portal/me/contributions">View all</Link>}>
            {dq.isLoading ? <Skeleton active /> : (
              data && data.recentContributions.length > 0 ? (
                <ul className="jm-portal-mini-list">
                  {data.recentContributions.map((r) => (
                    <li key={r.id}>
                      <Link to={`/portal/me/contributions/${r.id}`}>
                        <span className="jm-tnum">{r.receiptNumber ?? '—'}</span>
                        <span className="jm-portal-mini-meta">{dayjs(r.receiptDate).format('DD MMM YYYY')}</span>
                        <span className="jm-portal-mini-amt">{formatCur(r.amount)} {r.currency}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No contributions yet." />
              )
            )}
          </Card>
        </Col>
      </Row>

      {/* --- Active commitments donut + per-card progress ----------------- */}
      {data && data.activeCommitmentsList.length > 0 && (() => {
        const totalPaid = data.activeCommitmentsList.reduce((s, c) => s + c.paidAmount, 0);
        const totalOutstanding = data.activeCommitmentsList.reduce((s, c) => s + c.remainingAmount, 0);
        const chartData = [
          { name: 'Paid',        value: Math.max(0, totalPaid),        fill: 'var(--jm-success-fg-strong, #16a34a)' },
          { name: 'Outstanding', value: Math.max(0, totalOutstanding), fill: 'var(--jm-warning, #f59e0b)' },
        ];
        const total = totalPaid + totalOutstanding;
        const paidPct = total > 0 ? Math.round((totalPaid / total) * 100) : 0;
        return (
          <Card className="jm-card jm-portal-section-spaced"
            title={<Space><HeartOutlined /> Active commitments</Space>}
            extra={<Link to="/portal/me/commitments">Manage all</Link>}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={8}>
                <div className="jm-portal-donut-wrap">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={chartData} dataKey="value" nameKey="name"
                        innerRadius={50} outerRadius={75} paddingAngle={2}
                        startAngle={90} endAngle={-270}>
                        {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <ReTooltip formatter={(v: number, n: string) => [`${formatCur(v)} ${cur}`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="jm-portal-donut-center">
                    <div className="jm-portal-donut-pct">{paidPct}%</div>
                    <div className="jm-portal-donut-label">paid</div>
                  </div>
                </div>
                <div className="jm-portal-donut-legend">
                  <span><span className="jm-portal-donut-dot jm-portal-donut-dot--paid" />Paid {formatCur(totalPaid)} {cur}</span>
                  <span><span className="jm-portal-donut-dot jm-portal-donut-dot--out" />Outstanding {formatCur(totalOutstanding)} {cur}</span>
                </div>
              </Col>
              <Col xs={24} md={16}>
                <Row gutter={[16, 16]}>
                  {data.activeCommitmentsList.map((c) => {
                    const pct = c.totalAmount > 0 ? Math.round((c.paidAmount / c.totalAmount) * 100) : 0;
                    return (
                      <Col xs={24} md={12} key={c.id}>
                        <Link to={`/portal/me/commitments/${c.id}`} className="jm-tile-link">
                          <Card hoverable size="small" className="jm-card jm-tile">
                            <div className="jm-tile-title">{c.code}</div>
                            <div className="jm-tile-desc">{c.fundName}</div>
                            <div className="jm-portal-commit-progress">
                              <span className="jm-tnum jm-num-strong">{formatCur(c.paidAmount)}</span>
                              <span className="jm-muted"> / {formatCur(c.totalAmount)} {c.currency}</span>
                            </div>
                            <Progress percent={pct} showInfo={false} size="small"
                              strokeColor={{ from: 'var(--jm-primary-500)', to: 'var(--jm-accent-600)' }} />
                            <div className="jm-portal-commit-outstanding">
                              {formatCur(c.remainingAmount)} {c.currency} outstanding · {pct}% paid
                            </div>
                          </Card>
                        </Link>
                      </Col>
                    );
                  })}
                </Row>
              </Col>
            </Row>
          </Card>
        );
      })()}

      {/* --- Quick-link tiles (full nav) --------------------------------- */}
      <Typography.Title level={5} className="jm-portal-browse-title">Browse</Typography.Title>
      <Row gutter={[16, 16]}>
        <Tile to="/portal/me/profile" tone="primary" icon={<UserOutlined />}
          title="My profile" desc="Update contact, address, family, photo." />
        <Tile to="/portal/me/contributions" tone="success" icon={<GiftOutlined />}
          title="Contributions" desc="All receipts. Download duplicate copies." />
        <Tile to="/portal/me/commitments" tone="accent" icon={<HeartOutlined />}
          title="Commitments" desc="Pledges + installment schedule." />
        <Tile to="/portal/me/fund-enrollments" tone="success" icon={<GiftOutlined />}
          title="Patronages" desc="Sabil, Mutafariq, Niyaz enrollments." />
        <Tile to="/portal/me/qarzan-hasana" tone="info" icon={<BankOutlined />}
          title="Qarzan Hasana" desc="Existing loans, new applications." />
        <Tile to="/portal/me/guarantor-inbox" tone="warning" icon={<TeamOutlined />}
          title="Guarantor inbox" desc="Endorse / decline kafil requests." />
        <Tile to="/portal/me/events" tone="danger" icon={<CalendarOutlined />}
          title="Events" desc="Your registrations + upcoming events." />
        <Tile to="/portal/me/login-history" tone="neutral" icon={<HistoryOutlined />}
          title="Login history" desc="Where + when this account was used." />
      </Row>
    </div>
  );
}

function KpiCol({ children }: { children: React.ReactNode }) {
  return <Col xs={24} sm={12} lg={6}>{children}</Col>;
}

function KpiCard({ loading, icon, tone, label, value, suffix, hint, to }: {
  loading: boolean; icon: React.ReactNode; tone: Tone;
  label: string; value: number | undefined; suffix?: string; hint: string; to: string;
}) {
  return (
    <Link to={to} className="jm-tile-link">
      <Card hoverable className="jm-card jm-tile jm-portal-kpi">
        <Space align="start" size={12}>
          <span className={`jm-tile-icon jm-tile-icon-${tone}`}>{icon}</span>
          <div>
            <div className="jm-kpi-label">{label}</div>
            {loading ? <Skeleton.Input active size="small" /> : (
              <Statistic className="jm-kpi-value"
                value={value ?? 0}
                suffix={suffix}
                precision={typeof value === 'number' && !Number.isInteger(value) ? 2 : 0}
              />
            )}
            {hint && <div className="jm-kpi-hint">{hint}</div>}
          </div>
        </Space>
      </Card>
    </Link>
  );
}

function Tile({ to, tone, icon, title, desc }: {
  to: string; tone: Tone; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <Col xs={24} sm={12} lg={6}>
      <Link to={to} className="jm-tile-link">
        <Card hoverable className="jm-card jm-tile">
          <Space align="start" size={12}>
            <span className={`jm-tile-icon jm-tile-icon-${tone}`}>{icon}</span>
            <div>
              <div className="jm-tile-title">{title}</div>
              <div className="jm-tile-desc">{desc}</div>
            </div>
          </Space>
        </Card>
      </Link>
    </Col>
  );
}

function formatCur(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
