import { Card, Row, Col, Tag, Button, Space, Table, Result, Spin, App as AntdApp, Empty, Statistic, Descriptions } from 'antd';
import type { TableProps } from 'antd';
import {
  ArrowLeftOutlined, WalletOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined,
  CheckCircleOutlined, GiftOutlined, FileTextOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, Area,
} from 'recharts';
import { PageHeader } from '../../shared/ui/PageHeader';
import { UserHoverCard } from '../../shared/ui/UserHoverCard';
import { useAuth } from '../../shared/auth/useAuth';
import { money, formatDate } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import {
  fundEnrollmentsApi, EnrollmentStatusLabel, EnrollmentStatusColor, RecurrenceLabel,
  type EnrollmentStatus, type PatronageReceipt,
} from './fundEnrollmentsApi';
import { PaymentModeLabel, ReceiptStatusLabel } from '../receipts/receiptsApi';

/// Patronage detail page - mirrors the CommitmentDetailPage UX:
/// header + KPI strip + 2-column main + payment history table + status-aware actions.
/// All actions go through the existing FundEnrollment endpoints; AuditInterceptor captures them.
export function PatronageDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const { message, modal } = AntdApp.useApp();

  const canCollect = hasPermission('receipt.create');
  const canApprove = hasPermission('enrollment.approve');

  const { data: p, isLoading } = useQuery({
    queryKey: ['patronage', id],
    queryFn: () => fundEnrollmentsApi.get(id),
    enabled: !!id,
  });
  const receiptsQ = useQuery({
    queryKey: ['patronage-receipts', id],
    queryFn: () => fundEnrollmentsApi.receipts(id),
    enabled: !!id,
  });

  const onErr = (e: unknown) => message.error(extractProblem(e).detail ?? 'Action failed.');
  const approveMut = useMutation({
    mutationFn: () => fundEnrollmentsApi.approve(id),
    onSuccess: () => { message.success('Approved.'); void qc.invalidateQueries({ queryKey: ['patronage', id] }); },
    onError: onErr,
  });
  const pauseMut = useMutation({
    mutationFn: () => fundEnrollmentsApi.pause(id),
    onSuccess: () => { message.success('Paused.'); void qc.invalidateQueries({ queryKey: ['patronage', id] }); },
    onError: onErr,
  });
  const resumeMut = useMutation({
    mutationFn: () => fundEnrollmentsApi.resume(id),
    onSuccess: () => { message.success('Resumed.'); void qc.invalidateQueries({ queryKey: ['patronage', id] }); },
    onError: onErr,
  });
  const cancelMut = useMutation({
    mutationFn: () => fundEnrollmentsApi.cancel(id),
    onSuccess: () => { message.success('Cancelled.'); void qc.invalidateQueries({ queryKey: ['patronage', id] }); },
    onError: onErr,
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  if (!p) return <Result status="404" title="Patronage not found" extra={<Button onClick={() => navigate('/fund-enrollments')}>Back to patronages</Button>} />;

  const receipts = receiptsQ.data ?? [];
  // Confirmed-only contributions to the top-line "total collected" - we don't want to count
  // cancelled or reversed receipts even though they appear in history below.
  const confirmed = receipts.filter((r) => r.status === 2);
  const totalCollected = confirmed.reduce((s, r) => s + r.amount, 0);
  const lastPaymentDate = confirmed.length ? confirmed[0].receiptDate : null;
  const daysSinceLastPayment = lastPaymentDate ? dayjs().diff(dayjs(lastPaymentDate), 'day') : null;
  const activeDuration = p.approvedAtUtc ? dayjs().diff(dayjs(p.approvedAtUtc), 'day') : 0;
  const currency = confirmed[0]?.currency ?? 'AED';

  // 12-month collection trend - cumulative paid by month, useful at-a-glance for spotting
  // engagement drop-offs. Computed from confirmed receipts client-side.
  const trendData = buildMonthlyTrend(confirmed);

  return (
    <div className="jm-stack" style={{ gap: 16 }}>
      <PageHeader
        title={`Patronage ${p.code}`}
        subtitle={
          <span>
            <Tag color={EnrollmentStatusColor[p.status]} style={{ marginInlineEnd: 8 }}>{EnrollmentStatusLabel[p.status]}</Tag>
            <Link to={`/members/${p.memberId}`}>{p.memberName}</Link> ({p.memberItsNumber}) - {p.fundTypeCode} {p.fundTypeName}
          </span>
        }
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/fund-enrollments')}>Back</Button>
            {canApprove && p.status === 1 && (
              <Button icon={<CheckCircleOutlined />} onClick={() => approveMut.mutate()} loading={approveMut.isPending}>Approve</Button>
            )}
            {canApprove && p.status === 2 && (
              <Button icon={<PauseCircleOutlined />} onClick={() => pauseMut.mutate()} loading={pauseMut.isPending}>Pause</Button>
            )}
            {canApprove && p.status === 3 && (
              <Button icon={<PlayCircleOutlined />} onClick={() => resumeMut.mutate()} loading={resumeMut.isPending}>Resume</Button>
            )}
            {canCollect && (p.status === 2 || p.status === 3) && (
              <Button type="primary" icon={<WalletOutlined />}
                onClick={() => navigate(`/receipts/new?memberId=${p.memberId}&fundTypeId=${p.fundTypeId}`)}>
                Collect payment
              </Button>
            )}
            {canApprove && p.status !== 4 && p.status !== 5 && (
              <Button danger icon={<StopOutlined />}
                onClick={() => modal.confirm({
                  title: 'Cancel patronage?',
                  content: 'Cancelling stops all future collections under this patronage. Existing receipts are unaffected.',
                  okButtonProps: { danger: true },
                  onOk: () => cancelMut.mutateAsync(),
                })}>
                Cancel
              </Button>
            )}
          </Space>
        }
      />

      {/* KPI strip - 4 tiles. Mirrors the CommitmentProgressCard's "scannable summary" pattern
          but flattened across the top so the eye lands on numbers first. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Total collected" value={totalCollected} precision={2}
              formatter={(v) => money(Number(v), currency)}
              valueStyle={{ fontSize: 18, color: '#0E5C40' }} />
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              Confirmed receipts only
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Receipts" value={confirmed.length} prefix={<FileTextOutlined />}
              valueStyle={{ fontSize: 18 }} />
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              {receipts.length - confirmed.length > 0 ? `+${receipts.length - confirmed.length} cancelled / drafts` : 'All confirmed'}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Last payment" value={lastPaymentDate ? formatDate(lastPaymentDate) : 'None yet'}
              valueStyle={{ fontSize: 18 }} />
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              {daysSinceLastPayment !== null ? `${daysSinceLastPayment} days ago` : 'No history'}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Active for" value={activeDuration} suffix="days" prefix={<CalendarOutlined />}
              valueStyle={{ fontSize: 18 }} />
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              Since {p.approvedAtUtc ? dayjs(p.approvedAtUtc).format('DD MMM YYYY') : 'not approved'}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Two-column main: details (left, wider) + collection trend (right). Same proportions
          as CommitmentDetailPage so the user has spatial muscle memory across modules. */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card title={<span><GiftOutlined /> Patronage details</span>} size="small"
            style={{ border: '1px solid var(--jm-border)' }}>
            <Descriptions column={2} size="small" colon={false} labelStyle={{ color: 'var(--jm-gray-500)', fontSize: 12 }}>
              <Descriptions.Item label="Code">
                <span className="jm-tnum" style={{ fontWeight: 600 }}>{p.code}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={EnrollmentStatusColor[p.status]}>{EnrollmentStatusLabel[p.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Member">
                <Link to={`/members/${p.memberId}`}>{p.memberName}</Link>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }} className="jm-tnum">ITS {p.memberItsNumber}</div>
              </Descriptions.Item>
              <Descriptions.Item label="Family">
                {p.familyCode ? <span className="jm-tnum">{p.familyCode}</span> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Fund">
                <span className="jm-tnum" style={{ marginInlineEnd: 6 }}>{p.fundTypeCode}</span>
                {p.fundTypeName}
              </Descriptions.Item>
              <Descriptions.Item label="Sub-type">{p.subType ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Recurrence">{RecurrenceLabel[p.recurrence]}</Descriptions.Item>
              <Descriptions.Item label="Start">{formatDate(p.startDate)}</Descriptions.Item>
              <Descriptions.Item label="End">{p.endDate ? formatDate(p.endDate) : 'Open-ended'}</Descriptions.Item>
              <Descriptions.Item label="Approved by">
                {p.approvedByUserName
                  ? <UserHoverCard userId={p.approvedByUserId ?? null} fallback={p.approvedByUserName} />
                  : '-'}
                {p.approvedAtUtc && <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{dayjs(p.approvedAtUtc).format('DD MMM YYYY HH:mm')}</div>}
              </Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>
                {p.notes ? <span style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>None</span>}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Monthly collection trend" size="small" style={{ border: '1px solid var(--jm-border)', blockSize: '100%' }}
            extra={<span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Last 12 months</span>}>
            {trendData.every((d) => d.amount === 0) ? (
              <Empty description="No payments yet" image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ paddingBlock: 30 }} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="patFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0B6E63" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0B6E63" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={70} />
                  <RTooltip formatter={(v: number) => money(v, currency)}
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                  <Area type="monotone" dataKey="amount" stroke="none" fill="url(#patFill)" />
                  <Line type="monotone" dataKey="amount" stroke="#0B6E63" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Payment history - a slim ledger of every receipt that contributed under this patronage.
          Each row clicks through to /receipts/{id}. Drafts and cancelled rows are surfaced but
          visually de-emphasised so the user can still see them but knows they didn't count. */}
      <Card title="Payment history" size="small" style={{ border: '1px solid var(--jm-border)' }}
        extra={canCollect && (p.status === 2 || p.status === 3) && (
          <Button size="small" type="primary" icon={<WalletOutlined />}
            onClick={() => navigate(`/receipts/new?memberId=${p.memberId}&fundTypeId=${p.fundTypeId}`)}>
            Collect now
          </Button>
        )}>
        {receiptsQ.isLoading ? <Spin /> :
          receipts.length === 0 ? (
            <Empty description="No payments yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table<PatronageReceipt> rowKey="receiptId" size="small" pagination={{ pageSize: 10, showSizeChanger: false }}
              dataSource={receipts}
              onRow={(row) => ({
                style: { cursor: 'pointer', opacity: row.status === 2 ? 1 : 0.55 },
                onClick: () => navigate(`/receipts/${row.receiptId}`),
              })}
              columns={paymentColumns()}
            />
          )}
      </Card>
    </div>
  );
}

function paymentColumns(): TableProps<PatronageReceipt>['columns'] {
  return [
    { title: 'Receipt #', dataIndex: 'receiptNumber', width: 130,
      render: (v: string | null, row) => v ? <span className="jm-tnum">{v}</span> :
        <span className="jm-tnum" style={{ color: 'var(--jm-gray-400)' }}>{row.receiptId.slice(0, 8)}</span> },
    { title: 'Date', dataIndex: 'receiptDate', width: 110, render: (v: string) => formatDate(v) },
    { title: 'Amount', dataIndex: 'amount', width: 140, align: 'end',
      render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
    { title: 'Mode', dataIndex: 'paymentMode', width: 130,
      render: (v: number, row) => (
        <span style={{ fontSize: 12 }}>
          {PaymentModeLabel[v] ?? '-'}
          {row.chequeNumber && <span className="jm-tnum" style={{ color: 'var(--jm-gray-500)', marginInlineStart: 4 }}>#{row.chequeNumber}</span>}
        </span>
      ) },
    { title: 'Status', dataIndex: 'status', width: 110,
      render: (v: number) => <Tag color={v === 2 ? 'green' : v === 1 ? 'default' : 'red'}>
        {ReceiptStatusLabel[v as 1 | 2 | 3 | 4] ?? `#${v}`}
      </Tag> },
  ];
}

/// Build a 12-month trend with zero-fill so the chart doesn't have gaps. Confirmed-only.
function buildMonthlyTrend(receipts: PatronageReceipt[]): { label: string; amount: number; month: string }[] {
  const today = dayjs();
  const start = today.subtract(11, 'month').startOf('month');
  const buckets: Record<string, number> = {};
  for (const r of receipts) {
    const key = dayjs(r.receiptDate).format('YYYY-MM');
    buckets[key] = (buckets[key] ?? 0) + r.amount;
  }
  const out: { label: string; amount: number; month: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = start.add(i, 'month');
    const key = m.format('YYYY-MM');
    out.push({ label: m.format("MMM 'YY"), amount: buckets[key] ?? 0, month: key });
  }
  return out;
}
