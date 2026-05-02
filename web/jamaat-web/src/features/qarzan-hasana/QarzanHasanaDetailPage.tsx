import { useMemo, useState } from 'react';
import { Button, Card, Descriptions, Space, Table, Tag, Spin, App as AntdApp, Result, Modal, Input, InputNumber, Progress, Row, Col, Alert, Statistic, Empty } from 'antd';
import type { TableProps } from 'antd';
import {
  ArrowLeftOutlined, SendOutlined, CheckCircleOutlined, CloseCircleOutlined, DollarOutlined,
  StopOutlined, FileProtectOutlined, BankOutlined, RiseOutlined, LineChartOutlined, FileTextOutlined,
} from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, Legend,
} from 'recharts';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime, money } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import {
  qarzanHasanaApi, type QhInstallment,
  QhStatusLabel, QhStatusColor, QhSchemeLabel, QhInstallmentStatusLabel,
  IncomeSourceLabel,
} from './qarzanHasanaApi';
import { LoanDecisionSupport } from './LoanDecisionSupport';
import { GuarantorConsentPanel } from './GuarantorConsentPanel';
import { UserHoverCard } from '../../shared/ui/UserHoverCard';

export function QarzanHasanaDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['qh', id], queryFn: () => qarzanHasanaApi.get(id), enabled: !!id,
  });

  const [l1Open, setL1Open] = useState(false);
  const [l1Amount, setL1Amount] = useState<number>(0);
  const [l1Inst, setL1Inst] = useState<number>(0);
  const [l1Comments, setL1Comments] = useState('');

  const [l2Open, setL2Open] = useState(false);
  const [l2Comments, setL2Comments] = useState('');

  const [rejOpen, setRejOpen] = useState(false);
  const [rejReason, setRejReason] = useState('');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [disbOpen, setDisbOpen] = useState(false);
  const [disbDate, setDisbDate] = useState(dayjs().format('YYYY-MM-DD'));

  const [waiving, setWaiving] = useState<QhInstallment | null>(null);
  const [waiveReason, setWaiveReason] = useState('');

  const onErr = (e: unknown) => message.error(extractProblem(e).detail ?? 'Action failed');
  const onOk = () => { message.success('Done.'); void refetch(); void qc.invalidateQueries({ queryKey: ['qh'] }); };

  const submitMut = useMutation({ mutationFn: () => qarzanHasanaApi.submit(id), onSuccess: onOk, onError: onErr });
  const l1Mut = useMutation({
    mutationFn: () => qarzanHasanaApi.approveL1(id, l1Amount, l1Inst, l1Comments || undefined),
    onSuccess: () => { onOk(); setL1Open(false); }, onError: onErr,
  });
  const l2Mut = useMutation({
    mutationFn: () => qarzanHasanaApi.approveL2(id, l2Comments || undefined),
    onSuccess: () => { onOk(); setL2Open(false); }, onError: onErr,
  });
  const rejMut = useMutation({
    mutationFn: () => qarzanHasanaApi.reject(id, rejReason),
    onSuccess: () => { onOk(); setRejOpen(false); }, onError: onErr,
  });
  const cancelMut = useMutation({
    mutationFn: () => qarzanHasanaApi.cancel(id, cancelReason),
    onSuccess: () => { onOk(); setCancelOpen(false); }, onError: onErr,
  });
  const disbMut = useMutation({
    mutationFn: () => qarzanHasanaApi.disburse(id, { disbursedOn: disbDate }),
    onSuccess: () => { onOk(); setDisbOpen(false); }, onError: onErr,
  });
  const waiveMut = useMutation({
    mutationFn: () => qarzanHasanaApi.waive(id, waiving!.id, waiveReason),
    onSuccess: () => { onOk(); setWaiving(null); setWaiveReason(''); }, onError: onErr,
  });

  // Build the repayment trend chart data once per render. Two cumulative series:
  //   - Scheduled: cumulative sum of scheduledAmount across installments by due date
  //   - Paid: cumulative sum of paidAmount, attributed to the lastPaymentDate when present
  // Falls back to no-data state when the loan hasn't generated a schedule yet.
  const repaymentTrend = useMemo(() => {
    if (!data?.installments?.length) return [];
    const sorted = [...data.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    let cumScheduled = 0;
    let cumPaid = 0;
    const points: { label: string; date: string; scheduled: number; paid: number }[] = [];
    for (const i of sorted) {
      cumScheduled += i.scheduledAmount;
      // We attribute paid amount to the lastPaymentDate; if absent (still pending), it's
      // accumulated at zero so the line stays flat for that bucket.
      if (i.paidAmount > 0) cumPaid += i.paidAmount;
      points.push({
        label: dayjs(i.dueDate).format("MMM 'YY"),
        date: i.dueDate,
        scheduled: cumScheduled,
        paid: cumPaid,
      });
    }
    return points;
  }, [data?.installments]);

  if (isLoading || !data) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  const { loan, installments } = data;

  const isDraft = loan.status === 1;
  const isL1 = loan.status === 2;
  const isL2 = loan.status === 3;
  const isApproved = loan.status === 4;
  const isActive = loan.status === 5 || loan.status === 6;
  const isClosed = loan.status === 7 || loan.status === 8 || loan.status === 9 || loan.status === 10;
  const inApproval = isL1 || isL2 || isApproved;

  const cols: TableProps<QhInstallment>['columns'] = [
    { title: '#', dataIndex: 'installmentNo', width: 60 },
    { title: 'Due date', dataIndex: 'dueDate', width: 130, render: (v: string) => formatDate(v) },
    { title: 'Scheduled', dataIndex: 'scheduledAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum">{money(v, loan.currency)}</span> },
    { title: 'Paid', dataIndex: 'paidAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum" style={{ color: v > 0 ? '#0E5C40' : 'var(--jm-gray-400)' }}>{money(v, loan.currency)}</span> },
    { title: 'Remaining', dataIndex: 'remainingAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum">{money(v, loan.currency)}</span> },
    { title: 'Status', dataIndex: 'status', width: 120, render: (s: QhInstallment['status']) => <Tag>{QhInstallmentStatusLabel[s]}</Tag> },
    { title: 'Last payment', dataIndex: 'lastPaymentDate', width: 130, render: (v: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
    {
      key: 'actions', width: 100, align: 'end',
      render: (_: unknown, row) => row.status === 3 || row.status === 5 ? null :
        <Button size="small" type="text" icon={<FileProtectOutlined />} onClick={() => setWaiving(row)}>Waive</Button>,
    },
  ];

  return (
    <div>
      <PageHeader title={`QH · ${loan.code}`}
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/qarzan-hasana')}>Back</Button>
            {/* Agreement is printable at any status — admins often print a draft for guarantor
                signatures before disbursement, and after disbursement the same document goes
                into the loan file. The endpoint returns a styled QuestPDF document. */}
            <Button icon={<FileProtectOutlined />}
              onClick={() => qarzanHasanaApi.downloadAgreement(loan.id, loan.code)}>
              Download agreement
            </Button>
            {isDraft && <Button type="primary" icon={<SendOutlined />} loading={submitMut.isPending} onClick={() => submitMut.mutate()}>Submit for L1 approval</Button>}
            {isL1 && <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => { setL1Amount(loan.amountRequested); setL1Inst(loan.instalmentsRequested); setL1Open(true); }}>Approve L1</Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejOpen(true)}>Reject</Button>
            </>}
            {isL2 && <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setL2Open(true)}>Approve L2</Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejOpen(true)}>Reject</Button>
            </>}
            {isApproved && <Button type="primary" icon={<DollarOutlined />} onClick={() => setDisbOpen(true)}>Disburse</Button>}
            {!isClosed && !isActive && <Button danger icon={<StopOutlined />} onClick={() => setCancelOpen(true)}>Cancel</Button>}
          </Space>
        }
      />

      {loan.status === 10 && loan.rejectionReason && <Alert type="error" showIcon message="Rejected" description={loan.rejectionReason} style={{ marginBlockEnd: 16 }} />}
      {loan.status === 9 && loan.cancellationReason && <Alert type="warning" showIcon message="Cancelled" description={loan.cancellationReason} style={{ marginBlockEnd: 16 }} />}

      {/* KPI strip - five money tiles. Reads as a single horizontal "loan cashflow" snapshot
          and fills the page width regardless of approval/active state, eliminating the previous
          right-column whitespace gap when LoanDecisionSupport wasn't being rendered. */}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={8} lg={Math.floor(24 / 5)}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Requested" value={loan.amountRequested} precision={2}
              formatter={(v) => money(Number(v), loan.currency)}
              valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={Math.floor(24 / 5)}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Approved" value={loan.amountApproved} precision={2}
              formatter={(v) => money(Number(v), loan.currency)}
              valueStyle={{ fontSize: 16, color: loan.amountApproved > 0 ? '#0E5C40' : 'var(--jm-gray-400)' }} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={Math.floor(24 / 5)}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Disbursed" value={loan.amountDisbursed} precision={2} prefix={<BankOutlined />}
              formatter={(v) => money(Number(v), loan.currency)}
              valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={Math.floor(24 / 5)}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Repaid" value={loan.amountRepaid} precision={2} prefix={<RiseOutlined />}
              formatter={(v) => money(Number(v), loan.currency)}
              valueStyle={{ fontSize: 16, color: '#0E5C40' }} />
          </Card>
        </Col>
        <Col xs={24} md={8} lg={Math.ceil(24 / 5)}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Outstanding" value={loan.amountOutstanding} precision={2}
              formatter={(v) => money(Number(v), loan.currency)}
              valueStyle={{ fontSize: 16, fontWeight: 700, color: loan.amountOutstanding > 0 ? '#B45309' : 'inherit' }} />
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              {loan.progressPercent.toFixed(0)}% repaid
            </div>
          </Card>
        </Col>
      </Row>

      {/* Remote guarantor-consent links - only meaningful while the loan is in Draft (status=1).
          Once submitted to L1, the consent flag is locked in; the records persist for audit but
          the operator no longer needs to send the links. */}
      {isDraft && <GuarantorConsentPanel loanId={loan.id} />}

      {/* Layout strategy:
          - In approval states (PendingL1 / PendingL2 / Approved-not-yet-disbursed) - render the
            decision-support panel full-width up front so the approver sees the whole picture.
            The Details card sits below it, keeping the focus on the decision.
          - Otherwise (Disbursed / Active / Completed / Defaulted / Cancelled / Rejected) - the
            normal 2-col Details + Repayment progress widget, then a full-width repayment trend
            line chart. This fills the page with substantive content and removes the whitespace. */}
      {inApproval && (
        <Card size="small" style={{ marginBlockEnd: 16, border: '1px solid var(--jm-border)' }}
          title={<span><FileTextOutlined /> Decision support</span>}
          extra={<Tag color="blue">Awaiting {isL1 ? 'L1 approval' : isL2 ? 'L2 approval' : 'disbursement'}</Tag>}>
          <LoanDecisionSupport loanId={loan.id} />
        </Card>
      )}

      {/* Borrower's case - the qualitative inputs the L1 approver reads. Only renders when at
          least one of the new fields is filled in; legacy loans created before the form uplift
          will silently skip this card rather than show empty rows. */}
      {(loan.purpose || loan.repaymentPlan || loan.sourceOfIncome || loan.otherObligations
        || loan.guarantorsAcknowledged
        || loan.guarantorsAcknowledgedByUserName) && (
        <Card size="small" title={<span><FileTextOutlined /> Borrower's case</span>}
          style={{ marginBlockEnd: 16, border: '1px solid var(--jm-border)' }}
          extra={loan.guarantorsAcknowledged ? (
            <Tag color="green">
              <CheckCircleOutlined /> Guarantors acknowledged
              {loan.guarantorsAcknowledgedByUserName && <> by {loan.guarantorsAcknowledgedByUserName}</>}
              {loan.guarantorsAcknowledgedAtUtc && <> on {dayjs(loan.guarantorsAcknowledgedAtUtc).format('DD MMM YYYY')}</>}
            </Tag>
          ) : (
            <Tag color="orange">Guarantor acknowledgment pending</Tag>
          )}>
          <Row gutter={[16, 12]}>
            <Col xs={24} md={12}>
              <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>
                Purpose
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {loan.purpose || <span style={{ color: 'var(--jm-gray-400)' }}>Not provided</span>}
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>
                Repayment plan
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {loan.repaymentPlan || <span style={{ color: 'var(--jm-gray-400)' }}>Not provided</span>}
              </div>
            </Col>
            {loan.sourceOfIncome && (
              <Col xs={24} md={12}>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>
                  Source of income
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{loan.sourceOfIncome}</div>
              </Col>
            )}
            {loan.otherObligations && (
              <Col xs={24} md={12}>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>
                  Other current obligations
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{loan.otherObligations}</div>
              </Col>
            )}
            {loan.incomeSources && (
              <Col xs={24}>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6 }}>
                  Income sources
                </div>
                <div>
                  {loan.incomeSources.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (
                    <Tag key={s} style={{ marginInlineEnd: 6 }}>{IncomeSourceLabel[s] ?? s}</Tag>
                  ))}
                </div>
              </Col>
            )}
            {(loan.monthlyIncome !== null && loan.monthlyIncome !== undefined) && (
              <Col xs={24}>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6, marginBlockStart: 6 }}>
                  Monthly cashflow
                </div>
                <Row gutter={8}>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Income</div>
                    <div className="jm-tnum" style={{ fontWeight: 600 }}>{money(loan.monthlyIncome ?? 0, loan.currency)}</div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Expenses</div>
                    <div className="jm-tnum">{money(loan.monthlyExpenses ?? 0, loan.currency)}</div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Other EMIs</div>
                    <div className="jm-tnum">{money(loan.monthlyExistingEmis ?? 0, loan.currency)}</div>
                  </Col>
                  <Col xs={12} md={6}>
                    {(() => {
                      const net = (loan.monthlyIncome ?? 0) - (loan.monthlyExpenses ?? 0) - (loan.monthlyExistingEmis ?? 0);
                      return (
                        <>
                          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Net surplus</div>
                          <div className="jm-tnum" style={{ fontWeight: 700, color: net >= 0 ? '#0E5C40' : '#DC2626' }}>
                            {money(net, loan.currency)}
                          </div>
                        </>
                      );
                    })()}
                  </Col>
                </Row>
              </Col>
            )}
            {loan.goldWeightGrams && (
              <Col xs={24}>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6, marginBlockStart: 6 }}>
                  Gold collateral details
                </div>
                <Row gutter={8}>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Weight</div>
                    <div className="jm-tnum">{loan.goldWeightGrams} g</div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Purity</div>
                    <div className="jm-tnum">{loan.goldPurityKarat ? `${loan.goldPurityKarat} K` : '-'}</div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Held at</div>
                    <div>{loan.goldHeldAt ?? '-'}</div>
                  </Col>
                </Row>
              </Col>
            )}
          </Row>
        </Card>
      )}

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={24} lg={inApproval ? 24 : 16}>
          <Card size="small" title="Loan details" style={{ border: '1px solid var(--jm-border)' }}>
            <Descriptions size="small" column={2} bordered
              items={[
                { key: 'b', label: 'Borrower', children: `${loan.memberName} · ITS ${loan.memberItsNumber}` },
                { key: 's', label: 'Scheme', children: QhSchemeLabel[loan.scheme] },
                { key: 'inst', label: 'Installments', children: `${loan.instalmentsApproved || loan.instalmentsRequested}` },
                { key: 'gold', label: 'Gold amount', children: loan.goldAmount ? <span className="jm-tnum">{money(loan.goldAmount, loan.currency)}</span> : '-' },
                { key: 'start', label: 'Start', children: formatDate(loan.startDate) },
                { key: 'end', label: 'End', children: loan.endDate ? formatDate(loan.endDate) : '-' },
                { key: 'status', label: 'Status', children: <Tag color={QhStatusColor[loan.status]}>{QhStatusLabel[loan.status]}</Tag> },
                { key: 'd', label: 'Disbursed on', children: loan.disbursedOn ? formatDate(loan.disbursedOn) : '-' },
                { key: 'g1', label: 'Guarantor 1', children: (
                  <Link to={`/dashboards/members/${loan.guarantor1MemberId}`}>{loan.guarantor1Name}</Link>
                ) },
                { key: 'g2', label: 'Guarantor 2', children: (
                  <Link to={`/dashboards/members/${loan.guarantor2MemberId}`}>{loan.guarantor2Name}</Link>
                ) },
                ...(loan.level1ApprovedAtUtc ? [{ key: 'l1', label: 'L1 approval', span: 2, children: (
                  <span>
                    <UserHoverCard userId={loan.level1ApproverUserId ?? null}
                      fallback={loan.level1ApproverName ?? '—'} />
                    {' · '}{formatDateTime(loan.level1ApprovedAtUtc)}
                    {loan.level1Comments ? ` · ${loan.level1Comments}` : ''}
                  </span>
                ) }] : []),
                ...(loan.level2ApprovedAtUtc ? [{ key: 'l2', label: 'L2 approval', span: 2, children: (
                  <span>
                    <UserHoverCard userId={loan.level2ApproverUserId ?? null}
                      fallback={loan.level2ApproverName ?? '—'} />
                    {' · '}{formatDateTime(loan.level2ApprovedAtUtc)}
                    {loan.level2Comments ? ` · ${loan.level2Comments}` : ''}
                  </span>
                ) }] : []),
                ...(loan.cashflowDocumentUrl || loan.goldSlipDocumentUrl ? [{ key: 'docs', label: 'Documents', span: 2, children: (
                  <Space>
                    {loan.cashflowDocumentUrl && <a href={loan.cashflowDocumentUrl} target="_blank" rel="noreferrer">Cashflow</a>}
                    {loan.goldSlipDocumentUrl && <a href={loan.goldSlipDocumentUrl} target="_blank" rel="noreferrer">Gold slip</a>}
                  </Space>
                ) }] : []),
              ]}
            />
          </Card>
        </Col>
        {!inApproval && (
          <Col xs={24} lg={8}>
            <Card size="small" title="Repayment progress" style={{ border: '1px solid var(--jm-border)', blockSize: '100%', textAlign: 'center' }}>
              <Progress type="dashboard" percent={Math.min(100, Number(loan.progressPercent.toFixed(1)))}
                status={loan.status === 7 ? 'success' : (loan.status === 8 || loan.status === 9 || loan.status === 10) ? 'exception' : 'active'} />
              <div style={{ marginBlockStart: 12, display: 'flex', justifyContent: 'space-around', fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--jm-gray-500)' }}>Paid</div>
                  <div className="jm-tnum" style={{ fontWeight: 600, color: '#0E5C40' }}>{money(loan.amountRepaid, loan.currency)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--jm-gray-500)' }}>Remaining</div>
                  <div className="jm-tnum" style={{ fontWeight: 600 }}>{money(loan.amountOutstanding, loan.currency)}</div>
                </div>
              </div>
            </Card>
          </Col>
        )}
      </Row>

      {/* Full-width repayment trend chart - fills the visual gap that used to exist on
          disbursed/active/closed loans when the right column was nearly empty. Two cumulative
          series make over- vs under-pace immediately obvious. */}
      {!inApproval && installments.length > 0 && (
        <Card size="small" title={<span><LineChartOutlined /> Repayment trajectory</span>}
          style={{ marginBlockEnd: 16, border: '1px solid var(--jm-border)' }}
          extra={<span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Cumulative scheduled vs paid</span>}>
          {repaymentTrend.length === 0 ? <Empty description="No installments yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={repaymentTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={80} />
                <RTooltip formatter={(v: number) => money(v, loan.currency)}
                  labelFormatter={(_l, p) => p[0]?.payload?.date ? dayjs(p[0].payload.date).format('DD MMM YYYY') : ''}
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                <Line type="monotone" dataKey="scheduled" name="Scheduled" stroke="#94A3B8" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="6 3" />
                <Line type="monotone" dataKey="paid" name="Paid" stroke="#0E5C40" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      <Card title="Installments" size="small" style={{ marginBlockEnd: 16, border: '1px solid var(--jm-border)' }}>
        {installments.length === 0
          ? <div style={{ color: 'var(--jm-gray-500)' }}>Schedule will be generated on L2 approval.</div>
          : <Table<QhInstallment> rowKey="id" size="small" pagination={false} columns={cols} dataSource={installments} />}
      </Card>

      <Modal title="Approve L1" open={l1Open} onCancel={() => setL1Open(false)} onOk={() => l1Mut.mutate()} confirmLoading={l1Mut.isPending}>
        <Space direction="vertical" style={{ inlineSize: '100%' }}>
          <div>Approved amount:</div>
          <InputNumber value={l1Amount} onChange={(v) => setL1Amount(Number(v ?? 0))} style={{ inlineSize: '100%' }} />
          <div>Approved installments:</div>
          <InputNumber value={l1Inst} onChange={(v) => setL1Inst(Number(v ?? 0))} min={1} max={240} style={{ inlineSize: '100%' }} />
          <div>Comments (optional):</div>
          <Input.TextArea rows={2} value={l1Comments} onChange={(e) => setL1Comments(e.target.value)} />
        </Space>
      </Modal>

      <Modal title="Approve L2" open={l2Open} onCancel={() => setL2Open(false)} onOk={() => l2Mut.mutate()} confirmLoading={l2Mut.isPending}>
        <Space direction="vertical" style={{ inlineSize: '100%' }}>
          <Alert type="info" showIcon message="Final approval. This will auto-generate a monthly installment schedule." />
          <Input.TextArea rows={3} value={l2Comments} onChange={(e) => setL2Comments(e.target.value)} placeholder="Comments (optional)" />
        </Space>
      </Modal>

      <Modal title="Reject" open={rejOpen} onCancel={() => setRejOpen(false)} onOk={() => rejMut.mutate()} confirmLoading={rejMut.isPending}
        okButtonProps={{ danger: true, disabled: !rejReason.trim() }}>
        <Input.TextArea rows={3} value={rejReason} onChange={(e) => setRejReason(e.target.value)} placeholder="Reason (required)" />
      </Modal>

      <Modal title="Cancel loan" open={cancelOpen} onCancel={() => setCancelOpen(false)} onOk={() => cancelMut.mutate()} confirmLoading={cancelMut.isPending}
        okButtonProps={{ danger: true, disabled: !cancelReason.trim() }}>
        <Input.TextArea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (required)" />
      </Modal>

      <Modal title="Disburse loan" open={disbOpen} onCancel={() => setDisbOpen(false)} onOk={() => disbMut.mutate()} confirmLoading={disbMut.isPending}>
        <Space direction="vertical" style={{ inlineSize: '100%' }}>
          <Alert type="info" showIcon message="Record that funds have been disbursed. You can attach a Voucher ID later." />
          <Input value={disbDate} onChange={(e) => setDisbDate(e.target.value)} placeholder="Disbursement date (YYYY-MM-DD)" />
        </Space>
      </Modal>

      <Modal title="Waive installment" open={!!waiving} onCancel={() => setWaiving(null)} onOk={() => waiveMut.mutate()} confirmLoading={waiveMut.isPending}
        okButtonProps={{ danger: true, disabled: !waiveReason.trim() }}>
        {waiving && <div style={{ marginBlockEnd: 8 }}>Waiving installment #{waiving.installmentNo} - {money(waiving.scheduledAmount, loan.currency)} due {formatDate(waiving.dueDate)}</div>}
        <Input.TextArea rows={3} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder="Reason (required)" />
      </Modal>
    </div>
  );
}

export default function _NotFound() { return <Result status="404" title="Loan not found" />; }
