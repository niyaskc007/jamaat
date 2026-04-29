import { useState } from 'react';
import { Card, Button, Table, Tag, Space, Typography, Modal, Form, Input, InputNumber, DatePicker, Select, App as AntdApp } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, StopOutlined, BankOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { extractProblem } from '../../shared/api/client';
import { formatDate, money } from '../../shared/format/format';
import { postDatedChequesApi, PdcStatusLabel, PdcStatusColor, type PostDatedCheque, type PostDatedChequeStatus } from './postDatedChequesApi';
import { bankAccountsApi } from '../admin/master-data/bank-accounts/bankAccountsApi';
import { useAuth } from '../../shared/auth/useAuth';

/// Dedicated panel for managing a commitment's post-dated cheques. The cheque sits in
/// state until the bank clears it; clearing fires the issue-receipt flow as a side-effect
/// so the commitment's installment gets paid down through the standard ledger path.
export function PostDatedChequesPanel({ commitmentId, currency, installments }: {
  commitmentId: string;
  currency: string;
  installments: { id: string; installmentNo: number; dueDate: string; scheduledAmount: number; paidAmount: number }[];
}) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('commitment.update');
  const canClear = hasPermission('receipt.create');
  const [addOpen, setAddOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<PostDatedCheque | null>(null);

  const list = useQuery({
    queryKey: ['pdcs', commitmentId],
    queryFn: () => postDatedChequesApi.listByCommitment(commitmentId),
  });

  return (
    <Card
      title={<Space><BankOutlined /> Post-dated cheques</Space>}
      extra={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add cheque</Button> : null}
      style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}
      styles={{ body: { padding: 0 } }}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, padding: '12px 16px', margin: 0, borderBlockEnd: '1px solid var(--jm-border)' }}>
        Track cheques received in advance. They sit in <strong>Pledged</strong> / <strong>Deposited</strong> state without
        affecting the installment balance. Marking a cheque <strong>Cleared</strong> issues a real receipt against the
        linked installment — the ledger only moves at that point.
      </Typography.Paragraph>

      <Table<PostDatedCheque>
        rowKey="id" size="middle" loading={list.isLoading}
        dataSource={list.data ?? []}
        pagination={false}
        columns={[
          { title: 'Cheque #', dataIndex: 'chequeNumber', width: 130, render: (v) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 500 }}>{v}</span> },
          { title: 'Cheque date', dataIndex: 'chequeDate', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Drawn on', dataIndex: 'drawnOnBank', render: (v: string) => v },
          { title: 'For instalment', key: 'inst', width: 130, render: (_, row) => row.installmentNo ? <span><span className="jm-tnum">#{row.installmentNo}</span>{row.installmentDueDate && <span style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginInlineStart: 6 }}>{formatDate(row.installmentDueDate)}</span>}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
          { title: 'Amount', dataIndex: 'amount', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
          { title: 'Status', dataIndex: 'status', width: 130, render: (s: PostDatedChequeStatus, row) => (
            <Space direction="vertical" size={0}>
              <Tag color={PdcStatusColor[s]} style={{ margin: 0 }}>{PdcStatusLabel[s]}</Tag>
              {s === 3 && row.clearedOn && <span style={{ fontSize: 10, color: 'var(--jm-gray-500)' }}>cleared {formatDate(row.clearedOn)}{row.clearedReceiptNumber ? ` · ${row.clearedReceiptNumber}` : ''}</span>}
              {s === 4 && row.bounceReason && <span style={{ fontSize: 10, color: 'var(--jm-danger, #DC2626)' }} title={row.bounceReason}>{row.bounceReason.length > 24 ? row.bounceReason.slice(0, 24) + '…' : row.bounceReason}</span>}
            </Space>
          ) },
          { title: '', key: 'a', width: 220, render: (_, row) => (
            <Space size={4}>
              {/* Pledged → Deposited */}
              {row.status === 1 && canEdit && <DepositButton id={row.id} commitmentId={commitmentId} />}
              {/* Pledged or Deposited → Cleared */}
              {(row.status === 1 || row.status === 2) && canClear && (
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => setClearTarget(row)}>Clear</Button>
              )}
              {/* Pledged or Deposited → Bounced */}
              {(row.status === 1 || row.status === 2) && canEdit && <BounceButton id={row.id} commitmentId={commitmentId} />}
              {/* Pledged → Cancelled (admins can cancel before deposit) */}
              {row.status === 1 && canEdit && <CancelButton id={row.id} commitmentId={commitmentId} />}
            </Space>
          ) },
        ]}
        locale={{ emptyText: <div style={{ padding: 24, textAlign: 'center', color: 'var(--jm-gray-500)' }}>No post-dated cheques on file</div> }}
      />

      <AddChequeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        commitmentId={commitmentId}
        currency={currency}
        installments={installments}
      />
      <ClearChequeModal
        cheque={clearTarget}
        onClose={() => setClearTarget(null)}
        onCleared={() => { void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] }); void qc.invalidateQueries({ queryKey: ['commitment', commitmentId] }); }}
      />
    </Card>
  );
}

function AddChequeModal({ open, onClose, commitmentId, currency, installments }: {
  open: boolean; onClose: () => void; commitmentId: string; currency: string;
  installments: { id: string; installmentNo: number; dueDate: string; scheduledAmount: number; paidAmount: number }[];
}) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (v: { commitmentInstallmentId?: string; chequeNumber: string; chequeDate: Dayjs; drawnOnBank: string; amount: number; notes?: string }) =>
      postDatedChequesApi.add({
        commitmentId,
        commitmentInstallmentId: v.commitmentInstallmentId,
        chequeNumber: v.chequeNumber,
        chequeDate: v.chequeDate.format('YYYY-MM-DD'),
        drawnOnBank: v.drawnOnBank,
        amount: v.amount,
        currency,
        notes: v.notes,
      }),
    onSuccess: () => {
      message.success('Cheque recorded.');
      void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] });
      onClose();
      form.resetFields();
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  // Show only instalments that still owe something so the cashier doesn't accidentally
  // attach a cheque to a fully-paid line.
  const openInstallments = installments.filter((i) => i.scheduledAmount > i.paidAmount);

  return (
    <Modal title="Add post-dated cheque" open={open} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} okText="Save cheque" confirmLoading={mut.isPending}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ chequeDate: dayjs().add(7, 'day') }}
        onFinish={(v) => mut.mutate(v)}>
        <Form.Item name="commitmentInstallmentId" label="Apply to instalment" rules={[{ required: true }]}
          tooltip="The instalment this cheque covers. The instalment's PaidAmount stays at zero until the cheque clears.">
          <Select placeholder="Select instalment"
            options={openInstallments.map((i) => ({
              value: i.id,
              label: `#${i.installmentNo} — due ${formatDate(i.dueDate)} · remaining ${(i.scheduledAmount - i.paidAmount).toFixed(2)} ${currency}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="chequeNumber" label="Cheque number" rules={[{ required: true, max: 64 }]}>
          <Input placeholder="e.g., 100123" />
        </Form.Item>
        <Form.Item name="chequeDate" label="Cheque date" rules={[{ required: true }]}
          tooltip="The date printed on the cheque. The cheque cannot be deposited before this date.">
          <DatePicker style={{ inlineSize: 220 }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item name="drawnOnBank" label="Drawn on bank" rules={[{ required: true, max: 200 }]}>
          <Input placeholder="e.g., Emirates NBD" />
        </Form.Item>
        <Form.Item name="amount" label="Amount" rules={[{ required: true, type: 'number', min: 0.01 }]}>
          <InputNumber style={{ inlineSize: 220 }} addonAfter={currency} step={100} />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function DepositButton({ id, commitmentId }: { id: string; commitmentId: string }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const mut = useMutation({
    mutationFn: (depositedOn: string) => postDatedChequesApi.deposit(id, depositedOn),
    onSuccess: () => { message.success('Marked deposited.'); void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });
  return (
    <Button size="small" onClick={() => modal.confirm({
      title: 'Mark cheque deposited?',
      content: 'Records that the cheque has been submitted to the bank. It still hasn\'t affected the ledger — clear it after the bank confirms funds.',
      okText: 'Yes, deposited',
      onOk: () => mut.mutateAsync(dayjs().format('YYYY-MM-DD')),
    })}>Deposit</Button>
  );
}

function ClearChequeModal({ cheque, onClose, onCleared }: { cheque: PostDatedCheque | null; onClose: () => void; onCleared: () => void }) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const banksQ = useQuery({ queryKey: ['bankAccounts', 'all'], queryFn: () => bankAccountsApi.list({ page: 1, pageSize: 100, active: true }) });

  const mut = useMutation({
    mutationFn: (v: { clearedOn: Dayjs; bankAccountId: string }) =>
      postDatedChequesApi.clear(cheque!.id, { clearedOn: v.clearedOn.format('YYYY-MM-DD'), bankAccountId: v.bankAccountId }),
    onSuccess: () => { message.success('Cheque cleared. Receipt issued.'); onCleared(); onClose(); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  return (
    <Modal title={cheque ? `Clear cheque ${cheque.chequeNumber}` : 'Clear cheque'}
      open={!!cheque} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} okText="Confirm clearance" confirmLoading={mut.isPending}>
      {cheque && (
        <>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            Confirms the bank has cleared the cheque. The system will issue a Receipt for{' '}
            <strong>{money(cheque.amount, cheque.currency)}</strong> against instalment{' '}
            <strong>#{cheque.installmentNo ?? '—'}</strong> and post the ledger.
          </Typography.Paragraph>
          <Form form={form} layout="vertical" requiredMark={false}
            initialValues={{ clearedOn: dayjs() }}
            onFinish={(v) => mut.mutate(v)}>
            <Form.Item name="clearedOn" label="Cleared on" rules={[{ required: true }]}>
              <DatePicker style={{ inlineSize: 220 }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="bankAccountId" label="Bank account funds landed in" rules={[{ required: true }]}
              tooltip="The bank account that received the cleared funds. The receipt's accounting will debit this account.">
              <Select placeholder="Select bank account"
                options={(banksQ.data?.items ?? []).map((b) => ({ value: b.id, label: `${b.name} · ${b.accountNumber}` }))} />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}

function BounceButton({ id, commitmentId }: { id: string; commitmentId: string }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const mut = useMutation({
    mutationFn: (reason: string) => postDatedChequesApi.bounce(id, { bouncedOn: dayjs().format('YYYY-MM-DD'), reason }),
    onSuccess: () => { message.success('Marked bounced.'); void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });
  return (
    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => {
      let reason = '';
      modal.confirm({
        title: 'Mark cheque bounced?',
        content: (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Reason (visible in audit log):</Typography.Text>
            <Input.TextArea rows={3} autoFocus onChange={(e) => { reason = e.target.value; }} />
          </div>
        ),
        okText: 'Mark bounced', okButtonProps: { danger: true },
        onOk: () => { if (!reason.trim()) throw new Error('Reason required'); return mut.mutateAsync(reason); },
      });
    }}>Bounce</Button>
  );
}

function CancelButton({ id, commitmentId }: { id: string; commitmentId: string }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const mut = useMutation({
    mutationFn: (reason: string) => postDatedChequesApi.cancel(id, { cancelledOn: dayjs().format('YYYY-MM-DD'), reason }),
    onSuccess: () => { message.success('Cancelled.'); void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });
  return (
    <Button size="small" icon={<StopOutlined />} onClick={() => {
      let reason = '';
      modal.confirm({
        title: 'Cancel cheque?',
        content: (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Reason:</Typography.Text>
            <Input.TextArea rows={3} autoFocus onChange={(e) => { reason = e.target.value; }} />
          </div>
        ),
        okText: 'Cancel cheque',
        onOk: () => { if (!reason.trim()) throw new Error('Reason required'); return mut.mutateAsync(reason); },
      });
    }}>Cancel</Button>
  );
}
