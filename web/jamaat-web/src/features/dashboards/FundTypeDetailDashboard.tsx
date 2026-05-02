import { Card, Row, Col, Empty, Tag, Spin, Alert, Button, Table } from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, RiseOutlined, FallOutlined, InfoCircleOutlined,
  TeamOutlined, FileTextOutlined, GoldOutlined, HourglassOutlined, CheckCircleOutlined,
  PercentageOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip,
} from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { money } from '../../shared/format/format';
import { dashboardApi } from '../ledger/ledgerApi';

const PIE_COLORS = ['#0E5C40', '#7C3AED', '#0E7490', '#D97706', '#DC2626', '#9333EA', '#475569'];
const ACCENT = {
  positive: '#0E5C40', financial: '#7C3AED', cyan: '#0E7490',
  caution: '#D97706', danger: '#DC2626', neutral: '#475569',
} as const;

/// /dashboards/fund-types/:fundTypeId - per-fund-type drill-in. Monthly inflow trend,
/// top contributors leaderboard, enrollment status + recurrence breakdown, returnable
/// outstanding (only meaningful for funds where IsReturnable is true).
export function FundTypeDetailDashboardPage() {
  const navigate = useNavigate();
  const { fundTypeId } = useParams<{ fundTypeId: string }>();
  const q = useQuery({
    queryKey: ['dash', 'fund-type-detail', fundTypeId],
    queryFn: () => dashboardApi.fundTypeDetail(fundTypeId!, 12),
    enabled: !!fundTypeId,
  });

  if (q.isLoading || !q.data) {
    return (
      <div>
        <PageHeader title="Fund type detail"
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>All dashboards</Button>} />
        <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>
      </div>
    );
  }
  const d = q.data;
  const trend = d.monthlyInflowTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Amount: p.amount,
    Receipts: p.count,
  }));

  const subtitle = [
    d.code,
    d.isReturnable ? 'Returnable' : 'Permanent',
    d.isActive ? 'Active' : 'Inactive',
  ].join(' · ');

  return (
    <div>
      <PageHeader title={d.name} subtitle={subtitle}
        actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>All dashboards</Button>} />

      {!d.isActive && (
        <Alert type="warning" showIcon className="jm-alert-after-card"
          message="Fund type is inactive"
          description="Inactive funds are not selectable on new receipts. Re-activate from Master data if needed." />
      )}

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Total received" value={d.totalReceived} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="This month" value={d.receivedThisMonth} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="This year" value={d.receivedThisYear} currency={d.currency} accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Avg receipt" value={d.averageReceipt} currency={d.currency} accent={ACCENT.neutral} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Receipts" value={d.receiptCount} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<TeamOutlined />} label="Unique contributors" value={d.uniqueContributors} format="number" accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Active enrollments" value={d.activeEnrollments} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Total enrollments" value={d.totalEnrollments} format="number" accent={ACCENT.neutral} /></Col>
      </Row>
      {d.isReturnable && (
        <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
          <Col xs={12} md={12}><KpiCard icon={<FallOutlined />} label="Returnable outstanding" value={d.returnableOutstanding} currency={d.currency} accent={ACCENT.caution} /></Col>
          <Col xs={12} md={12}><KpiCard icon={<GoldOutlined />} label="Matured (open)" value={d.returnableMatured} currency={d.currency} accent={ACCENT.danger} /></Col>
        </Row>
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card title="Monthly inflow (last 12 months)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any, name: any) => name === 'Amount' ? money(Number(v) || 0, d.currency) : v} />
                <Line type="monotone" dataKey="Amount" stroke={ACCENT.financial} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Enrollment status" size="small" className="jm-card">
            {d.enrollmentStatusMix.length === 0 ? <Empty description="No enrollments" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={d.enrollmentStatusMix} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {d.enrollmentStatusMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Enrollment recurrence" size="small" className="jm-card">
            {d.enrollmentRecurrenceMix.length === 0 ? <Empty description="No enrollments" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.enrollmentRecurrenceMix}>
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
          <Card title="Top contributors (all-time)" size="small" className="jm-card">
            <Table rowKey="memberId" size="small" pagination={false} dataSource={d.topContributors}
              columns={[
                { title: 'Member', key: 'm', render: (_, r) => <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{r.itsNumber}</span> · {r.fullName}</span> },
                { title: 'Receipts', dataIndex: 'receiptCount', key: 'rc', align: 'right', width: 100, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Total', dataIndex: 'amount', key: 'a', align: 'right', width: 160, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No contributions yet" /> }}
            />
          </Card>
        </Col>
      </Row>

      {d.totalReceived === 0 && d.totalEnrollments === 0 && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />} className="jm-alert-after-card"
          message="No activity for this fund yet"
          description="Once contributors enroll or receipts post against this fund, the trend, leaderboard, and breakdowns populate here." />
      )}

      <div style={{ marginBlockStart: 16 }}>
        <Tag color="blue">{d.code}</Tag>
        {d.isReturnable && <Tag color="orange">Returnable</Tag>}
      </div>
    </div>
  );
}
