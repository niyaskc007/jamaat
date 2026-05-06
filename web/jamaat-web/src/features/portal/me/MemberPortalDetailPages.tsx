import { useMemo, useState } from 'react';
import {
  Card, Descriptions, Table, Tag, Typography, Empty, Alert, Button, Space, Skeleton,
  Form, Input, InputNumber, Select, DatePicker, Row, Col, message, Result, Progress,
  Modal, Divider, Tabs, Statistic,
} from 'antd';
import {
  GiftOutlined, HeartOutlined, BankOutlined, DownloadOutlined, ArrowLeftOutlined,
  TeamOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import {
  portalMeApi,
  type FundEnrollmentRow, type CreateQhPayload,
  type CreateCommitmentPayload, type CreatePatronagePayload,
} from './portalMeApi';
import { WorkflowStepper, qhWorkflow, commitmentWorkflow, patronageWorkflow } from './WorkflowStepper';
import { MemberSearchSelect } from './MemberSearchSelect';
import ReactMarkdown from 'react-markdown';

// --- Shared header --------------------------------------------------------

function DetailHeader({ icon, title, backTo, children }: {
  icon: React.ReactNode; title: string; backTo: string; children?: React.ReactNode;
}) {
  return (
    <div className="jm-section-head">
      <Space size={8}>
        <Link to={backTo} className="jm-portal-back-link">
          <Button type="text" icon={<ArrowLeftOutlined />} size="small" />
        </Link>
        <Typography.Title level={4} className="jm-section-title">
          {icon} {title}
        </Typography.Title>
      </Space>
      {children}
    </div>
  );
}

// --- Receipt (Contribution) detail ---------------------------------------

const RECEIPT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Draft', color: 'default' },
  2: { label: 'Confirmed', color: 'green' },
  3: { label: 'Cancelled', color: 'red' },
  4: { label: 'Reversed', color: 'red' },
  5: { label: 'Pending clearance', color: 'gold' },
};

const PAYMENT_MODE: Record<number, string> = {
  0: '—', 1: 'Cash', 2: 'Cheque', 4: 'Bank transfer', 8: 'Card', 16: 'Online', 32: 'UPI',
};

export function MemberContributionDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['portal-me-contribution', id], queryFn: () => portalMeApi.contributionDetail(id), enabled: !!id });
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      await portalMeApi.contributionPdf(id);
    } catch (err) {
      message.error((err as Error).message || 'Failed to download receipt PDF.');
    } finally {
      setDownloading(false);
    }
  }

  if (q.isLoading) return <Skeleton active />;
  if (q.isError) return <Result status="error" title="Couldn't load receipt" subTitle={(q.error as Error)?.message} />;
  const r = q.data!;
  const statusMeta = RECEIPT_STATUS[r.status] ?? { label: String(r.status), color: 'default' };

  return (
    <div>
      <DetailHeader icon={<GiftOutlined />} title={`Receipt ${r.receiptNumber ?? '(pending)'}`} backTo="/portal/me/contributions">
        <Button type="primary" icon={<DownloadOutlined />} loading={downloading} onClick={downloadPdf}>
          Download duplicate copy
        </Button>
      </DetailHeader>

      <Card className="jm-card">
        <Descriptions column={{ xs: 1, sm: 2, md: 2 }} size="small">
          <Descriptions.Item label="Date">{dayjs(r.receiptDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Status"><Tag color={statusMeta.color}>{statusMeta.label}</Tag></Descriptions.Item>
          <Descriptions.Item label="Amount">
            <span className="jm-tnum jm-num-strong">{r.amountTotal.toLocaleString()} {r.currency}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Payment mode">{PAYMENT_MODE[r.paymentMode] ?? r.paymentMode}</Descriptions.Item>
          {r.chequeNumber && <Descriptions.Item label="Cheque #">{r.chequeNumber}</Descriptions.Item>}
          {r.chequeDate && <Descriptions.Item label="Cheque date">{dayjs(r.chequeDate).format('DD MMM YYYY')}</Descriptions.Item>}
          {r.drawnOnBank && <Descriptions.Item label="Drawn on">{r.drawnOnBank}</Descriptions.Item>}
          {r.bankAccountName && <Descriptions.Item label="Received in">{r.bankAccountName}</Descriptions.Item>}
          {r.paymentReference && <Descriptions.Item label="Reference">{r.paymentReference}</Descriptions.Item>}
          {r.confirmedByUserName && <Descriptions.Item label="Confirmed by">{r.confirmedByUserName}</Descriptions.Item>}
          {r.remarks && <Descriptions.Item label="Notes" span={2}>{r.remarks}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card className="jm-card jm-portal-section-spaced" title="Lines" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" dataSource={r.lines} pagination={false} size="small"
          columns={[
            { title: '#', dataIndex: 'lineNo', width: 60 },
            { title: 'Fund', dataIndex: 'fundTypeName',
              render: (v: string, row) => <span>{v}{row.commitmentCode ? ` · ${row.commitmentCode}` : ''}{row.qarzanHasanaLoanCode ? ` · ${row.qarzanHasanaLoanCode}` : ''}</span> },
            { title: 'Purpose', dataIndex: 'purpose', render: (v: string | null) => v ?? '—' },
            { title: 'Period', dataIndex: 'periodReference', render: (v: string | null) => v ?? '—' },
            { title: 'Amount', dataIndex: 'amount', align: 'end', width: 140,
              render: (v: number) => <span className="jm-tnum">{v.toLocaleString()} {r.currency}</span> },
          ]}
        />
      </Card>
    </div>
  );
}

// --- Commitment detail ---------------------------------------------------

const COMMIT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Draft', color: 'default' }, 2: { label: 'Active', color: 'green' },
  3: { label: 'Completed', color: 'blue' }, 4: { label: 'Cancelled', color: 'red' },
  5: { label: 'Defaulted', color: 'red' }, 6: { label: 'Paused', color: 'orange' },
};

const INSTALLMENT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending', color: 'default' },
  2: { label: 'Partially paid', color: 'gold' },
  3: { label: 'Paid', color: 'green' },
  4: { label: 'Overdue', color: 'red' },
  5: { label: 'Waived', color: 'purple' },
};

export function MemberCommitmentDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['portal-me-commitment', id], queryFn: () => portalMeApi.commitmentDetail(id), enabled: !!id });

  const [agreementOpen, setAgreementOpen] = useState(false);
  const previewQ = useQuery({
    queryKey: ['portal-me-commitment-agreement-preview', id],
    queryFn: () => portalMeApi.commitmentAgreementPreview(id),
    enabled: !!id && agreementOpen,
  });

  const accept = useMutation({
    mutationFn: () => portalMeApi.commitmentAcceptAgreement(id),
    onSuccess: () => {
      message.success('Agreement accepted. Your commitment is now active.');
      setAgreementOpen(false);
      qc.invalidateQueries({ queryKey: ['portal-me-commitment', id] });
      qc.invalidateQueries({ queryKey: ['portal-me-commitments'] });
      qc.invalidateQueries({ queryKey: ['portal-me-dashboard'] });
    },
    onError: (err: Error) => message.error(err.message || 'Could not accept the agreement.'),
  });

  if (q.isLoading) return <Skeleton active />;
  if (q.isError) return <Result status="error" title="Couldn't load commitment" subTitle={(q.error as Error)?.message} />;
  const d = q.data!;
  const c = d.commitment;
  const statusMeta = COMMIT_STATUS[c.status] ?? { label: String(c.status), color: 'default' };

  return (
    <div>
      <DetailHeader icon={<HeartOutlined />} title={`Commitment ${c.code}`} backTo="/portal/me/commitments" />

      {/* Workflow stepper - one component shows the whole journey + the current stage.
          The Accept-agreement CTA below appears only when the member can act. */}
      <WorkflowStepper title="Commitment workflow" {...commitmentWorkflow(c.status, c.hasAcceptedAgreement)} />
      {c.status === 1 /* Draft */ && (
        <Alert type="warning" showIcon className="jm-portal-dashboard-alert"
          message="Action required: review and accept the agreement to activate."
          description={
            <div>
              <div>The first instalment falls due on {dayjs(c.startDate).format('DD MMM YYYY')}. Review the agreement before you accept.</div>
              <div className="jm-portal-upnext-cta">
                <Button type="primary" onClick={() => setAgreementOpen(true)}>
                  Review and accept agreement
                </Button>
              </div>
            </div>
          } />
      )}

      <Modal
        title="Commitment agreement"
        open={agreementOpen}
        onCancel={() => setAgreementOpen(false)}
        width={720}
        footer={[
          <Button key="cancel" onClick={() => setAgreementOpen(false)}>Close</Button>,
          <Button key="ok" type="primary" loading={accept.isPending}
            disabled={previewQ.isLoading || !!previewQ.data?.isAlreadyAccepted}
            onClick={() => accept.mutate()}>
            I agree and accept
          </Button>,
        ]}>
        {previewQ.isLoading ? <Skeleton active /> : previewQ.isError ? (
          <Alert type="error" showIcon message="Couldn't load the agreement"
            description={(previewQ.error as Error)?.message ?? ''} />
        ) : previewQ.data ? (
          <div>
            {previewQ.data.templateName && (
              <Typography.Text type="secondary">
                Template: {previewQ.data.templateName}{previewQ.data.templateVersion ? ` v${previewQ.data.templateVersion}` : ''}
              </Typography.Text>
            )}
            <div className="jm-portal-agreement-text">
              <ReactMarkdown>{previewQ.data.renderedText}</ReactMarkdown>
            </div>
            <Alert type="info" showIcon
              message="By clicking I agree and accept, you confirm the schedule below and bind yourself to this agreement."
              description="A timestamped audit record (you, your IP, your browser, and this acceptance) is written to the commitment." />
          </div>
        ) : null}
      </Modal>

      {/* --- Top metrics strip + comprehensive Descriptions, two-column ----- */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card className="jm-card" size="small">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered
              items={[
                { key: 'code',     label: 'Code',          children: <span className="jm-tnum">{c.code}</span> },
                { key: 'status',   label: 'Status',        children: <Tag color={statusMeta.color}>{statusMeta.label}</Tag> },
                { key: 'fund',     label: 'Fund',          children: c.fundTypeName },
                { key: 'freq',     label: 'Frequency',     children: COMMIT_FREQUENCY[c.frequency] ?? `Code ${c.frequency}` },
                { key: 'count',    label: 'Instalments',   children: <span className="jm-tnum">{c.numberOfInstallments}</span> },
                { key: 'perInst',  label: 'Per instalment',
                  children: <span className="jm-tnum">{(c.totalAmount / Math.max(1, c.numberOfInstallments)).toLocaleString()} {c.currency}</span> },
                { key: 'total',    label: 'Total pledge',
                  children: <span className="jm-tnum jm-num-strong">{c.totalAmount.toLocaleString()} {c.currency}</span> },
                { key: 'paid',     label: 'Paid',
                  children: <span className="jm-tnum">{c.paidAmount.toLocaleString()} {c.currency}</span> },
                { key: 'start',    label: 'Start',         children: dayjs(c.startDate).format('DD MMM YYYY') },
                { key: 'end',      label: 'End',           children: c.endDate ? dayjs(c.endDate).format('DD MMM YYYY') : '—' },
                { key: 'agree',    label: 'Agreement', span: 2,
                  children: c.hasAcceptedAgreement
                    ? <span><Tag color="green">Accepted</Tag>{c.agreementAcceptedAtUtc ? ` on ${dayjs(c.agreementAcceptedAtUtc).format('DD MMM YYYY HH:mm')}` : ''}</span>
                    : <Tag color="gold">Pending acceptance</Tag> },
                ...(c.notes ? [{ key: 'notes', label: 'Notes', span: 2, children: c.notes }] : []),
              ]} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="jm-card jm-portal-progress-card" size="small">
            <div className="jm-portal-progress-card-label">Progress</div>
            <div className="jm-portal-progress-card-pct">{Math.round(c.progressPercent)}%</div>
            <Progress percent={Math.round(c.progressPercent)} showInfo={false}
              strokeColor={{ from: 'var(--jm-primary-500)', to: 'var(--jm-success-fg-strong)' }} />
            <div className="jm-portal-progress-card-stats">
              <div><Statistic title="Paid" value={c.paidAmount} suffix={c.currency} precision={0} /></div>
              <div><Statistic title="Outstanding" value={c.remainingAmount} suffix={c.currency} precision={0}
                valueStyle={{ color: c.remainingAmount > 0 ? 'var(--jm-warning, #f59e0b)' : 'var(--jm-success-fg-strong)' }} /></div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* --- Tabs: Schedule / Payments / Agreement ----------------------- */}
      <Card className="jm-card jm-portal-section-spaced">
        <Tabs defaultActiveKey="schedule" items={[
          {
            key: 'schedule', label: 'Schedule',
            children: (
              <Table
                rowKey="id" dataSource={d.installments} pagination={false} size="small"
                locale={{ emptyText: <Empty description="No instalments." /> }}
                columns={[
                  { title: '#', dataIndex: 'installmentNo', width: 60 },
                  { title: 'Due date', dataIndex: 'dueDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
                  { title: 'Scheduled', dataIndex: 'scheduledAmount', align: 'end', width: 140,
                    render: (v: number) => <span className="jm-tnum">{v.toLocaleString()} {c.currency}</span> },
                  { title: 'Paid', dataIndex: 'paidAmount', align: 'end', width: 140,
                    render: (v: number) => <span className="jm-tnum">{v.toLocaleString()} {c.currency}</span> },
                  { title: 'Remaining', dataIndex: 'remainingAmount', align: 'end', width: 140,
                    render: (v: number) => <span className="jm-tnum">{v.toLocaleString()} {c.currency}</span> },
                  { title: 'Last payment', key: 'last', width: 200,
                    render: (_, r) => r.lastPaymentReceiptNumber
                      ? <Link to={`/portal/me/contributions/${r.lastPaymentReceiptId}`} className="jm-tnum">
                          {r.lastPaymentReceiptNumber}
                          {r.lastPaymentDate && <span className="jm-muted"> · {dayjs(r.lastPaymentDate).format('DD MMM YYYY')}</span>}
                        </Link>
                      : <span className="jm-muted">—</span> },
                  { title: 'Status', dataIndex: 'status', width: 130,
                    render: (s: number) => {
                      const m = INSTALLMENT_STATUS[s] ?? { label: String(s), color: 'default' };
                      return <Tag color={m.color}>{m.label}</Tag>;
                    } },
                ]}
              />
            ),
          },
          {
            key: 'payments', label: 'Payments',
            children: <CommitmentPaymentsTab commitmentId={id} currency={c.currency} />,
          },
          {
            key: 'agreement', label: 'Agreement',
            children: c.hasAcceptedAgreement || c.status === 1
              ? <CommitmentAgreementTab commitmentId={id} acceptedAtUtc={c.agreementAcceptedAtUtc} acceptedByName={c.agreementAcceptedByName} />
              : <Empty description="No agreement on file yet." />,
          },
        ]} />
      </Card>
    </div>
  );
}

// Local label maps for the new bordered Descriptions block.
const COMMIT_FREQUENCY: Record<number, string> = {
  1: 'One-time', 2: 'Weekly', 3: 'Bi-weekly',
  4: 'Monthly', 5: 'Quarterly', 6: 'Half-yearly', 7: 'Yearly', 99: 'Custom',
};

function CommitmentPaymentsTab({ commitmentId, currency }: { commitmentId: string; currency: string }) {
  const q = useQuery({
    queryKey: ['portal-me-commitment-payments', commitmentId],
    queryFn: () => portalMeApi.commitmentPayments(commitmentId),
    enabled: !!commitmentId,
  });
  if (q.isLoading) return <Skeleton active />;
  const rows = q.data ?? [];
  return (
    <Table
      rowKey="receiptId" dataSource={rows} pagination={{ pageSize: 25 }} size="small"
      locale={{ emptyText: <Empty description="No payments recorded against this commitment yet." /> }}
      columns={[
        { title: 'Date', dataIndex: 'receiptDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
        { title: 'Receipt #', dataIndex: 'receiptNumber', width: 160,
          render: (v: string | null, r) => v
            ? <Link to={`/portal/me/contributions/${r.receiptId}`} className="jm-tnum">{v}</Link>
            : <em className="jm-muted-em">pending</em> },
        { title: 'Inst.', dataIndex: 'installmentNo', width: 70, align: 'end',
          render: (v: number | null) => v ? `#${v}` : <span className="jm-muted">—</span> },
        { title: 'Amount', dataIndex: 'amount', align: 'end', width: 160,
          render: (v: number) => <span className="jm-tnum jm-num-strong">{v.toLocaleString()} {currency}</span> },
        { title: 'Method', dataIndex: 'paymentMode', width: 130,
          render: (v: number) => PAYMENT_MODE[v] ?? `Mode ${v}` },
        { title: 'Cheque / ref', key: 'ref', width: 200,
          render: (_, r) => r.chequeNumber ? `Cheque ${r.chequeNumber}${r.chequeDate ? ` · ${dayjs(r.chequeDate).format('DD MMM YYYY')}` : ''}`
            : (r.paymentReference ?? <span className="jm-muted">—</span>) },
        { title: 'Bank', dataIndex: 'bankAccountName', render: (v: string | null) => v ?? '—' },
        { title: 'Status', dataIndex: 'receiptStatus', width: 120,
          render: (s: number) => {
            const m = RECEIPT_STATUS[s] ?? { label: String(s), color: 'default' };
            return <Tag color={m.color}>{m.label}</Tag>;
          } },
      ]}
    />
  );
}

function CommitmentAgreementTab({ commitmentId, acceptedAtUtc, acceptedByName }: {
  commitmentId: string; acceptedAtUtc: string | null; acceptedByName?: string | null;
}) {
  const q = useQuery({
    queryKey: ['portal-me-commitment-agreement-tab', commitmentId],
    queryFn: () => portalMeApi.commitmentAgreementPreview(commitmentId),
    enabled: !!commitmentId,
  });
  if (q.isLoading) return <Skeleton active />;
  if (q.isError) return <Result status="error" title="Couldn't load the agreement" subTitle={(q.error as Error)?.message} />;
  const data = q.data!;
  return (
    <div>
      {data.templateName && (
        <Typography.Text type="secondary">
          Template: {data.templateName}{data.templateVersion ? ` v${data.templateVersion}` : ''}
        </Typography.Text>
      )}
      <div className="jm-portal-agreement-text">
        <ReactMarkdown>{data.renderedText}</ReactMarkdown>
      </div>
      {acceptedAtUtc && (
        <Card className="jm-card jm-portal-section-spaced" size="small" title="Acceptance proof">
          <Descriptions column={1} size="small" colon items={[
            { key: 'who',  label: 'Accepted by', children: acceptedByName ?? 'You' },
            { key: 'when', label: 'On',          children: dayjs(acceptedAtUtc).format('DD MMM YYYY HH:mm') },
            { key: 'how',  label: 'Method',      children: 'Member portal (self)' },
          ]} />
        </Card>
      )}
    </div>
  );
}

// --- QH detail page ------------------------------------------------------

const QH_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Draft', color: 'default' },
  2: { label: 'Pending L1', color: 'gold' },
  3: { label: 'Pending L2', color: 'gold' },
  4: { label: 'Approved', color: 'green' },
  5: { label: 'Disbursed', color: 'blue' },
  6: { label: 'Active', color: 'cyan' },
  7: { label: 'Completed', color: 'green' },
  8: { label: 'Defaulted', color: 'red' },
  9: { label: 'Cancelled', color: 'default' },
  10: { label: 'Rejected', color: 'red' },
};

const QH_INSTALLMENT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending', color: 'default' },
  2: { label: 'Partially paid', color: 'gold' },
  3: { label: 'Paid', color: 'green' },
  4: { label: 'Overdue', color: 'red' },
  5: { label: 'Waived', color: 'purple' },
};

export function MemberQhDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['portal-me-qh', id], queryFn: () => portalMeApi.qhDetail(id), enabled: !!id });

  if (q.isLoading) return <Skeleton active />;
  if (q.isError) return <Result status="error" title="Couldn't load loan" subTitle={(q.error as Error)?.message} />;
  const d = q.data!;
  const l = d.loan;
  const statusMeta = QH_STATUS[l.status] ?? { label: String(l.status), color: 'default' };

  return (
    <div>
      <DetailHeader icon={<BankOutlined />} title={`Qarzan Hasana ${l.code}`} backTo="/portal/me/qarzan-hasana" />

      {/* Workflow stepper: one component shows the journey, the current stage, and a
          member-friendly note. Terminal states (rejected/cancelled/defaulted) replace the
          stepper with a status Alert. */}
      <WorkflowStepper title="Loan workflow" {...qhWorkflow(l.status, l.rejectionReason)} />

      {/* Two-column header: comprehensive Descriptions + Progress side-card. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card className="jm-card" size="small">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered
              items={[
                { key: 'code',    label: 'Code',         children: <span className="jm-tnum">{l.code}</span> },
                { key: 'status',  label: 'Status',       children: <Tag color={statusMeta.color}>{statusMeta.label}</Tag> },
                { key: 'scheme',  label: 'Scheme',       children: QH_SCHEME_LABEL[l.scheme] ?? `Scheme ${l.scheme}` },
                { key: 'currency', label: 'Currency',    children: l.currency },
                { key: 'req',     label: 'Requested',
                  children: <span className="jm-tnum">{l.amountRequested.toLocaleString()} {l.currency}</span> },
                { key: 'app',     label: 'Approved',
                  children: <span className="jm-tnum">{l.amountApproved.toLocaleString()} {l.currency}</span> },
                { key: 'disb',    label: 'Disbursed',
                  children: <span className="jm-tnum">{l.amountDisbursed.toLocaleString()} {l.currency}</span> },
                { key: 'rep',     label: 'Repaid',
                  children: <span className="jm-tnum">{l.amountRepaid.toLocaleString()} {l.currency}</span> },
                { key: 'inst',    label: 'Instalments',  children: `${l.instalmentsApproved} of ${l.instalmentsRequested}` },
                { key: 'start',   label: 'Start',        children: dayjs(l.startDate).format('DD MMM YYYY') },
                { key: 'end',     label: 'End',          children: l.endDate ? dayjs(l.endDate).format('DD MMM YYYY') : '—' },
                { key: 'disb_on', label: 'Disbursed on', children: l.disbursedOn ? dayjs(l.disbursedOn).format('DD MMM YYYY') : '—' },
              ]} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="jm-card jm-portal-progress-card" size="small">
            <div className="jm-portal-progress-card-label">Repayment progress</div>
            <div className="jm-portal-progress-card-pct">{Math.round(l.progressPercent)}%</div>
            <Progress percent={Math.round(l.progressPercent)} showInfo={false}
              strokeColor={{ from: 'var(--jm-primary-500)', to: 'var(--jm-success-fg-strong)' }} />
            <div className="jm-portal-progress-card-stats">
              <div><Statistic title="Repaid" value={l.amountRepaid} suffix={l.currency} precision={0} /></div>
              <div><Statistic title="Outstanding" value={l.amountOutstanding} suffix={l.currency} precision={0}
                valueStyle={{ color: l.amountOutstanding > 0 ? 'var(--jm-warning, #f59e0b)' : 'var(--jm-success-fg-strong)' }} /></div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Tabs: Borrower's case / Approval / Schedule / Guarantors / Payments. */}
      <Card className="jm-card jm-portal-section-spaced">
        <Tabs defaultActiveKey="case" items={[
          {
            key: 'case', label: "Borrower's case",
            children: (
              <Descriptions column={{ xs: 1, sm: 2 }} size="small" colon items={[
                ...(l.purpose ? [{ key: 'p', label: 'Purpose', span: 2, children: l.purpose }] : []),
                ...(l.repaymentPlan ? [{ key: 'rp', label: 'Repayment plan', span: 2, children: l.repaymentPlan }] : []),
                { key: 'mi',  label: 'Monthly income',
                  children: l.monthlyIncome !== null ? <span className="jm-tnum">{l.monthlyIncome.toLocaleString()} {l.currency}</span> : '—' },
                { key: 'me',  label: 'Monthly expenses',
                  children: l.monthlyExpenses !== null ? <span className="jm-tnum">{l.monthlyExpenses.toLocaleString()} {l.currency}</span> : '—' },
                ...(l.rejectionReason ? [{
                  key: 'rj', label: 'Rejection reason', span: 2,
                  children: <Alert type="error" showIcon message={l.rejectionReason} />,
                }] : []),
              ]} />
            ),
          },
          {
            key: 'approval', label: 'Approval audit',
            children: (
              <Descriptions column={1} size="small" bordered items={[
                { key: 'l1at', label: 'L1 reviewed at',
                  children: l.level1ApprovedAtUtc ? dayjs(l.level1ApprovedAtUtc).format('DD MMM YYYY HH:mm') : <span className="jm-muted">Pending</span> },
                { key: 'l2at', label: 'L2 reviewed at',
                  children: l.level2ApprovedAtUtc ? dayjs(l.level2ApprovedAtUtc).format('DD MMM YYYY HH:mm') : <span className="jm-muted">Pending</span> },
                { key: 'disb', label: 'Disbursed on',
                  children: l.disbursedOn ? dayjs(l.disbursedOn).format('DD MMM YYYY') : <span className="jm-muted">Not yet</span> },
              ]} />
            ),
          },
          {
            key: 'schedule', label: 'Repayment schedule',
            children: (
              <Table
                rowKey="id" dataSource={d.installments} pagination={false} size="small"
                locale={{ emptyText: <Empty description="No instalments scheduled yet." /> }}
                columns={[
                  { title: '#', dataIndex: 'installmentNo', width: 60 },
                  { title: 'Due date', dataIndex: 'dueDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
                  { title: 'Scheduled', dataIndex: 'scheduledAmount', align: 'end', width: 140,
                    render: (v: number) => <span className="jm-tnum">{v.toLocaleString()} {l.currency}</span> },
                  { title: 'Paid', dataIndex: 'paidAmount', align: 'end', width: 140,
                    render: (v: number) => <span className="jm-tnum">{v.toLocaleString()} {l.currency}</span> },
                  { title: 'Remaining', dataIndex: 'remainingAmount', align: 'end', width: 140,
                    render: (v: number) => <span className="jm-tnum">{v.toLocaleString()} {l.currency}</span> },
                  { title: 'Last payment', dataIndex: 'lastPaymentDate', width: 140,
                    render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY') : '—' },
                  { title: 'Status', dataIndex: 'status', width: 130,
                    render: (s: number) => {
                      const m = QH_INSTALLMENT_STATUS[s] ?? { label: String(s), color: 'default' };
                      return <Tag color={m.color}>{m.label}</Tag>;
                    } },
                ]}
              />
            ),
          },
          {
            key: 'guarantors', label: 'Guarantors',
            children: <QhGuarantorsTab loanId={id}
              fallbackG1Name={l.guarantor1Name} fallbackG2Name={l.guarantor2Name} />,
          },
          {
            key: 'payments', label: 'Repayments',
            children: <QhPaymentsTab loanId={id} currency={l.currency} />,
          },
        ]} />
      </Card>
    </div>
  );
}

const QH_SCHEME_LABEL: Record<number, string> = {
  0: 'Other',
  1: 'Mohammadi (against gold)',
  2: 'Hussain (against kafil)',
};

const CONSENT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending', color: 'gold' },
  2: { label: 'Endorsed', color: 'green' },
  3: { label: 'Declined', color: 'red' },
};

function QhGuarantorsTab({ loanId, fallbackG1Name, fallbackG2Name }: {
  loanId: string; fallbackG1Name: string; fallbackG2Name: string;
}) {
  const q = useQuery({
    queryKey: ['portal-me-qh-consents', loanId],
    queryFn: () => portalMeApi.qhGuarantorConsents(loanId),
    enabled: !!loanId,
  });
  if (q.isLoading) return <Skeleton active />;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    // Fall back to the loan's snapshot guarantor names if the consent rows haven't been
    // populated yet (very early-stage drafts).
    return (
      <Space direction="vertical" size={8}>
        <Typography.Text type="secondary">Awaiting consent records to be issued.</Typography.Text>
        <div>{fallbackG1Name} <Tag>Guarantor 1</Tag></div>
        <div>{fallbackG2Name} <Tag>Guarantor 2</Tag></div>
      </Space>
    );
  }
  return (
    <Table
      rowKey="id" dataSource={rows} pagination={false} size="small"
      columns={[
        { title: 'Guarantor', key: 'who',
          render: (_, r) => <Space><TeamOutlined /><strong>{r.guarantorName}</strong> <span className="jm-tnum jm-muted">{r.guarantorItsNumber}</span></Space> },
        { title: 'Status', dataIndex: 'status', width: 140,
          render: (s: number) => {
            const m = CONSENT_STATUS[s] ?? { label: String(s), color: 'default' };
            return <Tag color={m.color}>{m.label}</Tag>;
          } },
        { title: 'Decided at', dataIndex: 'respondedAtUtc', width: 200,
          render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : <span className="jm-muted">—</span> },
        { title: 'Notified at', dataIndex: 'notificationSentAtUtc', width: 200,
          render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : <span className="jm-muted">—</span> },
      ]}
    />
  );
}

function QhPaymentsTab({ loanId, currency }: { loanId: string; currency: string }) {
  const q = useQuery({
    queryKey: ['portal-me-qh-payments', loanId],
    queryFn: () => portalMeApi.qhPayments(loanId),
    enabled: !!loanId,
  });
  if (q.isLoading) return <Skeleton active />;
  const rows = q.data ?? [];
  return (
    <Table
      rowKey="id" dataSource={rows} pagination={{ pageSize: 25 }} size="small"
      locale={{ emptyText: <Empty description="No repayments recorded against this loan yet." /> }}
      columns={[
        { title: 'Date', dataIndex: 'receiptDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
        { title: 'Receipt #', dataIndex: 'receiptNumber', width: 160,
          render: (v: string | null, r) => v
            ? <Link to={`/portal/me/contributions/${r.id}`} className="jm-tnum">{v}</Link>
            : <em className="jm-muted-em">pending</em> },
        { title: 'Amount', dataIndex: 'amount', align: 'end', width: 160,
          render: (v: number) => <span className="jm-tnum jm-num-strong">{v.toLocaleString()} {currency}</span> },
        { title: 'Method', dataIndex: 'paymentMode', width: 130,
          render: (v: number) => PAYMENT_MODE[v] ?? `Mode ${v}` },
        { title: 'Cheque / ref', key: 'ref', width: 200,
          render: (_, r) => r.chequeNumber ? `Cheque ${r.chequeNumber}${r.chequeDate ? ` · ${dayjs(r.chequeDate).format('DD MMM YYYY')}` : ''}`
            : (r.paymentReference ?? <span className="jm-muted">—</span>) },
        { title: 'Notes', dataIndex: 'remarks', render: (v: string | null) => v ?? '—' },
        { title: 'Status', dataIndex: 'status', width: 120,
          render: (s: number) => {
            const m = RECEIPT_STATUS[s] ?? { label: String(s), color: 'default' };
            return <Tag color={m.color}>{m.label}</Tag>;
          } },
      ]}
    />
  );
}

// --- Patronages list -----------------------------------------------------

const FE_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Draft', color: 'default' },
  2: { label: 'Active', color: 'green' },
  3: { label: 'Paused', color: 'orange' },
  4: { label: 'Cancelled', color: 'red' },
  5: { label: 'Expired', color: 'default' },
};

const FE_RECURRENCE: Record<number, string> = {
  1: 'One-time', 2: 'Monthly', 3: 'Quarterly', 4: 'Half-yearly', 5: 'Yearly', 99: 'Custom',
};

export function MemberPatronagesPage() {
  const q = useQuery({ queryKey: ['portal-me-patronages'], queryFn: portalMeApi.fundEnrollments });
  return (
    <div>
      <div className="jm-section-head">
        <Typography.Title level={4} className="jm-section-title">
          <GiftOutlined /> Patronages
        </Typography.Title>
        <Link to="/portal/me/fund-enrollments/new">
          <Button type="primary" icon={<PlusOutlined />}>Request enrollment</Button>
        </Link>
      </div>
      <Typography.Paragraph type="secondary" className="jm-page-intro">
        Your fund enrollments — Sabil, Mutafariq, Niyaz, etc. Each row tracks how much has been collected against that fund and links to the underlying receipts.
      </Typography.Paragraph>
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<FundEnrollmentRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No patronages on record yet." /> }}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 140, render: (v, r) => <Link to={`/portal/me/fund-enrollments/${r.id}`} className="jm-tnum">{v}</Link> },
            { title: 'Fund', dataIndex: 'fundTypeName' },
            { title: 'Sub-type', dataIndex: 'subType', render: (v: string | null) => v ?? '—' },
            { title: 'Recurrence', dataIndex: 'recurrence', width: 130, render: (v: number) => FE_RECURRENCE[v] ?? v },
            { title: 'Started', dataIndex: 'startDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => {
                const m = FE_STATUS[s] ?? { label: String(s), color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
              } },
          ]}
        />
      </Card>
    </div>
  );
}

export function MemberPatronageDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['portal-me-patronage', id], queryFn: () => portalMeApi.fundEnrollmentDetail(id), enabled: !!id });

  if (q.isLoading) return <Skeleton active />;
  if (q.isError) return <Result status="error" title="Couldn't load patronage" subTitle={(q.error as Error)?.message} />;
  const d = q.data!;
  const e = d.enrollment;
  const statusMeta = FE_STATUS[e.status] ?? { label: String(e.status), color: 'default' };

  return (
    <div>
      <DetailHeader icon={<GiftOutlined />} title={`Patronage ${e.code}`} backTo="/portal/me/fund-enrollments" />
      <WorkflowStepper title="Patronage workflow" {...patronageWorkflow(e.status)} />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card className="jm-card" size="small">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered items={[
              { key: 'code',   label: 'Code',        children: <span className="jm-tnum">{e.code}</span> },
              { key: 'status', label: 'Status',      children: <Tag color={statusMeta.color}>{statusMeta.label}</Tag> },
              { key: 'fund',   label: 'Fund',        children: e.fundTypeName },
              { key: 'sub',    label: 'Sub-type',    children: e.subType ?? '—' },
              { key: 'rec',    label: 'Recurrence',  children: FE_RECURRENCE[e.recurrence] ?? e.recurrence },
              { key: 'start',  label: 'Started',     children: dayjs(e.startDate).format('DD MMM YYYY') },
              { key: 'end',    label: 'Ends',        children: e.endDate ? dayjs(e.endDate).format('DD MMM YYYY') : '—' },
              { key: 'count',  label: 'Receipts',    children: <span className="jm-tnum">{e.receiptCount}</span> },
              ...(e.notes ? [{ key: 'notes', label: 'Notes', span: 2, children: e.notes }] : []),
            ]} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="jm-card jm-portal-progress-card" size="small">
            <div className="jm-portal-progress-card-label">Total collected</div>
            <div className="jm-portal-progress-card-pct">
              {e.totalCollected.toLocaleString()}
            </div>
            <div className="jm-portal-progress-card-stats">
              <div><Statistic title="Receipts" value={e.receiptCount} /></div>
              <div><Statistic title="Status" valueRender={() => <Tag color={statusMeta.color}>{statusMeta.label}</Tag>} value="" /></div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card className="jm-card jm-portal-section-spaced" title="Contributing receipts" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="receiptId" dataSource={d.receipts} pagination={{ pageSize: 20 }} size="small"
          locale={{ emptyText: <Empty description="No receipts have contributed yet." /> }}
          columns={[
            { title: 'Date', dataIndex: 'receiptDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Receipt #', dataIndex: 'receiptNumber', width: 160,
              render: (v: string | null, row) => v
                ? <Link to={`/portal/me/contributions/${row.receiptId}`} className="jm-tnum">{v}</Link>
                : <em className="jm-muted-em">pending</em> },
            { title: 'Amount', dataIndex: 'amount', align: 'end', width: 160,
              render: (v: number, row) => <span className="jm-tnum">{v.toLocaleString()} {row.currency}</span> },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => {
                const m = RECEIPT_STATUS[s] ?? { label: String(s), color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
              } },
          ]}
        />
      </Card>
    </div>
  );
}

// --- QH self-submit form -------------------------------------------------

type QhFormShape = {
  amountRequested: number; instalmentsRequested: number; currency: string;
  startDate: Dayjs; scheme: number;
  guarantor1MemberId: string; guarantor2MemberId: string;
  purpose: string; repaymentPlan: string;
  sourceOfIncome?: string; otherObligations?: string;
  monthlyIncome?: number; monthlyExpenses?: number; monthlyExistingEmis?: number;
  goldAmount?: number; goldWeightGrams?: number; goldPurityKarat?: number; goldHeldAt?: string;
};

export function MemberQhSubmitPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm<QhFormShape>();

  const submit = useMutation({
    mutationFn: (payload: CreateQhPayload) => portalMeApi.qhCreate(payload),
    onSuccess: () => {
      message.success('Application submitted. You will be notified once it is reviewed.');
      qc.invalidateQueries({ queryKey: ['portal-me-qh'] });
      qc.invalidateQueries({ queryKey: ['portal-me-dashboard'] });
      navigate('/portal/me/qarzan-hasana');
    },
    onError: (err: Error) => message.error(err.message || 'Submit failed.'),
  });

  const initial = useMemo<Partial<QhFormShape>>(() => ({
    currency: 'INR', scheme: 1, instalmentsRequested: 12,
    startDate: dayjs().add(7, 'day'),
  }), []);

  // Schemes have different supporting evidence: Mohammadi requires gold collateral details;
  // Hussain is a free-form benevolent loan against guarantors only. Toggle the gold panel.
  const scheme = Form.useWatch('scheme', form);
  const guarantor1 = Form.useWatch('guarantor1MemberId', form);
  const guarantor2 = Form.useWatch('guarantor2MemberId', form);
  // Same person can't kafil both slots.
  const sameGuarantor = !!guarantor1 && guarantor1 === guarantor2;

  function onFinish(v: QhFormShape) {
    submit.mutate({
      amountRequested: v.amountRequested,
      instalmentsRequested: v.instalmentsRequested,
      currency: v.currency,
      startDate: v.startDate.format('YYYY-MM-DD'),
      guarantor1MemberId: v.guarantor1MemberId,
      guarantor2MemberId: v.guarantor2MemberId,
      scheme: v.scheme,
      goldAmount: v.scheme === 1 ? v.goldAmount ?? null : null,
      purpose: v.purpose,
      repaymentPlan: v.repaymentPlan,
      sourceOfIncome: v.sourceOfIncome ?? null,
      otherObligations: v.otherObligations ?? null,
      monthlyIncome: v.monthlyIncome ?? null,
      monthlyExpenses: v.monthlyExpenses ?? null,
      monthlyExistingEmis: v.monthlyExistingEmis ?? null,
      guarantorsAcknowledged: false,
    });
  }

  return (
    <div>
      <DetailHeader icon={<BankOutlined />} title="New Qarzan Hasana request" backTo="/portal/me/qarzan-hasana" />
      <Alert type="info" showIcon className="jm-portal-dashboard-alert"
        message="Two members must agree to act as your kafil (guarantors) before this loan can be approved."
        description="Search for them by name or ITS number. After you submit, both kafil will be notified and asked to endorse from their own portal." />
      <Card className="jm-card">
        <Form<QhFormShape> form={form} layout="vertical" initialValues={initial} onFinish={onFinish}>
          <Divider orientation="left" plain>Loan details</Divider>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Amount requested" name="amountRequested"
                rules={[{ required: true, message: 'Enter the amount you need.' }, { type: 'number', min: 1 }]}>
                <InputNumber<number> className="jm-full-width" min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Currency" name="currency" rules={[{ required: true }]}>
                <Select options={[{ value: 'INR', label: 'INR' }, { value: 'AED', label: 'AED' }, { value: 'USD', label: 'USD' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Number of instalments" name="instalmentsRequested"
                rules={[{ required: true }, { type: 'number', min: 1, max: 60 }]}>
                <InputNumber<number> className="jm-full-width" min={1} max={60} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Scheme" name="scheme" rules={[{ required: true }]}
                tooltip="Mohammadi: against gold collateral. Hussain: against guarantors only.">
                <Select options={[
                  { value: 1, label: 'Mohammadi (against gold)' },
                  { value: 2, label: 'Hussain (against kafil)' },
                  { value: 0, label: 'Other' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Start date" name="startDate" rules={[{ required: true }]}>
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>Guarantors (Kafil)</Divider>
          {sameGuarantor && (
            <Alert type="error" showIcon className="jm-portal-dashboard-alert"
              message="Guarantor 1 and Guarantor 2 cannot be the same person." />
          )}
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Guarantor 1 (Kafil)" name="guarantor1MemberId"
                rules={[{ required: true, message: 'Pick a member.' }]}>
                <MemberSearchSelect placeholder="Search by name or ITS" excludeId={guarantor2 ?? null} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Guarantor 2 (Kafil)" name="guarantor2MemberId"
                rules={[{ required: true, message: 'Pick a member.' }]}>
                <MemberSearchSelect placeholder="Search by name or ITS" excludeId={guarantor1 ?? null} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>Borrower's case</Divider>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item label="Purpose" name="purpose" rules={[{ required: true, min: 5 }]}>
                <Input.TextArea rows={2} placeholder="What is the loan for? (school fees, medical, business expansion…)" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Repayment plan" name="repaymentPlan" rules={[{ required: true, min: 5 }]}>
                <Input.TextArea rows={2} placeholder="How will you repay each instalment? (salary, business income, family support…)" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Source of income (optional)" name="sourceOfIncome">
                <Input placeholder="Salary, business, freelance, rental…" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Other obligations (optional)" name="otherObligations">
                <Input placeholder="Other loans, EMIs, family commitments…" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>Cashflow (helps the approver)</Divider>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Monthly income" name="monthlyIncome">
                <InputNumber<number> className="jm-full-width" min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Monthly expenses" name="monthlyExpenses">
                <InputNumber<number> className="jm-full-width" min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Existing EMIs" name="monthlyExistingEmis">
                <InputNumber<number> className="jm-full-width" min={0} />
              </Form.Item>
            </Col>
          </Row>

          {scheme === 1 && (
            <>
              <Divider orientation="left" plain>Gold collateral (Mohammadi only)</Divider>
              <Row gutter={16}>
                <Col xs={24} md={6}>
                  <Form.Item label="Gold value" name="goldAmount">
                    <InputNumber<number> className="jm-full-width" min={0} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Gold weight (g)" name="goldWeightGrams">
                    <InputNumber<number> className="jm-full-width" min={0} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Purity (karat)" name="goldPurityKarat">
                    <InputNumber<number> className="jm-full-width" min={0} max={24} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Held at" name="goldHeldAt">
                    <Input placeholder="Locker / safe" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit"
                loading={submit.isPending} disabled={sameGuarantor}>Submit application</Button>
              <Button onClick={() => navigate('/portal/me/qarzan-hasana')}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

// --- Commitment self-submit form ----------------------------------------

type CommitmentFormShape = {
  fundTypeId: string; currency: string; totalAmount: number;
  frequency: number; numberOfInstallments: number;
  startDate: Dayjs; notes?: string;
};

export function MemberCommitmentSubmitPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm<CommitmentFormShape>();
  const fundsQ = useQuery({ queryKey: ['portal-me-fund-types', 'donation'], queryFn: () => portalMeApi.fundTypes('donation') });

  const submit = useMutation({
    mutationFn: (payload: CreateCommitmentPayload) => portalMeApi.commitmentCreate(payload),
    onSuccess: () => {
      message.success('Commitment submitted. An administrator will activate it after the agreement is accepted.');
      qc.invalidateQueries({ queryKey: ['portal-me-commitments'] });
      qc.invalidateQueries({ queryKey: ['portal-me-dashboard'] });
      navigate('/portal/me/commitments');
    },
    onError: (err: Error) => message.error(err.message || 'Submit failed.'),
  });

  const initial = useMemo<Partial<CommitmentFormShape>>(() => ({
    currency: 'INR', frequency: 2, numberOfInstallments: 12,
    startDate: dayjs().add(7, 'day'),
  }), []);

  function onFinish(v: CommitmentFormShape) {
    submit.mutate({
      fundTypeId: v.fundTypeId,
      currency: v.currency,
      totalAmount: v.totalAmount,
      frequency: v.frequency,
      numberOfInstallments: v.numberOfInstallments,
      startDate: v.startDate.format('YYYY-MM-DD'),
      notes: v.notes ?? null,
    });
  }

  return (
    <div>
      <DetailHeader icon={<HeartOutlined />} title="New commitment" backTo="/portal/me/commitments" />
      <Alert type="info" showIcon className="jm-portal-dashboard-alert"
        message="Submit a pledge to one of the funds you wish to support."
        description="The commitment lands in Draft. An administrator will accept the agreement on your behalf, after which the schedule becomes active." />
      <Card className="jm-card">
        <Form<CommitmentFormShape> form={form} layout="vertical" initialValues={initial} onFinish={onFinish}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Fund" name="fundTypeId" rules={[{ required: true, message: 'Choose a fund.' }]}>
                <Select loading={fundsQ.isLoading}
                  placeholder="Select fund"
                  options={(fundsQ.data ?? []).map((f) => ({ value: f.id, label: `${f.code} — ${f.name}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Currency" name="currency" rules={[{ required: true }]}>
                <Select options={[{ value: 'INR', label: 'INR' }, { value: 'AED', label: 'AED' }, { value: 'USD', label: 'USD' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Total amount" name="totalAmount"
                rules={[{ required: true, message: 'Enter a total.' }, { type: 'number', min: 1 }]}>
                <InputNumber<number> className="jm-full-width" min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Frequency" name="frequency" rules={[{ required: true }]}>
                <Select options={[
                  { value: 1, label: 'Weekly' },
                  { value: 2, label: 'Monthly' },
                  { value: 3, label: 'Quarterly' },
                  { value: 4, label: 'Half-yearly' },
                  { value: 5, label: 'Yearly' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Number of installments" name="numberOfInstallments"
                rules={[{ required: true }, { type: 'number', min: 1, max: 240 }]}>
                <InputNumber<number> className="jm-full-width" min={1} max={240} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Start date" name="startDate" rules={[{ required: true }]}>
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Notes" name="notes">
                <Input.TextArea rows={2} placeholder="Anything the administrator should know about this commitment." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={submit.isPending}>Submit commitment</Button>
              <Button onClick={() => navigate('/portal/me/commitments')}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

// --- Patronage / fund-enrollment request form --------------------------

type PatronageFormShape = {
  fundTypeId: string; subType?: string;
  recurrence: number;
  startDate: Dayjs; endDate?: Dayjs;
  notes?: string;
};

export function MemberPatronageSubmitPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm<PatronageFormShape>();
  const fundsQ = useQuery({ queryKey: ['portal-me-fund-types', 'donation'], queryFn: () => portalMeApi.fundTypes('donation') });

  const submit = useMutation({
    mutationFn: (payload: CreatePatronagePayload) => portalMeApi.fundEnrollmentCreate(payload),
    onSuccess: () => {
      message.success('Enrollment request submitted. An administrator will approve it shortly.');
      qc.invalidateQueries({ queryKey: ['portal-me-patronages'] });
      qc.invalidateQueries({ queryKey: ['portal-me-dashboard'] });
      navigate('/portal/me/fund-enrollments');
    },
    onError: (err: Error) => message.error(err.message || 'Submit failed.'),
  });

  const initial = useMemo<Partial<PatronageFormShape>>(() => ({
    recurrence: 2, startDate: dayjs(),
  }), []);

  function onFinish(v: PatronageFormShape) {
    submit.mutate({
      fundTypeId: v.fundTypeId,
      subType: v.subType?.trim() || null,
      recurrence: v.recurrence,
      startDate: v.startDate.format('YYYY-MM-DD'),
      endDate: v.endDate ? v.endDate.format('YYYY-MM-DD') : null,
      notes: v.notes ?? null,
    });
  }

  return (
    <div>
      <DetailHeader icon={<GiftOutlined />} title="Request enrollment" backTo="/portal/me/fund-enrollments" />
      <Alert type="info" showIcon className="jm-portal-dashboard-alert"
        message="Subscribe to one of the recurring donation funds (Sabil, Mutafariq, Niyaz, etc.)."
        description="Your enrollment lands as a request. Once approved, every receipt issued to you against this fund will be tracked here." />
      <Card className="jm-card">
        <Form<PatronageFormShape> form={form} layout="vertical" initialValues={initial} onFinish={onFinish}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Fund" name="fundTypeId" rules={[{ required: true, message: 'Choose a fund.' }]}>
                <Select loading={fundsQ.isLoading}
                  placeholder="Select fund"
                  options={(fundsQ.data ?? []).map((f) => ({ value: f.id, label: `${f.code} — ${f.name}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Sub-type (optional)" name="subType">
                <Input placeholder="e.g. Individual / Establishment" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Recurrence" name="recurrence" rules={[{ required: true }]}>
                <Select options={[
                  { value: 1, label: 'One-time' },
                  { value: 2, label: 'Monthly' },
                  { value: 3, label: 'Quarterly' },
                  { value: 4, label: 'Half-yearly' },
                  { value: 5, label: 'Yearly' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Start date" name="startDate" rules={[{ required: true }]}>
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="End date (optional)" name="endDate">
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Notes" name="notes">
                <Input.TextArea rows={2} placeholder="Anything the administrator should know about this enrollment." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={submit.isPending}>Submit request</Button>
              <Button onClick={() => navigate('/portal/me/fund-enrollments')}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
