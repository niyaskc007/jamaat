import { Card, Row, Col, Empty, Tag, Spin, Alert, Button, Table, Descriptions, Progress } from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, CheckCircleOutlined, ClockCircleOutlined,
  HourglassOutlined, WarningOutlined, FileDoneOutlined, PercentageOutlined, RiseOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { money, formatDate } from '../../shared/format/format';
import { dashboardApi } from '../ledger/ledgerApi';

const ACCENT = {
  positive: '#0E5C40', financial: '#7C3AED', cyan: '#0E7490',
  caution: '#D97706', danger: '#DC2626', neutral: '#475569',
} as const;

const COMMITMENT_STATUS = ['', 'Draft', 'Active', 'Completed', 'Cancelled', 'Defaulted', 'Paused'];
const INSTALLMENT_STATUS = ['', 'Pending', 'PartiallyPaid', 'Paid', 'Overdue', 'Waived'];

/// /dashboards/commitments/:commitmentId - schedule + payment history + default risk.
export function CommitmentDetailDashboardPage() {
  const navigate = useNavigate();
  const { commitmentId } = useParams<{ commitmentId: string }>();
  const q = useQuery({
    queryKey: ['dash', 'commitment-detail', commitmentId],
    queryFn: () => dashboardApi.commitmentDetail(commitmentId!),
    enabled: !!commitmentId,
  });

  if (q.isLoading || !q.data) {
    return (
      <div>
        <PageHeader title="Commitment detail"
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>All dashboards</Button>} />
        <Card style={{ padding: 24, textAlign: 'center' }}><Spin /></Card>
      </div>
    );
  }
  const d = q.data;
  const subtitle = [
    `${d.fundCode} · ${d.fundName}`,
    d.templateName,
    `Created ${formatDate(d.createdDate)}`,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <PageHeader title={`Commitment ${d.commitmentId.slice(0, 8)}`} subtitle={subtitle}
        actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>All dashboards</Button>} />

      <Card size="small" className="jm-card" styles={{ body: { padding: 16 } }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Member">
            {d.memberId
              ? <Link to={`/dashboards/members/${d.memberId}`}>
                  <span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{d.memberItsNumber}</span> · {d.memberName}
                </Link>
              : '(family commitment)'}
          </Descriptions.Item>
          <Descriptions.Item label="Fund">{d.fundCode} · {d.fundName}</Descriptions.Item>
          <Descriptions.Item label="Template">{d.templateName ?? '(no template)'}</Descriptions.Item>
          <Descriptions.Item label="Status"><Tag color={d.status === 2 ? 'green' : d.status === 5 ? 'red' : 'default'}>{COMMITMENT_STATUS[d.status] ?? d.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Next due">{d.nextDueDate ? `${formatDate(d.nextDueDate)} · ${money(d.nextDueAmount ?? 0, d.currency)}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Created">{formatDate(d.createdDate)}</Descriptions.Item>
        </Descriptions>
      </Card>
      <div style={{ blockSize: 12 }} />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<BankOutlined />} label="Total committed" value={d.totalAmount} currency={d.currency} accent={ACCENT.financial} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Paid" value={d.paidAmount} currency={d.currency} accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<HourglassOutlined />} label="Remaining" value={d.remainingAmount} currency={d.currency} accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<PercentageOutlined />} label="Progress" value={d.progressPercent} format="number" suffix="%" accent={d.progressPercent >= 80 ? ACCENT.positive : ACCENT.financial} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}><KpiCard icon={<FileDoneOutlined />} label="Installments total" value={d.installmentsTotal} format="number" accent={ACCENT.cyan} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Paid" value={d.installmentsPaid} format="number" accent={ACCENT.positive} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ClockCircleOutlined />} label="Pending" value={d.installmentsPending} format="number" accent={ACCENT.caution} /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Overdue" value={d.installmentsOverdue} format="number" accent={d.installmentsOverdue > 0 ? ACCENT.danger : ACCENT.neutral} /></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card title="Schedule" size="small" className="jm-card">
            <Table rowKey="installmentId" size="small" pagination={{ pageSize: 12 }} dataSource={d.schedule}
              columns={[
                { title: '#', dataIndex: 'installmentNo', width: 60, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Due', dataIndex: 'dueDate', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Status', dataIndex: 'status', width: 130, render: (v: number, r) => {
                  const overdue = r.daysOverdue > 0 && v !== 3;
                  return <Tag color={v === 3 ? 'green' : overdue ? 'red' : 'default'}>
                    {INSTALLMENT_STATUS[v] ?? v}{overdue ? ` · ${r.daysOverdue}d` : ''}
                  </Tag>;
                } },
                { title: 'Scheduled', dataIndex: 'scheduledAmount', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum">{money(v, d.currency)}</span> },
                { title: 'Paid', dataIndex: 'paidAmount', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
                { title: 'Remaining', dataIndex: 'remainingAmount', align: 'right', width: 140, render: (v: number) => v > 0 ? <span className="jm-tnum" style={{ fontWeight: 600, color: 'var(--jm-danger-fg-strong)' }}>{money(v, d.currency)}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
                { title: 'Progress', key: 'pr', width: 100, render: (_, r) => {
                  const p = r.scheduledAmount === 0 ? 0 : Math.round(r.paidAmount * 100 / r.scheduledAmount);
                  return <Progress percent={p} size="small" showInfo={false} />;
                } },
              ]}
              locale={{ emptyText: <Empty description="No schedule yet" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Payment history" size="small" className="jm-card">
            <Table rowKey={(r, i) => `${r.receiptId}-${i}`} size="small" pagination={{ pageSize: 12 }} dataSource={d.payments}
              columns={[
                { title: 'Receipt', dataIndex: 'receiptNumber', width: 110, render: (v: string | null, r) => <Link to={`/receipts/${r.receiptId}`} className="jm-tnum">{v ?? '—'}</Link> },
                { title: 'Date', dataIndex: 'receiptDate', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Inst #', dataIndex: 'installmentNo', align: 'right', width: 70, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Amount', dataIndex: 'amount', align: 'right', width: 130, render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, d.currency)}</span> },
              ]}
              locale={{ emptyText: <Empty description="No payments yet" /> }}
            />
          </Card>
        </Col>
      </Row>

      {d.installmentsOverdue > 0 && (
        <Alert
          type="warning" showIcon icon={<WarningOutlined />} className="jm-alert-after-card"
          message={`${d.installmentsOverdue} overdue installment${d.installmentsOverdue === 1 ? '' : 's'}`}
          description="Pending recovery action — contact the member or escalate per the agreement template."
        />
      )}

      <div style={{ marginBlockStart: 16 }}>
        <Button icon={<RiseOutlined />} onClick={() => navigate(`/commitments/${d.commitmentId}`)}>
          Open commitment in module
        </Button>
      </div>
    </div>
  );
}
