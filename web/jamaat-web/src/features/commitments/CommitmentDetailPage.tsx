import { useMemo, useState, type ReactNode } from 'react';
import {
  Card, Space, Button, Table, Tag, Descriptions, Progress, Modal, Input, App as AntdApp, Result, Spin,
} from 'antd';
import type { TableProps } from 'antd';
import {
  ArrowLeftOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined,
  FileDoneOutlined, FileTextOutlined, ReloadOutlined, DollarCircleOutlined, EyeOutlined,
} from '@ant-design/icons';
import { CommitmentPaymentsPanel } from './CommitmentPaymentsPanel';
import { postDatedChequesApi, PdcStatusLabel } from './postDatedChequesApi';
import { describeUserAgent } from '../../shared/format/userAgent';
import { AgreementMarkdown } from '../../shared/ui/AgreementMarkdown';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime, money } from '../../shared/format/format';
import {
  commitmentsApi,
  FrequencyLabel, PartyTypeLabel, StatusColor, StatusLabel,
  InstallmentStatusColor, InstallmentStatusLabel,
  AgreementAcceptanceMethodLabel,
  type Installment,
} from './commitmentsApi';
import { extractProblem } from '../../shared/api/client';
import { PostDatedChequesPanel } from './PostDatedChequesPanel';

export function CommitmentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['commitment', id],
    queryFn: () => commitmentsApi.get(id),
    enabled: !!id,
  });

  // Pre-cancel readiness: cancellation requires every instalment to be Paid or Waived AND no
  // cheque sitting in Pledged/Deposited (those are still in the bank pipeline / contributor's
  // drawer). We render the unmet conditions as a checklist so the admin knows what to clear.
  const pdcQ = useQuery({
    queryKey: ['pdcs', id],
    queryFn: () => postDatedChequesApi.listByCommitment(id),
    enabled: !!id,
  });

  const [waiving, setWaiving] = useState<Installment | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [agreementOpen, setAgreementOpen] = useState(false);
  // Drill-down filter for the Payments panel: when set, only payments tied to this instalment
  // are shown. Set by clicking the "View" button on a schedule row; cleared by the panel itself.
  const [paymentsFilterInstNo, setPaymentsFilterInstNo] = useState<number | null>(null);

  const invalidate = () => { void refetch(); void qc.invalidateQueries({ queryKey: ['commitments'] }); };

  const pauseMut = useMutation({ mutationFn: () => commitmentsApi.pause(id), onSuccess: () => { message.success('Paused.'); invalidate(); }, onError: onErr });
  const resumeMut = useMutation({ mutationFn: () => commitmentsApi.resume(id), onSuccess: () => { message.success('Resumed.'); invalidate(); }, onError: onErr });
  const refreshMut = useMutation({ mutationFn: () => commitmentsApi.refreshOverdue(id), onSuccess: () => { message.success('Overdue statuses refreshed.'); invalidate(); }, onError: onErr });
  const cancelMut = useMutation({
    mutationFn: () => commitmentsApi.cancel(id, cancelReason),
    onSuccess: () => { message.success('Cancelled.'); setCancelling(false); setCancelReason(''); invalidate(); },
    onError: onErr,
  });
  const waiveMut = useMutation({
    mutationFn: () => commitmentsApi.waive(id, waiving!.id, waiveReason),
    onSuccess: () => { message.success('Installment waived.'); setWaiving(null); setWaiveReason(''); invalidate(); },
    onError: onErr,
  });

  function onErr(err: unknown) { const p = extractProblem(err); message.error(p.detail ?? 'Action failed'); }

  // Mirror the backend cancel guards (CommitmentService.CancelAsync) so the UI can disable the
  // Cancel button and tell the admin exactly which obligations still need to be resolved before
  // they can attempt to cancel. Both checks must come back empty for cancellation to proceed.
  // Computed before the loading early-return to keep hook order stable across renders.
  const cancelBlockers = useMemo(() => {
    const openInst = (data?.installments ?? []).filter((i) => i.status !== 3 /* Paid */ && i.status !== 5 /* Waived */);
    const openCheques = (pdcQ.data ?? []).filter((p) => p.status === 1 /* Pledged */ || p.status === 2 /* Deposited */);
    return { openInst, openCheques };
  }, [data?.installments, pdcQ.data]);
  const isCancelBlocked = cancelBlockers.openInst.length > 0 || cancelBlockers.openCheques.length > 0;

  if (isLoading || !data) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  const c = data.commitment;

  const columns: TableProps<Installment>['columns'] = [
    { title: '#', dataIndex: 'installmentNo', width: 70 },
    { title: 'Due date', dataIndex: 'dueDate', width: 140, render: (v: string) => formatDate(v) },
    { title: 'Scheduled', dataIndex: 'scheduledAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum">{money(v, c.currency)}</span> },
    { title: 'Paid', dataIndex: 'paidAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum" style={{ color: v > 0 ? '#0E5C40' : 'var(--jm-gray-400)' }}>{money(v, c.currency)}</span> },
    { title: 'Remaining', dataIndex: 'remainingAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum">{money(v, c.currency)}</span> },
    { title: 'Status', dataIndex: 'status', width: 140,
      render: (s: Installment['status']) => <Tag color={InstallmentStatusColor[s]} style={{ margin: 0 }}>{InstallmentStatusLabel[s]}</Tag> },
    { title: 'Last payment', dataIndex: 'lastPaymentDate', width: 140,
      render: (v: string | null | undefined) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
    {
      key: 'actions', width: 260, align: 'end',
      render: (_: unknown, row) => (
        <Space size={4}>
          {row.paidAmount > 0 && (
            <Button size="small" type="text" icon={<EyeOutlined />}
              onClick={() => setPaymentsFilterInstNo(row.installmentNo)}
              title="Show payments against this instalment">
              View
            </Button>
          )}
          {row.status !== 3 && row.status !== 5 && isActive && (
            <Button size="small" type="primary" icon={<DollarCircleOutlined />}
              onClick={() => goToCollectPayment(row.id)}>
              Pay
            </Button>
          )}
          {row.status !== 3 && row.status !== 5 && (
            <Button size="small" type="text" icon={<FileDoneOutlined />} onClick={() => setWaiving(row)}>Waive</Button>
          )}
        </Space>
      ),
    },
  ];

  /// Hop to the receipt form, pre-filled with this commitment + (optionally) a specific installment.
  /// Family-typed commitments don't carry a single memberId, so we send familyId instead and let the
  /// cashier pick which family member is paying.
  function goToCollectPayment(installmentId?: string) {
    const params = new URLSearchParams();
    params.set('commitmentId', c.id);
    params.set('fundTypeId', c.fundTypeId);
    params.set('currency', c.currency);
    if (c.memberId) params.set('memberId', c.memberId);
    if (c.familyId) params.set('familyId', c.familyId);
    if (installmentId) params.set('commitmentInstallmentId', installmentId);
    navigate(`/receipts/new?${params.toString()}`);
  }

  const isDraft = c.status === 1;
  const isActive = c.status === 2;
  const isPaused = c.status === 6;
  const isClosed = c.status === 3 || c.status === 4 || c.status === 5;

  return (
    <div>
      <PageHeader
        title={`Commitment · ${c.code}`}
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/commitments')}>Back</Button>
            <Button icon={<FileTextOutlined />} onClick={() => setAgreementOpen(true)} disabled={!data.agreementText}>View agreement</Button>
            <Button icon={<ReloadOutlined />} onClick={() => refreshMut.mutate()} loading={refreshMut.isPending}>Refresh overdue</Button>
            {isActive && (
              <Button type="primary" icon={<DollarCircleOutlined />} onClick={() => goToCollectPayment()}>
                Collect payment
              </Button>
            )}
            {/* All status transitions go through an explicit modal - never a native confirm.
                Each transition spells out the consequences so the operator knows what's about
                to happen (especially for Cancel which is a final state). */}
            {isActive && (
              <Button icon={<PauseCircleOutlined />} loading={pauseMut.isPending} onClick={() => modal.confirm({
                title: `Pause commitment "${c.code}"?`,
                content: (
                  <div style={{ marginBlockStart: 8 }}>
                    <p style={{ margin: 0 }}>While paused, this commitment <strong>cannot accept payments</strong> on its instalments.</p>
                    <ul style={{ marginBlockStart: 8, paddingInlineStart: 18, color: 'var(--jm-gray-600)', fontSize: 13 }}>
                      <li>The schedule and outstanding balance stay as-is.</li>
                      <li>You can resume it any time to reopen payments.</li>
                      <li>Any post-dated cheques on file are not affected - clear them only after you resume.</li>
                    </ul>
                  </div>
                ),
                okText: 'Pause commitment', cancelText: 'Keep active',
                onOk: () => pauseMut.mutateAsync(),
              })}>Pause</Button>
            )}
            {isPaused && (
              <Button icon={<PlayCircleOutlined />} loading={resumeMut.isPending} onClick={() => modal.confirm({
                title: `Resume commitment "${c.code}"?`,
                content: 'Reopens payments. The schedule and balance pick up exactly where they were paused.',
                okText: 'Resume', cancelText: 'Keep paused',
                onOk: () => resumeMut.mutateAsync(),
              })}>Resume</Button>
            )}
            {!isClosed && (
              <Button danger icon={<StopOutlined />} onClick={() => setCancelling(true)}>
                Cancel commitment
              </Button>
            )}
          </Space>
        }
      />

      {isDraft && (
        <Card size="small" style={{ marginBlockEnd: 16, borderColor: 'var(--jm-warning)' }}>
          <Space align="center">
            <strong>Draft.</strong>
            <span>This commitment is not yet active. Accept the agreement to activate and allow payments.</span>
            <Button type="primary" onClick={() => navigate(`/commitments/new`)}>Accept agreement</Button>
          </Space>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
          <Descriptions size="small" column={2} bordered
            items={[
              { key: 'code', label: 'Code', children: <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{c.code}</span> },
              { key: 'status', label: 'Status', children: <Tag color={StatusColor[c.status]} style={{ margin: 0 }}>{StatusLabel[c.status]}</Tag> },
              { key: 'party', label: 'Party', children: `${c.partyName} (${PartyTypeLabel[c.partyType]})` },
              { key: 'partyId', label: c.partyType === 1 ? 'ITS number' : 'Family code',
                children: <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{(c.partyType === 1 ? c.memberItsNumber : c.familyCode) ?? '-'}</span> },
              { key: 'fund', label: 'Fund', children: `${c.fundTypeName}` },
              { key: 'fundCode', label: 'Fund code', children: <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{c.fundTypeCode}</span> },
              { key: 'total', label: 'Total pledge', children: <span className="jm-tnum">{money(c.totalAmount, c.currency)}</span> },
              { key: 'instAmount', label: 'Per instalment',
                children: <span className="jm-tnum">{money(c.totalAmount / Math.max(1, c.numberOfInstallments), c.currency)}</span> },
              { key: 'freq', label: 'Frequency', children: FrequencyLabel[c.frequency] },
              { key: 'count', label: 'Instalments', children: <span className="jm-tnum">{c.numberOfInstallments}</span> },
              { key: 'start', label: 'Start', children: formatDate(c.startDate) },
              { key: 'end', label: 'End', children: c.endDate ? formatDate(c.endDate) : '-' },
              { key: 'partial', label: 'Partial payments', children: c.allowPartialPayments ? 'Allowed' : 'Not allowed' },
              { key: 'autoAdvance', label: 'Auto-advance',
                children: <span title="When ON, any amount paid over an instalment automatically counts towards the next one.">{c.allowAutoAdvance ? 'Allowed' : 'Not allowed'}</span> },
              { key: 'currency', label: 'Currency', children: c.currency },
              { key: 'created', label: 'Created', children: formatDateTime(c.createdAtUtc) },
              { key: 'notes', label: 'Notes', span: 2, children: c.notes ?? '-' },
              ...(c.hasAcceptedAgreement ? [{
                key: 'accept', label: 'Agreement accepted', span: 2,
                children: <span>{formatDateTime(c.agreementAcceptedAtUtc)} by {c.agreementAcceptedByName ?? 'system'}</span>,
              }] : []),
            ]}
          />
        </Card>

        <CommitmentProgressCard commitment={c} installments={data.installments} />
      </div>

      <Card
        title="Installment schedule"
        size="small"
        style={{ marginBlockStart: 16, border: '1px solid var(--jm-border)' }}
      >
        <Table<Installment> rowKey="id" size="small" pagination={false} columns={columns} dataSource={data.installments} />
      </Card>

      <div style={{ marginBlockStart: 16 }}>
        <CommitmentPaymentsPanel
          commitmentId={c.id}
          currency={c.currency}
          installmentNoFilter={paymentsFilterInstNo}
          onClearFilter={() => setPaymentsFilterInstNo(null)}
        />
      </div>

      {/* Batch-7 (post-dated cheques): manage cheques pledged against this commitment.
          Each cheque sits in the table without affecting installment balances until cleared. */}
      <div style={{ marginBlockStart: 16 }}>
        <PostDatedChequesPanel
          commitmentId={data.commitment.id}
          currency={c.currency}
          installments={data.installments.map((i) => ({
            id: i.id, installmentNo: i.installmentNo, dueDate: i.dueDate,
            scheduledAmount: i.scheduledAmount, paidAmount: i.paidAmount,
          }))}
        />
      </div>

      <Modal
        title="Waive installment"
        open={!!waiving}
        onCancel={() => setWaiving(null)}
        onOk={() => waiveMut.mutate()}
        confirmLoading={waiveMut.isPending}
        okText="Waive"
        okButtonProps={{ disabled: !waiveReason.trim(), danger: true }}
      >
        <Space direction="vertical" style={{ inlineSize: '100%' }}>
          {waiving && <div>
            Waiving installment <strong>#{waiving.installmentNo}</strong> - due {formatDate(waiving.dueDate)} · {money(waiving.scheduledAmount, c.currency)}
          </div>}
          <Input.TextArea
            rows={3}
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            placeholder="Reason (required)"
          />
        </Space>
      </Modal>

      {/* Cancel modal: when there are open instalments or cheques, the modal becomes a blocker
          checklist (no reason field, OK disabled) so the operator sees exactly what to clear
          before cancellation is allowed. Once everything is settled, it switches to the regular
          reason-entry form. Backend (CancelAsync) enforces the same rules independently. */}
      <Modal
        title={isCancelBlocked ? "This commitment can't be cancelled yet" : 'Cancel commitment'}
        open={cancelling}
        onCancel={() => setCancelling(false)}
        onOk={() => cancelMut.mutate()}
        confirmLoading={cancelMut.isPending}
        okText="Cancel commitment"
        okButtonProps={{ disabled: isCancelBlocked || !cancelReason.trim(), danger: true }}
        cancelText={isCancelBlocked ? 'Close' : 'Cancel'}
      >
        {isCancelBlocked ? (
          <div>
            <div style={{ marginBlockEnd: 8 }}>Resolve the following before cancelling:</div>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {cancelBlockers.openInst.length > 0 && (
                <li style={{ marginBlockEnd: 6 }}>
                  <strong>{cancelBlockers.openInst.length}</strong> open instalment(s):{' '}
                  {cancelBlockers.openInst.map((i) => `#${i.installmentNo}`).join(', ')}
                  <span style={{ color: 'var(--jm-gray-600)' }}> - collect or waive each one.</span>
                </li>
              )}
              {cancelBlockers.openCheques.length > 0 && (
                <li>
                  <strong>{cancelBlockers.openCheques.length}</strong> open cheque(s):{' '}
                  {cancelBlockers.openCheques.map((p) => `${p.chequeNumber} (${PdcStatusLabel[p.status]})`).join(', ')}
                  <span style={{ color: 'var(--jm-gray-600)' }}> - clear, mark bounced, or cancel (returning to contributor) each one.</span>
                </li>
              )}
            </ul>
          </div>
        ) : (
          <Input.TextArea
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (required)"
          />
        )}
      </Modal>

      <Modal
        title={`Agreement · v${data.agreementTemplateVersion ?? '-'}`}
        open={agreementOpen}
        onCancel={() => setAgreementOpen(false)}
        footer={<Button onClick={() => setAgreementOpen(false)}>Close</Button>}
        width={720}
      >
        {data.agreementText
          ? (
            <>
              <AgreementMarkdown source={data.agreementText} />
              {data.agreementAcceptanceProof && (
                <div style={{
                  marginBlockStart: 16, paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)',
                  fontSize: 12, color: 'var(--jm-gray-700)',
                }}>
                  {/* Acceptance proof: who/when/from where. Lets a future audit verify the
                      acceptance event without leaving the commitment. IP + UA come from the
                      request headers at AcceptAsync time. */}
                  <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--jm-gray-500)', marginBlockEnd: 8 }}>
                    Acceptance proof
                  </div>
                  <Descriptions size="small" column={1} colon
                    items={[
                      { key: 'who', label: 'Accepted by', children: data.agreementAcceptanceProof.acceptedByName ?? 'system' },
                      { key: 'when', label: 'At', children: formatDateTime(data.agreementAcceptanceProof.acceptedAtUtc) },
                      ...(data.agreementAcceptanceProof.method ? [{
                        key: 'how', label: 'Method',
                        children: AgreementAcceptanceMethodLabel[data.agreementAcceptanceProof.method],
                      }] : []),
                      ...(data.agreementAcceptanceProof.ipAddress ? [{
                        key: 'ip', label: 'IP address',
                        children: <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{data.agreementAcceptanceProof.ipAddress}</span>,
                      }] : []),
                      ...(data.agreementAcceptanceProof.userAgent ? [{
                        key: 'device', label: 'Device',
                        children: <span title={data.agreementAcceptanceProof.userAgent ?? undefined}>{describeUserAgent(data.agreementAcceptanceProof.userAgent)}</span>,
                      }] : []),
                    ]}
                  />
                </div>
              )}
            </>
          )
          : <Result status="info" title="No agreement accepted yet." />
        }
      </Modal>
    </div>
  );
}

/// Visual summary on the right side of the commitment detail page. Combines:
///   1. A health pill (On track / Behind / Ahead / Completed / etc.) computed from
///      "instalments paid by today" vs "instalments due by today" + overdue count.
///   2. A circular Progress dashboard showing % paid, themed green to read as money.
///   3. The raw Paid / Remaining figures.
///   4. A horizontal "instalment ribbon" - one cell per instalment colored by status -
///      so the operator can scan at a glance whether the contributor is in a clean
///      streak or has gaps/overdues.
function CommitmentProgressCard({
  commitment, installments,
}: {
  commitment: { currency: string; paidAmount: number; remainingAmount: number; progressPercent: number; status: number; startDate: string; endDate?: string | null };
  installments: Installment[];
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const dueByToday = installments.filter((i) => i.dueDate <= todayIso).length;
  const settledByToday = installments.filter((i) => i.dueDate <= todayIso && (i.status === 3 || i.status === 5)).length;
  const overdueCount = installments.filter((i) => i.status === 4).length;
  const allSettled = installments.length > 0 && installments.every((i) => i.status === 3 || i.status === 5);

  // Health pill: completed > overdue > behind > on-track > ahead. Colors echo the AntD
  // semantic palette so the meaning is consistent with the rest of the app.
  const health = (() => {
    if (commitment.status === 4 /* Cancelled */) return { label: 'Cancelled', color: '#9CA3AF', bg: '#F3F4F6' };
    if (allSettled) return { label: 'Completed', color: '#0E5C40', bg: '#DCFCE7' };
    if (overdueCount > 0) return { label: `${overdueCount} overdue`, color: '#B91C1C', bg: '#FEE2E2' };
    const deficit = dueByToday - settledByToday;
    if (deficit > 0) return { label: `Behind by ${deficit}`, color: '#B45309', bg: '#FEF3C7' };
    const ahead = settledByToday - dueByToday;
    if (ahead > 0) return { label: `Ahead by ${ahead}`, color: '#0E5C40', bg: '#DCFCE7' };
    return { label: 'On track', color: '#0E5C40', bg: '#DCFCE7' };
  })();

  const isCompleted = commitment.status === 3;
  const isFailed = commitment.status === 4 || commitment.status === 5;

  return (
    <Card size="small" style={{ border: '1px solid var(--jm-border)' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', blockSize: '100%', gap: 18, padding: 20 } }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
        color: health.color, background: health.bg, padding: '4px 12px', borderRadius: 999,
      }}
        title="Computed by comparing instalments paid/waived vs instalments due by today's date.">
        {health.label}
      </div>

      <Progress
        type="dashboard"
        size={160}
        percent={Math.min(100, Number(commitment.progressPercent.toFixed(1)))}
        strokeColor={isFailed ? '#DC2626' : { '0%': '#10B981', '100%': '#0E5C40' }}
        strokeWidth={10}
        status={isCompleted ? 'success' : isFailed ? 'exception' : 'active'}
        format={(percent) => (
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--jm-gray-900, #1F2937)', lineHeight: 1 }}>{percent}%</div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>paid</div>
          </div>
        )}
      />

      <div style={{ inlineSize: '100%', maxInlineSize: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ProgressRow label="Paid" value={money(commitment.paidAmount, commitment.currency)} accent="#0E5C40" />
        <ProgressRow label="Remaining" value={money(commitment.remainingAmount, commitment.currency)} />
        <ProgressRow label="Instalments" value={`${settledByToday} settled · ${dueByToday - settledByToday} open · ${installments.length - dueByToday} upcoming`} muted />
      </div>

      {/* Instalment ribbon: one slim cell per instalment, colored by status. Lets the
          operator scan the whole schedule at a glance - a clean green strip means a
          healthy contributor, gaps/red cells flag a problem. */}
      {installments.length > 0 && (
        <div style={{ inlineSize: '100%', maxInlineSize: 260 }}>
          <div style={{ fontSize: 10, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6, textAlign: 'center' }}>
            Schedule (oldest to newest)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${installments.length}, 1fr)`, gap: 2 }}>
            {installments.map((i) => (
              <div key={i.id}
                title={`#${i.installmentNo} · due ${i.dueDate} · ${InstallmentStatusLabel[i.status]}`}
                style={{
                  blockSize: 14, borderRadius: 2,
                  background: ribbonColor(i.status),
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--jm-gray-500)', marginBlockStart: 6 }}>
            <span>{formatDate(commitment.startDate)}</span>
            <span>{commitment.endDate ? formatDate(commitment.endDate) : ''}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProgressRow({ label, value, accent, muted }: { label: string; value: ReactNode; accent?: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
      <span style={{ color: 'var(--jm-gray-500)' }}>{label}</span>
      <span className="jm-tnum"
        style={{ fontWeight: 600, color: accent ?? (muted ? 'var(--jm-gray-600)' : 'var(--jm-gray-900, #1F2937)'), fontSize: muted ? 12 : 14 }}>
        {value}
      </span>
    </div>
  );
}

/// Ribbon cell color per InstallmentStatus enum (Pending=1, PartiallyPaid=2, Paid=3, Overdue=4, Waived=5).
function ribbonColor(status: number): string {
  switch (status) {
    case 3: return '#10B981'; // paid - green
    case 2: return '#FBBF24'; // partial - amber
    case 4: return '#EF4444'; // overdue - red
    case 5: return '#A78BFA'; // waived - purple
    default: return '#E5E7EB'; // pending - gray
  }
}
