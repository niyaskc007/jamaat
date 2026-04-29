import { useMemo, useState } from 'react';
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
              { key: 'party', label: 'Party', children: `${c.partyName} (${PartyTypeLabel[c.partyType]})` },
              { key: 'fund', label: 'Fund', children: `${c.fundTypeName} · ${c.fundTypeCode}` },
              { key: 'total', label: 'Total pledge', children: <span className="jm-tnum">{money(c.totalAmount, c.currency)}</span> },
              { key: 'currency', label: 'Currency', children: c.currency },
              { key: 'freq', label: 'Frequency', children: FrequencyLabel[c.frequency] },
              { key: 'count', label: 'Installments', children: c.numberOfInstallments },
              { key: 'start', label: 'Start', children: formatDate(c.startDate) },
              { key: 'end', label: 'End', children: c.endDate ? formatDate(c.endDate) : '-' },
              { key: 'partial', label: 'Partial payments', children: c.allowPartialPayments ? 'Allowed' : 'Not allowed' },
              { key: 'status', label: 'Status', children: <Tag color={StatusColor[c.status]} style={{ margin: 0 }}>{StatusLabel[c.status]}</Tag> },
              { key: 'notes', label: 'Notes', span: 2, children: c.notes ?? '-' },
              ...(c.hasAcceptedAgreement ? [{
                key: 'accept', label: 'Agreement accepted', span: 2,
                children: <span>{formatDateTime(c.agreementAcceptedAtUtc)} by {c.agreementAcceptedByName ?? 'system'}</span>,
              }] : []),
            ]}
          />
        </Card>

        <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
          <div style={{ marginBlockEnd: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Progress</div>
            <Progress
              type="dashboard"
              percent={Math.min(100, Number(c.progressPercent.toFixed(1)))}
              status={c.status === 3 ? 'success' : c.status === 4 || c.status === 5 ? 'exception' : 'active'}
            />
          </div>
          <Descriptions size="small" column={1}
            items={[
              { key: 'paid', label: 'Paid', children: <span className="jm-tnum" style={{ color: '#0E5C40', fontWeight: 600 }}>{money(c.paidAmount, c.currency)}</span> },
              { key: 'rem', label: 'Remaining', children: <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(c.remainingAmount, c.currency)}</span> },
            ]}
          />
        </Card>
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
