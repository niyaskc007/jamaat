import { Card, Row, Col, Empty, Tag, Spin, Alert, Button, Table, Descriptions, Progress } from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, RiseOutlined, TeamOutlined, FileTextOutlined,
  GoldOutlined, HourglassOutlined, CheckCircleOutlined, InfoCircleOutlined,
  CalendarOutlined, UserOutlined, IdcardOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip as RTooltip,
} from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { money, formatDate } from '../../shared/format/format';
import { dashboardApi } from '../ledger/ledgerApi';
import { downloadDashboardXlsx } from './DashboardFilterBar';

const ACCENT = {
  positive: '#0E5C40', financial: '#7C3AED', cyan: '#0E7490',
  caution: '#D97706', danger: '#DC2626', neutral: '#475569',
} as const;

const MEMBER_STATUS = ['Unknown', 'Active', 'Inactive', 'Deceased', 'Suspended'];
const VERIFICATION_STATUS = ['NotStarted', 'Pending', 'Verified', 'Rejected'];
const COMMITMENT_STATUS = ['', 'Draft', 'Active', 'Completed', 'Cancelled', 'Defaulted', 'Paused'];
const QH_STATUS = ['', 'Draft', 'PendingLevel1', 'PendingLevel2', 'Approved', 'Disbursed',
  'Active', 'Completed', 'Defaulted', 'Cancelled', 'Rejected'];
const RECEIPT_STATUS = ['', 'Draft', 'Confirmed', 'Cancelled', 'Reversed', 'PendingClearance'];

/// /dashboards/members/:memberId - 360 view of one member.
export function MemberDetailDashboardPage() {
  const navigate = useNavigate();
  const { memberId } = useParams<{ memberId: string }>();
  const q = useQuery({
    queryKey: ['dash', 'member-detail', memberId],
    queryFn: () => dashboardApi.memberDetail(memberId!),
    enabled: !!memberId,
  });

  if (q.isLoading || !q.data) {
    return (
      <div>
        <PageHeader title="Member detail"
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>All dashboards</Button>} />
        <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>
      </div>
    );
  }
  const d = q.data;
  const trend = d.monthlyContributionTrend.map((p) => ({
    label: new Date(p.year, p.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    Amount: p.amount,
    Receipts: p.count,
  }));

  const subtitle = [d.itsNumber, MEMBER_STATUS[d.status] ?? '?', d.familyName, d.sectorName]
    .filter(Boolean).join(' · ');

  return (
    <div>
      <PageHeader title={d.fullName} subtitle={subtitle}
        actions={<>
          <Button icon={<DownloadOutlined />} style={{ marginInlineEnd: 8 }}
            onClick={() => downloadDashboardXlsx(`/api/v1/dashboard/members/${d.memberId}.xlsx`, {},
              `member-statement_${d.itsNumber}.xlsx`)}>
            Statement
          </Button>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>All dashboards</Button>
        </>} />

      <Card size="small" className="jm-card" styles={{ body: { padding: 16 } }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3, lg: 4 }}>
          <Descriptions.Item label="ITS"><span className="jm-tnum">{d.itsNumber}</span></Descriptions.Item>
          <Descriptions.Item label="Status"><Tag color={d.status === 1 ? 'green' : 'default'}>{MEMBER_STATUS[d.status] ?? '?'}</Tag></Descriptions.Item>
          <Descriptions.Item label="Verification">
            <Tag color={d.verificationStatus === 2 ? 'green' : d.verificationStatus === 3 ? 'red' : 'gold'}>
              {VERIFICATION_STATUS[d.verificationStatus] ?? '?'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="DOB">{d.dateOfBirth ? formatDate(d.dateOfBirth) : '—'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{d.phone ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{d.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Family">
            {d.familyId ? <Link to={`/families/${d.familyId}`}>{d.familyCode} · {d.familyName}</Link> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Sector">{d.sectorName ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <div style={{ blockSize: 12 }} />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Lifetime contributions" value={d.lifetimeContribution} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="YTD contributions" value={d.ytdContribution} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<RiseOutlined />} label="This month" value={d.monthContribution} currency={d.currency} accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<FileTextOutlined />} label="Lifetime receipts" value={d.lifetimeReceiptCount} format="number" accent={ACCENT.neutral} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Active commitments" value={d.commitmentCount} format="number" accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Loans (count)" value={d.loanCount} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Loans outstanding" value={d.loansOutstanding} currency={d.currency} accent={ACCENT.danger} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<GoldOutlined />} label="Asset value" value={d.assetValue} currency={d.currency} accent={ACCENT.financial} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<CalendarOutlined />} label="Event registrations" value={d.eventRegistrationCount} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Event check-ins" value={d.eventCheckedInCount} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<UserOutlined />} label="Committed total" value={d.committedTotal} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<IdcardOutlined />} label="Assets" value={d.assetCount} format="number" accent={ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card title="Monthly contribution trend (12 months)" size="small" className="jm-card">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                <Line type="monotone" dataKey="Amount" stroke={ACCENT.financial} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Contribution by fund (top 8)" size="small" className="jm-card">
            {d.contributionByFund.length === 0 ? <Empty description="No contributions" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.contributionByFund} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip formatter={(v: any) => money(Number(v) || 0, d.currency)} />
                  <Bar dataKey="amount" fill={ACCENT.financial} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Commitments" size="small" className="jm-card">
            <Table rowKey="commitmentId" size="small" pagination={false} dataSource={d.commitments}
              columns={[
                { title: 'Fund', dataIndex: 'fundName', ellipsis: true,
                  render: (v: string, r) => <Link to={`/dashboards/commitments/${r.commitmentId}`}>{v}</Link> },
                { title: 'Status', dataIndex: 'status', width: 110, render: (v: number) => <Tag>{COMMITMENT_STATUS[v] ?? v}</Tag> },
                { title: 'Total', dataIndex: 'totalAmount', align: 'right', width: 120, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
                { title: 'Progress', key: 'pr', width: 130, render: (_, r) => {
                  const p = r.totalAmount === 0 ? 0 : Math.round(r.paidAmount * 100 / r.totalAmount);
                  return <Progress percent={p} size="small" />;
                } },
                { title: 'Open', key: 'a', width: 80, render: (_, r) => r.overdueInstallments > 0
                  ? <Tag color="red" className="jm-tnum">{r.overdueInstallments} overdue</Tag>
                  : <span className="jm-tnum">{r.installmentsTotal - r.installmentsPaid}</span>
                },
                { title: '', key: 'op', width: 50, render: (_, r) => <Link to={`/dashboards/commitments/${r.commitmentId}`}>open</Link> },
              ]}
              locale={{ emptyText: <Empty description="No commitments" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="QH loans" size="small" className="jm-card">
            <Table rowKey="loanId" size="small" pagination={false} dataSource={d.loans}
              columns={[
                { title: 'Code', dataIndex: 'loanCode', width: 110,
                  render: (v: string, r) => <Link to={`/qarzan-hasana/${r.loanId}`} className="jm-tnum">{v}</Link> },
                { title: 'Status', dataIndex: 'status', width: 120, render: (v: number) => <Tag>{QH_STATUS[v] ?? v}</Tag> },
                { title: 'Disbursed', dataIndex: 'amountDisbursed', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
                { title: 'Outstanding', dataIndex: 'amountOutstanding', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No loans" /> }}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Recent receipts" size="small" className="jm-card">
            <Table rowKey="receiptId" size="small" pagination={false} dataSource={d.recentReceipts}
              columns={[
                { title: 'Receipt #', dataIndex: 'receiptNumber', width: 120, render: (v: string | null, r) => <Link to={`/receipts/${r.receiptId}`} className="jm-tnum">{v ?? '—'}</Link> },
                { title: 'Date', dataIndex: 'receiptDate', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Status', dataIndex: 'status', width: 120, render: (v: number) => <Tag>{RECEIPT_STATUS[v] ?? v}</Tag> },
                { title: 'Amount', dataIndex: 'amount', align: 'right', width: 140, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No receipts" /> }}
            />
          </Card>
        </Col>
      </Row>

      {d.lifetimeReceiptCount === 0 && d.commitmentCount === 0 && d.loanCount === 0 && (
        <Alert type="info" showIcon icon={<InfoCircleOutlined />} className="jm-alert-after-card"
          message="No activity recorded for this member yet"
          description="Once contributions, commitments, or loans are recorded, this dashboard will fill in." />
      )}

      <div style={{ marginBlockStart: 16 }}>
        <Button onClick={() => navigate(`/members/${d.memberId}`)}>Open member in Members module</Button>
      </div>
    </div>
  );
}
