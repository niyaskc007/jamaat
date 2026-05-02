import { Card, Row, Col, Empty, Tag, Spin, Alert, Button, Progress } from 'antd';
import {
  ArrowLeftOutlined, CalendarOutlined, EnvironmentOutlined, TeamOutlined, CheckCircleOutlined,
  ClockCircleOutlined, UsergroupAddOutlined, PercentageOutlined, CarryOutOutlined,
  StopOutlined, InfoCircleOutlined, RiseOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip,
} from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { formatDate } from '../../shared/format/format';
import { dashboardApi } from '../ledger/ledgerApi';

const PIE_COLORS = ['#0E5C40', '#7C3AED', '#0E7490', '#D97706', '#DC2626', '#9333EA', '#475569'];
const ACCENT = {
  positive: '#0E5C40', financial: '#7C3AED', cyan: '#0E7490',
  caution: '#D97706', danger: '#DC2626', neutral: '#475569',
} as const;

/// /dashboards/events/:eventId - per-event drill-in showing the full registration funnel,
/// guest age-band breakdown, daily registration build-up curve, and per-hour check-in pattern
/// for the event day. Reached from the Events dashboard's top-events / upcoming-events tables.
export function EventDetailDashboardPage() {
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const q = useQuery({
    queryKey: ['dash', 'event-detail', eventId],
    queryFn: () => dashboardApi.eventDetail(eventId!),
    enabled: !!eventId,
  });

  if (q.isLoading || !q.data) {
    return (
      <div>
        <PageHeader title="Event detail"
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards/events')}>All events</Button>} />
        <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>
      </div>
    );
  }
  const d = q.data;
  const curve = d.registrationCurve.map((p) => ({ label: p.date.slice(5), Registrations: p.count }));
  const hourly = d.checkInArrivalPattern.map((p) => ({ label: `${p.hour.toString().padStart(2, '0')}:00`, CheckIns: p.count }));
  const subtitle = [
    formatDate(d.eventDate),
    d.place ?? null,
    d.daysUntilEvent > 0 ? `${d.daysUntilEvent} days away`
      : d.daysUntilEvent === 0 ? 'Today'
      : `${Math.abs(d.daysUntilEvent)} days ago`,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <PageHeader title={d.name} subtitle={subtitle}
        actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards/events')}>All events</Button>} />

      {!d.isActive && (
        <Alert type="warning" showIcon className="jm-alert-after-card"
          message="Event is inactive"
          description="Inactive events do not accept new registrations. Re-activate from the Events module if needed." />
      )}

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<UsergroupAddOutlined />} label="Registrations" value={d.totalRegistrations} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Confirmed" value={d.confirmed} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CarryOutOutlined />} label="Checked in" value={d.checkedIn} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Cancelled" value={d.cancelled} format="number" accent={ACCENT.danger} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<TeamOutlined />} label="Total seats" value={d.totalSeats} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<TeamOutlined />} label="Total guests" value={d.totalGuests} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}>
          <Card size="small" className="jm-card" styles={{ body: { padding: 14 } }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--jm-gray-500)' }}>Capacity fill</div>
            <Progress percent={d.fillPercent} strokeColor={d.fillPercent >= 90 ? ACCENT.danger : d.fillPercent >= 60 ? ACCENT.caution : ACCENT.positive} />
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }} className="jm-tnum">
              {d.capacity == null ? 'No capacity set' : `${d.totalSeats} / ${d.capacity}`}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Pending" value={d.pending} format="number" accent={ACCENT.caution} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card title="Registration build-up (last 30 days)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={curve}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="Registrations" stroke={ACCENT.financial} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Status mix" size="small" className="jm-card">
            {d.statusMix.length === 0 ? <Empty description="No registrations" /> : (
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
          <Card title="Guest age bands" size="small" className="jm-card">
            {d.ageBandMix.length === 0 ? <Empty description="No guests" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.ageBandMix}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.cyan} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Guest relationships" size="small" className="jm-card">
            {d.relationshipMix.length === 0 ? <Empty description="No data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.relationshipMix} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={70} />
                  <RTooltip />
                  <Bar dataKey="count" fill={ACCENT.financial} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Check-in arrival pattern (UTC hour)" size="small" className="jm-card">
            {d.checkedIn === 0 ? <Empty description="No check-ins yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourly}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="CheckIns" fill={ACCENT.positive} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card size="small" className="jm-card" styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</div>
                <Tag color="blue" style={{ marginInlineStart: 0 }}><CalendarOutlined /> {d.category}</Tag>
              </div>
              {d.place && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Venue</div>
                  <span><EnvironmentOutlined /> {d.place}</span>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registrations</div>
                <Tag color={d.registrationsEnabled ? 'green' : 'red'}>
                  {d.registrationsEnabled ? <><RiseOutlined /> Enabled</> : <>Disabled</>}
                </Tag>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active</div>
                <Tag color={d.isActive ? 'green' : 'default'}>{d.isActive ? 'Yes' : 'No'}</Tag>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Guest check-ins</div>
                <span className="jm-tnum">{d.checkedInGuests} / {d.totalGuests}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Waitlisted / no-show</div>
                <span className="jm-tnum">{d.waitlisted} / {d.noShow}</span>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {d.totalRegistrations === 0 && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />} className="jm-alert-after-card"
          message="No registrations yet"
          description="Once members register through the event portal, the funnel and curves populate here." />
      )}
      <div style={{ marginBlockStart: 16 }}>
        <Button icon={<PercentageOutlined />} onClick={() => navigate(`/events/${d.eventId}`)}>
          Open event in Events module
        </Button>
      </div>
    </div>
  );
}
