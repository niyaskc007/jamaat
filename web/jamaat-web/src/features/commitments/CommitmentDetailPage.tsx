import { useState } from 'react';
import {
  Card, Space, Button, Table, Tag, Descriptions, Progress, Modal, Input, App as AntdApp, Result, Spin, Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  ArrowLeftOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined,
  FileDoneOutlined, FileTextOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime, money } from '../../shared/format/format';
import {
  commitmentsApi,
  FrequencyLabel, PartyTypeLabel, StatusColor, StatusLabel,
  InstallmentStatusColor, InstallmentStatusLabel,
  type Installment,
} from './commitmentsApi';
import { extractProblem } from '../../shared/api/client';
import { PostDatedChequesPanel } from './PostDatedChequesPanel';

const { Paragraph } = Typography;

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

  const [waiving, setWaiving] = useState<Installment | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [agreementOpen, setAgreementOpen] = useState(false);

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
      render: (v: string | null | undefined) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
    {
      key: 'actions', width: 100, align: 'end',
      render: (_: unknown, row) => row.status === 3 || row.status === 5
        ? null
        : <Button size="small" type="text" icon={<FileDoneOutlined />} onClick={() => setWaiving(row)}>Waive</Button>,
    },
  ];

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
            {/* All status transitions go through an explicit modal — never a native confirm.
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
                      <li>Any post-dated cheques on file are not affected — clear them only after you resume.</li>
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
            {!isClosed && <Button danger icon={<StopOutlined />} onClick={() => setCancelling(true)}>Cancel commitment</Button>}
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
              { key: 'end', label: 'End', children: c.endDate ? formatDate(c.endDate) : '—' },
              { key: 'partial', label: 'Partial payments', children: c.allowPartialPayments ? 'Allowed' : 'Not allowed' },
              { key: 'status', label: 'Status', children: <Tag color={StatusColor[c.status]} style={{ margin: 0 }}>{StatusLabel[c.status]}</Tag> },
              { key: 'notes', label: 'Notes', span: 2, children: c.notes ?? '—' },
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
            Waiving installment <strong>#{waiving.installmentNo}</strong> — due {formatDate(waiving.dueDate)} · {money(waiving.scheduledAmount, c.currency)}
          </div>}
          <Input.TextArea
            rows={3}
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            placeholder="Reason (required)"
          />
        </Space>
      </Modal>

      <Modal
        title="Cancel commitment"
        open={cancelling}
        onCancel={() => setCancelling(false)}
        onOk={() => cancelMut.mutate()}
        confirmLoading={cancelMut.isPending}
        okText="Cancel commitment"
        okButtonProps={{ disabled: !cancelReason.trim(), danger: true }}
      >
        <Input.TextArea
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Reason for cancellation (required)"
        />
      </Modal>

      <Modal
        title={`Agreement · v${data.agreementTemplateVersion ?? '—'}`}
        open={agreementOpen}
        onCancel={() => setAgreementOpen(false)}
        footer={<Button onClick={() => setAgreementOpen(false)}>Close</Button>}
        width={720}
      >
        {data.agreementText
          ? <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{data.agreementText}</Paragraph>
          : <Result status="info" title="No agreement accepted yet." />
        }
      </Modal>
    </div>
  );
}
