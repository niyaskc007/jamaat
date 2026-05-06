import { useMemo, useState } from 'react';
import {
  Card, Descriptions, Table, Tag, Typography, Empty, Alert, Button, Space, Skeleton,
  Form, Input, InputNumber, Select, DatePicker, Row, Col, message, Result, Progress,
  Modal, Divider, Tabs, Statistic,
} from 'antd';
import {
  GiftOutlined, HeartOutlined, BankOutlined, DownloadOutlined, ArrowLeftOutlined,
  TeamOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  FileTextOutlined, ProfileOutlined, GoldOutlined,
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
import { PageHeader } from '../../../shared/ui/PageHeader';
import { CommitmentProgressCard } from '../../../shared/ui/CommitmentProgressCard';
import { QhRepaymentChart } from '../../../shared/ui/QhRepaymentChart';
import { LabelWithHelp } from '../../../shared/ui/LabelWithHelp';
import { QhProcessDocCard } from '../../../shared/ui/QhProcessDocCard';
import { FormSection, FormStickyFooter } from '../../../shared/ui/FormSection';
import ReactMarkdown from 'react-markdown';

// --- Shared header --------------------------------------------------------
// Detail pages reuse the operator-portal <PageHeader> so the title typography, action-bar
// alignment and subtitle treatment match exactly. The only portal-specific addition is the
// "← Back" button rendered in the actions slot - the admin pages don't need it because they
// drill in via tabs / dashboard widgets, but a member arriving at a deep-link benefits from
// an explicit way back to the list.
function DetailHeader({ title, subtitle, backTo, actions }: {
  title: string; subtitle?: string; backTo: string; actions?: React.ReactNode;
}) {
  return (
    <PageHeader title={title} subtitle={subtitle}
      actions={
        <Space size={8}>
          <Link to={backTo}>
            <Button icon={<ArrowLeftOutlined />}>Back</Button>
          </Link>
          {actions}
        </Space>
      } />
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
      <DetailHeader title={`Receipt ${r.receiptNumber ?? '(pending)'}`}
        subtitle={`${dayjs(r.receiptDate).format('DD MMM YYYY')} · ${r.amountTotal.toLocaleString()} ${r.currency} · ${PAYMENT_MODE[r.paymentMode] ?? r.paymentMode}`}
        backTo="/portal/me/contributions"
        actions={
          <Button type="primary" icon={<DownloadOutlined />} loading={downloading} onClick={downloadPdf}>
            Download duplicate copy
          </Button>
        } />

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
      <DetailHeader title={`Commitment ${c.code}`}
        subtitle={`${c.fundTypeName} · ${c.totalAmount.toLocaleString()} ${c.currency} over ${c.numberOfInstallments} ${COMMIT_FREQUENCY[c.frequency] ?? ''} instalments`}
        backTo="/portal/me/commitments" />

      {/* Workflow stepper - one component shows the whole journey + the current stage.
          The Accept-agreement CTA below appears only when the member can act. Audit
          timestamps light up the completed-at line under each step. */}
      <WorkflowStepper title="Commitment workflow"
        {...commitmentWorkflow(c.status, c.hasAcceptedAgreement,
          { agreementAcceptedAtUtc: c.agreementAcceptedAtUtc, createdAtUtc: c.createdAtUtc })} />
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
          {/* Same dashboard donut + health pill + instalment ribbon admin uses on
              /commitments/:id - one source of truth in shared/ui/CommitmentProgressCard. */}
          <CommitmentProgressCard commitment={c} installments={d.installments} />
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
            key: 'cheques', label: 'Cheques',
            children: <CommitmentChequesTab commitmentId={id} />,
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

const PDC_STATUS: Record<number, { label: string; tone: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  1: { label: 'Pledged',   tone: 'warning' },
  2: { label: 'Deposited', tone: 'info'    },
  3: { label: 'Cleared',   tone: 'success' },
  4: { label: 'Bounced',   tone: 'danger'  },
  5: { label: 'Cancelled', tone: 'default' },
};

function CommitmentChequesTab({ commitmentId }: { commitmentId: string }) {
  const q = useQuery({
    queryKey: ['portal-me-commitment-cheques', commitmentId],
    queryFn: () => portalMeApi.commitmentCheques(commitmentId),
    enabled: !!commitmentId,
  });
  if (q.isLoading) return <Skeleton active />;
  const rows = q.data ?? [];
  return (
    <>
      <Alert type="info" showIcon className="jm-portal-dashboard-alert"
        message="Post-dated cheques you've handed over for this commitment."
        description="Pledged + Deposited cheques don't reduce your balance until they actually clear at the bank. Once cleared, a receipt is issued and the linked instalment moves to Paid." />
      <Table
        rowKey="id" dataSource={rows} pagination={{ pageSize: 25 }} size="small"
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<div className="jm-portal-list-empty">
            <div className="jm-portal-list-empty-title">No cheques on file</div>
            <div className="jm-portal-list-empty-sub">Post-dated cheques you hand over at the counter will appear here.</div>
          </div>} /> }}
        columns={[
          { title: 'Cheque #', dataIndex: 'chequeNumber', width: 140,
            render: (v: string) => <span className="jm-portal-mono-link">{v}</span> },
          { title: 'Cheque date', dataIndex: 'chequeDate', width: 130, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
          { title: 'Drawn on', dataIndex: 'drawnOnBank' },
          { title: 'For instalment', key: 'inst', width: 160,
            render: (_, r) => r.installmentNo
              ? <span><span className="jm-tnum">#{r.installmentNo}</span>{r.installmentDueDate && <span className="jm-portal-cell-meta"> {dayjs(r.installmentDueDate).format('DD MMM YYYY')}</span>}</span>
              : <span className="jm-muted">—</span> },
          { title: 'Amount', dataIndex: 'amount', align: 'end', width: 140,
            render: (v: number, r) => <span className="jm-tnum jm-num-strong">{v.toLocaleString()} {r.currency}</span> },
          { title: 'Status', dataIndex: 'status', width: 200,
            render: (s: number, r) => {
              const m = PDC_STATUS[s] ?? { label: String(s), tone: 'default' as const };
              return (
                <Space direction="vertical" size={0}>
                  <Tag className="jm-portal-status" data-tone={m.tone}>{m.label}</Tag>
                  {s === 3 && r.clearedOn && <span className="jm-portal-cell-meta">cleared {dayjs(r.clearedOn).format('DD MMM YYYY')}{r.clearedReceiptNumber ? ` · ${r.clearedReceiptNumber}` : ''}</span>}
                  {s === 4 && r.bounceReason && <span className="jm-portal-cell-meta jm-portal-cheque-bounce">{r.bounceReason}</span>}
                  {s === 2 && r.depositedOn && <span className="jm-portal-cell-meta">deposited {dayjs(r.depositedOn).format('DD MMM YYYY')}</span>}
                </Space>
              );
            } },
        ]}
      />
    </>
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
      <DetailHeader title={`Qarzan Hasana ${l.code}`}
        subtitle={`${QH_SCHEME_LABEL[l.scheme] ?? 'Loan'} · ${l.amountRequested.toLocaleString()} ${l.currency} requested${l.amountApproved > 0 ? ` · ${l.amountApproved.toLocaleString()} ${l.currency} approved` : ''}`}
        backTo="/portal/me/qarzan-hasana" />

      {/* Workflow stepper: one component shows the journey, the current stage, and a
          member-friendly note. Terminal states (rejected/cancelled/defaulted) replace the
          stepper with a status Alert. Audit timestamps surface under each milestone. */}
      <WorkflowStepper title="Loan workflow"
        {...qhWorkflow(l.status, l.rejectionReason,
          { level1ApprovedAtUtc: l.level1ApprovedAtUtc, level2ApprovedAtUtc: l.level2ApprovedAtUtc, disbursedOn: l.disbursedOn })} />

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
          {/* Same dashboard donut admin uses on /qarzan-hasana/:id - one Card per side. */}
          <Card size="small" title="Repayment progress" className="jm-card jm-qh-progress-card">
            <Progress type="dashboard"
              percent={Math.min(100, Number(l.progressPercent.toFixed(1)))}
              status={l.status === 7 ? 'success' : (l.status === 8 || l.status === 9 || l.status === 10) ? 'exception' : 'active'} />
            <div className="jm-qh-progress-stats">
              <div>
                <div className="jm-qh-progress-stat-label">Paid</div>
                <div className="jm-tnum jm-qh-progress-stat-paid">{l.amountRepaid.toLocaleString()} {l.currency}</div>
              </div>
              <div>
                <div className="jm-qh-progress-stat-label">Remaining</div>
                <div className="jm-tnum jm-qh-progress-stat-remaining">{l.amountOutstanding.toLocaleString()} {l.currency}</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Repayment trajectory: cumulative scheduled vs paid. Shared with admin. Hidden during
          approval phase because no schedule exists yet. */}
      {l.status >= 5 && d.installments.length > 0 && (
        <QhRepaymentChart installments={d.installments} currency={l.currency} />
      )}

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

const FE_STATUS: Record<number, { label: string; tone: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  1: { label: 'Draft',     tone: 'warning' },
  2: { label: 'Active',    tone: 'success' },
  3: { label: 'Paused',    tone: 'warning' },
  4: { label: 'Cancelled', tone: 'danger'  },
  5: { label: 'Expired',   tone: 'default' },
};

const FE_RECURRENCE: Record<number, string> = {
  1: 'One-time', 2: 'Monthly', 3: 'Quarterly', 4: 'Half-yearly', 5: 'Yearly', 99: 'Custom',
};

export function MemberPatronagesPage() {
  const q = useQuery({ queryKey: ['portal-me-patronages'], queryFn: portalMeApi.fundEnrollments });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (statusFilter !== undefined) r = r.filter((x) => x.status === statusFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter((x) => x.code.toLowerCase().includes(s) || x.fundTypeName.toLowerCase().includes(s));
    }
    return r;
  }, [q.data, search, statusFilter]);

  return (
    <div>
      <PageHeader title="Patronages"
        subtitle="Your fund enrolments — Sabil, Mutafariq, Niyaz, etc. Each row tracks how much has been collected against that fund."
        actions={
          <Link to="/portal/me/fund-enrollments/new">
            <Button type="primary" icon={<PlusOutlined />}>Request enrollment</Button>
          </Link>
        } />
      <Card className="jm-card jm-portal-list-card">
        <div className="jm-portal-toolbar">
          <Input prefix={<SearchOutlined />} allowClear placeholder="Search code or fund"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select allowClear placeholder="Status" value={statusFilter}
            onChange={(v) => setStatusFilter(v as number | undefined)}
            options={Object.entries(FE_STATUS).map(([v, m]) => ({ value: Number(v), label: m.label }))} />
          <span className="jm-portal-toolbar-spacer" />
          <Button icon={<ReloadOutlined />} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading} />
        </div>
        <Table<FundEnrollmentRow>
          rowKey="id" size="middle" loading={q.isLoading} dataSource={rows}
          pagination={{ pageSize: 20, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<div className="jm-portal-list-empty">
              <div className="jm-portal-list-empty-title">No patronages on record yet</div>
              <div className="jm-portal-list-empty-sub">Use Request enrolment to subscribe to a recurring fund.</div>
            </div>} /> }}
          onRow={(r) => ({ onClick: () => { window.location.href = `/portal/me/fund-enrollments/${r.id}`; } })}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 140,
              render: (v, r) => <Link to={`/portal/me/fund-enrollments/${r.id}`} className="jm-portal-mono-link">{v}</Link> },
            { title: 'Fund', dataIndex: 'fundTypeName' },
            { title: 'Sub-type', dataIndex: 'subType', render: (v: string | null) => v ?? '—' },
            { title: 'Recurrence', dataIndex: 'recurrence', width: 130, render: (v: number) => FE_RECURRENCE[v] ?? v },
            { title: 'Started', dataIndex: 'startDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Status', dataIndex: 'status', width: 140,
              render: (s: number) => {
                const m = FE_STATUS[s] ?? { label: String(s), tone: 'default' };
                return <Tag className="jm-portal-status" data-tone={m.tone}>{m.label}</Tag>;
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
  const statusMeta = FE_STATUS[e.status] ?? { label: String(e.status), tone: 'default' as const };

  return (
    <div>
      <DetailHeader title={`Patronage ${e.code}`}
        subtitle={`${e.fundTypeName}${e.subType ? ` · ${e.subType}` : ''} · ${FE_RECURRENCE[e.recurrence] ?? 'Recurring'}`}
        backTo="/portal/me/fund-enrollments" />
      <WorkflowStepper title="Patronage workflow" {...patronageWorkflow(e.status)} />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card className="jm-card" size="small">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered items={[
              { key: 'code',   label: 'Code',        children: <span className="jm-tnum">{e.code}</span> },
              { key: 'status', label: 'Status',      children: <Tag className="jm-portal-status" data-tone={statusMeta.tone}>{statusMeta.label}</Tag> },
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
              <div><Statistic title="Status" valueRender={() => <Tag className="jm-portal-status" data-tone={statusMeta.tone}>{statusMeta.label}</Tag>} value="" /></div>
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
  incomeSources?: string[];
  monthlyIncome?: number; monthlyExpenses?: number; monthlyExistingEmis?: number;
  goldAmount?: number; goldWeightGrams?: number; goldPurityKarat?: number; goldHeldAt?: string;
};

/// Same income-source codes the operator NewQarzanHasanaPage uses (kept in sync with
/// qarzanHasanaApi.IncomeSourceOptions). Duplicated here only because the operator file
/// pulls the operator-only qarzanHasanaApi which the portal can't reach (admin.masterdata
/// gate); the shape + values are identical.
const PORTAL_INCOME_SOURCES = [
  { value: 'SALARY',       label: 'Salary / Employment' },
  { value: 'BUSINESS',     label: 'Business / Self-employed' },
  { value: 'INVESTMENT',   label: 'Investment returns' },
  { value: 'SHARE_MARKET', label: 'Share market / Stocks' },
  { value: 'REAL_ESTATE',  label: 'Real estate' },
  { value: 'RENTAL',       label: 'Rental income' },
  { value: 'PENSION',      label: 'Pension / Retirement' },
  { value: 'FAMILY',       label: 'Family support' },
  { value: 'AGRICULTURE',  label: 'Agriculture' },
  { value: 'FREELANCE',    label: 'Freelance / Consulting' },
  { value: 'OTHER',        label: 'Other' },
];

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
  // Live-summary fields used by the sticky footer.
  const watchAmount   = Form.useWatch('amountRequested',     form);
  const watchCurrency = Form.useWatch('currency',            form);
  const watchInstal   = Form.useWatch('instalmentsRequested', form);

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
      goldWeightGrams: v.scheme === 1 ? v.goldWeightGrams ?? null : null,
      goldPurityKarat: v.scheme === 1 ? v.goldPurityKarat ?? null : null,
      goldHeldAt: v.scheme === 1 ? v.goldHeldAt ?? null : null,
      purpose: v.purpose,
      repaymentPlan: v.repaymentPlan,
      sourceOfIncome: v.sourceOfIncome ?? null,
      otherObligations: v.otherObligations ?? null,
      incomeSources: (v.incomeSources ?? []).join(',') || null,
      monthlyIncome: v.monthlyIncome ?? null,
      monthlyExpenses: v.monthlyExpenses ?? null,
      monthlyExistingEmis: v.monthlyExistingEmis ?? null,
      guarantorsAcknowledged: false,
    });
  }

  return (
    <div>
      <PageHeader title="New Qarzan Hasana request"
        subtitle="Interest-free loan request. Drafted here, then routed for two-level approval."
        actions={
          <Button onClick={() => navigate('/portal/me/qarzan-hasana')}>
            <ArrowLeftOutlined /> Back to loans
          </Button>
        } />

      {/* Educational panel - same shared component the operator new-loan form uses. */}
      <QhProcessDocCard />

      <Form<QhFormShape> form={form} layout="vertical" initialValues={initial} onFinish={onFinish} requiredMark={false}>
        <FormSection icon={<BankOutlined />} title="Loan terms"
          help="How much you need, in what currency, and how you'd like to repay it.">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Total amount you're requesting. The L1 approver may approve a different amount based on need + guarantor capacity.">Amount requested</LabelWithHelp>}
                name="amountRequested"
                rules={[{ required: true, message: 'Enter the amount you need.' }, { type: 'number', min: 1 }]}>
                <InputNumber<number> className="jm-full-width" min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Default is the jamaat's base currency.">Currency</LabelWithHelp>}
                name="currency" rules={[{ required: true }]}>
                <Select options={[{ value: 'INR', label: 'INR' }, { value: 'AED', label: 'AED' }, { value: 'USD', label: 'USD' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="How many monthly payments you'd like to spread the repayment over.">Instalments</LabelWithHelp>}
                name="instalmentsRequested"
                rules={[{ required: true }, { type: 'number', min: 1, max: 60 }]}>
                <InputNumber<number> className="jm-full-width" min={1} max={60} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Mohammadi: against gold collateral. Hussain: against guarantors only. Pick the closest match - the approver can adjust.">Scheme</LabelWithHelp>}
                name="scheme" rules={[{ required: true }]}>
                <Select options={[
                  { value: 1, label: 'Mohammadi (against gold)' },
                  { value: 2, label: 'Hussain (against kafil)' },
                  { value: 0, label: 'Other' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The first repayment will be due about a month after this date. Default: a week from today.">Start date</LabelWithHelp>}
                name="startDate" rules={[{ required: true }]}>
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
          </Row>

        </FormSection>

        <FormSection icon={<TeamOutlined />} title="Kafil (guarantors)"
          help="Two members must endorse your application. They'll be notified via the portal once you submit.">
          {sameGuarantor && (
            <Alert type="error" showIcon className="jm-portal-dashboard-alert"
              message="Guarantor 1 and Guarantor 2 cannot be the same person." />
          )}
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The first member you've asked to act as kafil. They must be in good standing and not the borrower.">Guarantor 1 (Kafil)</LabelWithHelp>}
                name="guarantor1MemberId"
                rules={[{ required: true, message: 'Pick a member.' }]}>
                <MemberSearchSelect placeholder="Search by name or ITS" excludeId={guarantor2 ?? null} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The second member you've asked to act as kafil. They must be different from Guarantor 1.">Guarantor 2 (Kafil)</LabelWithHelp>}
                name="guarantor2MemberId"
                rules={[{ required: true, message: 'Pick a member.' }]}>
                <MemberSearchSelect placeholder="Search by name or ITS" excludeId={guarantor1 ?? null} />
              </Form.Item>
            </Col>
          </Row>

        </FormSection>

        <FormSection icon={<FileTextOutlined />} title="Borrower's case"
          help="A clear purpose + a believable repayment plan moves the application through approval faster.">
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item label={<LabelWithHelp help="The clearer the purpose, the faster the approval.">Purpose of the loan</LabelWithHelp>}
                name="purpose" rules={[{ required: true, min: 5 }]}>
                <Input.TextArea rows={3} placeholder="e.g. Tuition fees for daughter's medical school for 2026 academic year." showCount maxLength={1000} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label={<LabelWithHelp help="Be concrete about how you'll pay each instalment - salary, business income, bonus etc.">Repayment plan</LabelWithHelp>}
                name="repaymentPlan" rules={[{ required: true, min: 5 }]}>
                <Input.TextArea rows={3} placeholder="e.g. Monthly salary deduction of 8,000 INR from confirmed employer ABC Corp, starting next month." showCount maxLength={1000} />
              </Form.Item>
            </Col>
          </Row>

        </FormSection>

        <FormSection icon={<ProfileOutlined />} title="Income & cashflow"
          help="Helps the approver understand your repayment capacity. Optional but speeds review.">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Tick every category that applies. Helps the approver understand your stability.">Income sources</LabelWithHelp>}
                name="incomeSources">
                <Select mode="multiple" placeholder="Select all that apply"
                  options={PORTAL_INCOME_SOURCES} className="jm-full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Optional - elaborate (employer name, business type, monthly net income).">Income details</LabelWithHelp>}
                name="sourceOfIncome">
                <Input.TextArea rows={2} placeholder="e.g. Salaried at ABC Co. since 2018, monthly net 12,000 INR." showCount maxLength={500} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Approximate take-home per month after tax.">Monthly income</LabelWithHelp>}
                name="monthlyIncome">
                <InputNumber<number> className="jm-full-width" min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Rent, utilities, groceries, school fees - the recurring outflows.">Monthly expenses</LabelWithHelp>}
                name="monthlyExpenses">
                <InputNumber<number> className="jm-full-width" min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Other ongoing loan instalments (banks, family, etc.) - so the approver can size the new loan correctly.">Existing EMIs</LabelWithHelp>}
                name="monthlyExistingEmis">
                <InputNumber<number> className="jm-full-width" min={0} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label={<LabelWithHelp help="Anything else the approver should know - large family obligations, upcoming expenses, irregular income.">Other obligations (optional)</LabelWithHelp>}
                name="otherObligations">
                <Input.TextArea rows={2} placeholder="Other loans, EMIs, family commitments…" showCount maxLength={500} />
              </Form.Item>
            </Col>
          </Row>

        </FormSection>

        {scheme === 1 && (
          <FormSection icon={<GoldOutlined />} title="Gold collateral (Mohammadi)"
            help="Mohammadi loans are secured against gold. Bring the gold + assessor's slip to the counter; the cashier will weigh + verify before disbursement.">
              <Row gutter={16}>
                <Col xs={24} md={6}>
                  <Form.Item label={<LabelWithHelp help="Estimated market value of the gold pledged.">Gold value</LabelWithHelp>}
                    name="goldAmount">
                    <InputNumber<number> className="jm-full-width" min={0} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label={<LabelWithHelp help="Total weight in grams - net of stones / non-gold parts.">Gold weight (g)</LabelWithHelp>}
                    name="goldWeightGrams">
                    <InputNumber<number> className="jm-full-width" min={0} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label={<LabelWithHelp help="22-karat is the most common; an assessor's slip will confirm.">Purity (karat)</LabelWithHelp>}
                    name="goldPurityKarat">
                    <InputNumber<number> className="jm-full-width" min={0} max={24} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label={<LabelWithHelp help="Where the gold will be held while the loan is outstanding (e.g. jamaat locker, bank vault).">Held at</LabelWithHelp>}
                    name="goldHeldAt">
                    <Input placeholder="Locker / safe" />
                  </Form.Item>
                </Col>
              </Row>
          </FormSection>
        )}

        <FormStickyFooter
          summary={<>Submitting <strong className="jm-tnum">{(watchAmount ?? 0).toLocaleString()} {watchCurrency ?? ''}</strong> over <strong>{watchInstal ?? 0}</strong> instalments</>}
          actions={
            <Space>
              <Button onClick={() => navigate('/portal/me/qarzan-hasana')}>Cancel</Button>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit"
                loading={submit.isPending} disabled={sameGuarantor}>Submit application</Button>
            </Space>
          } />
      </Form>
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

  // Live-summary watches for the sticky footer.
  const commitWatchTotal     = Form.useWatch('totalAmount',          form);
  const commitWatchCurrency  = Form.useWatch('currency',             form);
  const commitWatchInstal    = Form.useWatch('numberOfInstallments', form);
  const commitWatchFrequency = Form.useWatch('frequency',            form);

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
      <PageHeader title="New commitment"
        subtitle="Pledge to one of the funds. The commitment lands in Draft until you accept the agreement."
        actions={
          <Button onClick={() => navigate('/portal/me/commitments')}>
            <ArrowLeftOutlined /> Back to commitments
          </Button>
        } />
      <Form<CommitmentFormShape> form={form} layout="vertical" initialValues={initial} onFinish={onFinish} requiredMark={false}>
        <FormSection icon={<HeartOutlined />} title="Pledge details"
          help="Pick the fund, set the total, and choose how many instalments you want to spread the payments over.">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The fund your pledge will support. Each fund has a different purpose - tap the dropdown to see them all.">Fund</LabelWithHelp>}
                name="fundTypeId" rules={[{ required: true, message: 'Choose a fund.' }]}>
                <Select loading={fundsQ.isLoading}
                  placeholder="Select fund"
                  options={(fundsQ.data ?? []).map((f) => ({ value: f.id, label: `${f.code} — ${f.name}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label={<LabelWithHelp help="Currency of the pledge. Default is the jamaat's base currency.">Currency</LabelWithHelp>}
                name="currency" rules={[{ required: true }]}>
                <Select options={[{ value: 'INR', label: 'INR' }, { value: 'AED', label: 'AED' }, { value: 'USD', label: 'USD' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label={<LabelWithHelp help="The full amount you're pledging across all instalments.">Total amount</LabelWithHelp>}
                name="totalAmount"
                rules={[{ required: true, message: 'Enter a total.' }, { type: 'number', min: 1 }]}>
                <InputNumber<number> className="jm-full-width" min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="How often each instalment is due.">Frequency</LabelWithHelp>}
                name="frequency" rules={[{ required: true }]}>
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
              <Form.Item label={<LabelWithHelp help="Total instalments. Per-instalment = Total ÷ N. Up to 240.">Number of instalments</LabelWithHelp>}
                name="numberOfInstallments"
                rules={[{ required: true }, { type: 'number', min: 1, max: 240 }]}>
                <InputNumber<number> className="jm-full-width" min={1} max={240} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="The first instalment falls due on this date.">Start date</LabelWithHelp>}
                name="startDate" rules={[{ required: true }]}>
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label={<LabelWithHelp help="Optional - context the administrator should know (e.g. the niyat behind the pledge).">Notes</LabelWithHelp>}
                name="notes">
                <Input.TextArea rows={2} placeholder="Anything the administrator should know about this commitment." showCount maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormStickyFooter
          summary={<>Pledging <strong className="jm-tnum">{(commitWatchTotal ?? 0).toLocaleString()} {commitWatchCurrency ?? ''}</strong> over <strong>{commitWatchInstal ?? 0}</strong> {COMMIT_FREQUENCY_LABEL[commitWatchFrequency ?? 0] ?? ''} instalments</>}
          actions={
            <Space>
              <Button onClick={() => navigate('/portal/me/commitments')}>Cancel</Button>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={submit.isPending}>Submit commitment</Button>
            </Space>
          } />
      </Form>
    </div>
  );
}

const COMMIT_FREQUENCY_LABEL: Record<number, string> = {
  1: 'weekly', 2: 'monthly', 3: 'quarterly', 4: 'half-yearly', 5: 'yearly',
};

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

  const patWatchRec = Form.useWatch('recurrence', form);

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
      <PageHeader title="Request patronage enrolment"
        subtitle="Subscribe to one of the recurring donation funds (Sabil, Mutafariq, Niyaz, etc.). Your request lands as a draft until an administrator approves it."
        actions={
          <Button onClick={() => navigate('/portal/me/fund-enrollments')}>
            <ArrowLeftOutlined /> Back to patronages
          </Button>
        } />
      <Form<PatronageFormShape> form={form} layout="vertical" initialValues={initial} onFinish={onFinish} requiredMark={false}>
        <FormSection icon={<GiftOutlined />} title="Patronage details"
          help="Subscribe to a recurring donation fund. Once approved, every receipt issued to you against this fund accrues automatically.">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The fund you want to subscribe to (Sabil, Mutafariq, Niyaz, etc.).">Fund</LabelWithHelp>}
                name="fundTypeId" rules={[{ required: true, message: 'Choose a fund.' }]}>
                <Select loading={fundsQ.isLoading}
                  placeholder="Select fund"
                  options={(fundsQ.data ?? []).map((f) => ({ value: f.id, label: `${f.code} — ${f.name}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Optional sub-classification within the fund (e.g. Individual / Establishment for Sabil).">Sub-type</LabelWithHelp>}
                name="subType">
                <Input placeholder="e.g. Individual / Establishment" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="How often you intend to contribute against this enrolment.">Recurrence</LabelWithHelp>}
                name="recurrence" rules={[{ required: true }]}>
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
              <Form.Item label={<LabelWithHelp help="When the patronage goes into effect.">Start date</LabelWithHelp>}
                name="startDate" rules={[{ required: true }]}>
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Optional - leave blank for an open-ended subscription.">End date</LabelWithHelp>}
                name="endDate">
                <DatePicker className="jm-full-width" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label={<LabelWithHelp help="Optional - any context the administrator should know.">Notes</LabelWithHelp>}
                name="notes">
                <Input.TextArea rows={2} placeholder="Anything the administrator should know about this enrollment." showCount maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormStickyFooter
          summary={<>Subscribing to a <strong>{PATRONAGE_RECURRENCE_LABEL[patWatchRec ?? 0] ?? ''}</strong> fund</>}
          actions={
            <Space>
              <Button onClick={() => navigate('/portal/me/fund-enrollments')}>Cancel</Button>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={submit.isPending}>Submit request</Button>
            </Space>
          } />
      </Form>
    </div>
  );
}

const PATRONAGE_RECURRENCE_LABEL: Record<number, string> = {
  1: 'one-time', 2: 'monthly', 3: 'quarterly', 4: 'half-yearly', 5: 'yearly',
};
