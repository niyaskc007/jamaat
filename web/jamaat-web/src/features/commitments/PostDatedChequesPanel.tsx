import { useState } from 'react';
import { Card, Button, Table, Tag, Space, Typography, Modal, Form, Input, InputNumber, DatePicker, Select, App as AntdApp, Tabs, Alert, Tooltip } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, StopOutlined, BankOutlined, ThunderboltOutlined } from '@ant-design/icons';
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
        linked installment - the ledger only moves at that point.
      </Typography.Paragraph>

      <Table<PostDatedCheque>
        rowKey="id" size="middle" loading={list.isLoading}
        dataSource={list.data ?? []}
        pagination={false}
        columns={[
          { title: 'Cheque #', dataIndex: 'chequeNumber', width: 130, render: (v) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 500 }}>{v}</span> },
          { title: 'Cheque date', dataIndex: 'chequeDate', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Drawn on', dataIndex: 'drawnOnBank', render: (v: string) => v },
          { title: 'For instalment', key: 'inst', width: 130, render: (_, row) => row.installmentNo ? <span><span className="jm-tnum">#{row.installmentNo}</span>{row.installmentDueDate && <span style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginInlineStart: 6 }}>{formatDate(row.installmentDueDate)}</span>}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Amount', dataIndex: 'amount', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
          { title: 'Status', dataIndex: 'status', width: 130, render: (s: PostDatedChequeStatus, row) => (
            <Space direction="vertical" size={0}>
              <Tag color={PdcStatusColor[s]} style={{ margin: 0 }}>{PdcStatusLabel[s]}</Tag>
              {s === 3 && row.clearedOn && <span style={{ fontSize: 10, color: 'var(--jm-gray-500)' }}>cleared {formatDate(row.clearedOn)}{row.clearedReceiptNumber ? ` · ${row.clearedReceiptNumber}` : ''}</span>}
              {s === 4 && row.bounceReason && <span style={{ fontSize: 10, color: 'var(--jm-danger, #DC2626)' }} title={row.bounceReason}>{row.bounceReason.length > 24 ? row.bounceReason.slice(0, 24) + '…' : row.bounceReason}</span>}
            </Space>
          ) },
          { title: '', key: 'a', width: 220, render: (_, row) => {
            // Cheques can only be acted on at the bank from their printed date onwards.
            // Disable Deposit/Clear/Bounce until then so the cashier can't accidentally
            // change the status for a cheque that's still post-dated. Cancel stays
            // available because returning a still-post-dated cheque to the contributor
            // is a legit reason.
            const todayIso = dayjs().format('YYYY-MM-DD');
            const notYetDue = row.chequeDate > todayIso;
            const dueLabel = notYetDue ? `Cheque is dated ${formatDate(row.chequeDate)} - cannot be acted on until then.` : undefined;
            return (
              <Space size={4}>
                {/* Pledged → Deposited */}
                {row.status === 1 && canEdit && <DepositButton id={row.id} commitmentId={commitmentId} disabled={notYetDue} disabledReason={dueLabel} />}
                {/* Pledged or Deposited → Cleared */}
                {(row.status === 1 || row.status === 2) && canClear && (
                  <Tooltip title={dueLabel}>
                    <Button size="small" type="primary" icon={<CheckCircleOutlined />} disabled={notYetDue} onClick={() => setClearTarget(row)}>Clear</Button>
                  </Tooltip>
                )}
                {/* Pledged or Deposited → Bounced */}
                {(row.status === 1 || row.status === 2) && canEdit && <BounceButton id={row.id} commitmentId={commitmentId} disabled={notYetDue} disabledReason={dueLabel} />}
                {/* Pledged → Cancelled (admins can cancel before deposit, even if pre-dated) */}
                {row.status === 1 && canEdit && <CancelButton id={row.id} commitmentId={commitmentId} />}
              </Space>
            );
          } },
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
  // Two tabs: Single (one cheque) and Bulk (auto-fan one cheque per remaining instalment).
  // Bulk is the common case - contributors typically hand over the whole stack at agreement
  // time, so we drive it from the schedule and let the user only enter the starting cheque
  // number + bank.
  const [tab, setTab] = useState<'single' | 'bulk'>('single');
  // Width adapts to the active tab: Single is a vertical form (narrow is fine), Bulk needs
  // ~1000px of grid space so all columns including Amount fit without horizontal scrolling.
  const width = tab === 'bulk' ? 'min(1180px, calc(100vw - 32px))' : 680;
  return (
    <Modal title="Add post-dated cheques" open={open} onCancel={onClose} destroyOnHidden footer={null}
      width={width} style={{ top: 24 }} centered={false}>
      <Tabs activeKey={tab} onChange={(k) => setTab(k as 'single' | 'bulk')} items={[
        { key: 'single', label: <span><PlusOutlined /> Single cheque</span>, children: <SingleChequeForm commitmentId={commitmentId} currency={currency} installments={installments} onDone={onClose} /> },
        { key: 'bulk', label: <span><ThunderboltOutlined /> Bulk - one per instalment</span>, children: <BulkChequeForm commitmentId={commitmentId} currency={currency} installments={installments} onDone={onClose} /> },
      ]} />
    </Modal>
  );
}

function SingleChequeForm({ commitmentId, currency, installments, onDone }: {
  commitmentId: string; currency: string;
  installments: { id: string; installmentNo: number; dueDate: string; scheduledAmount: number; paidAmount: number }[];
  onDone: () => void;
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
      onDone();
      form.resetFields();
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  const openInstallments = installments.filter((i) => i.scheduledAmount > i.paidAmount);

  return (
    <Form form={form} layout="vertical" requiredMark={false}
      initialValues={{ chequeDate: dayjs().add(7, 'day') }}
      onFinish={(v) => mut.mutate(v)}>
      <Form.Item name="commitmentInstallmentId" label="Apply to instalment" rules={[{ required: true }]}
        tooltip="The instalment this cheque covers. The instalment's PaidAmount stays at zero until the cheque clears.">
        <Select placeholder="Select instalment"
          options={openInstallments.map((i) => ({
            value: i.id,
            label: `#${i.installmentNo} - due ${formatDate(i.dueDate)} · remaining ${(i.scheduledAmount - i.paidAmount).toFixed(2)} ${currency}`,
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
      <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={mut.isPending}>Save cheque</Button>
      </Space>
    </Form>
  );
}

/// Bulk flow - author one cheque per remaining instalment in a single submit. The cashier
/// only enters the starting cheque number + bank + a date offset; the form pre-populates
/// the per-row cheque date as (instalment due − offset days) and the amount as the
/// instalment's remaining balance, both editable per row before submit.
function BulkChequeForm({ commitmentId, currency, installments, onDone }: {
  commitmentId: string; currency: string;
  installments: { id: string; installmentNo: number; dueDate: string; scheduledAmount: number; paidAmount: number }[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const openInstallments = installments.filter((i) => i.scheduledAmount > i.paidAmount);

  // Form rows - one per open instalment. Every column is editable per row. The "common" inputs
  // at the top are sync-fillers: changing them propagates the new value into every row that
  // hasn't been manually overridden, so the bulk case stays a one-click flow but the cashier
  // can still tweak any single cheque's number/bank/date/amount.
  const [startingNumber, setStartingNumber] = useState('');
  const [drawnOnBank, setDrawnOnBank] = useState('');
  const [daysBeforeDue, setDaysBeforeDue] = useState(7);
  const [rows, setRows] = useState(() => openInstallments.map((i) => ({
    installmentId: i.id,
    installmentNo: i.installmentNo,
    dueDate: i.dueDate,
    chequeNumber: '',
    chequeDate: dayjs(i.dueDate).subtract(7, 'day') as Dayjs,
    drawnOnBank: '',
    amount: i.scheduledAmount - i.paidAmount,
    selected: true,
    // Track manual overrides so common-field edits don't clobber per-row tweaks.
    chequeNumberOverridden: false,
    drawnOnBankOverridden: false,
  })));

  // Split a cheque number string into (prefix, startInt, padding) so we can auto-increment.
  // Supports `100123`, `EM-100123`, etc. Falls back to (prefix, 1, 0) if no numeric tail.
  function splitChequeNumber(input: string): { prefix: string; start: number; pad: number } {
    const m = input.match(/^(.*?)(\d+)$/);
    return m ? { prefix: m[1], start: Number(m[2]), pad: m[2].length } : { prefix: input, start: 1, pad: 0 };
  }

  // Sync the per-row cheque number from the common starting number, skipping rows the user
  // has manually edited. Called whenever startingNumber changes (or when adding new rows).
  function applyStartingNumber(value: string) {
    setStartingNumber(value);
    if (!value.trim()) {
      setRows((prev) => prev.map((r) => r.chequeNumberOverridden ? r : { ...r, chequeNumber: '' }));
      return;
    }
    const { prefix, start, pad } = splitChequeNumber(value);
    setRows((prev) => {
      let offset = 0;
      return prev.map((r) => {
        if (r.chequeNumberOverridden) return r;
        const num = (start + offset).toString().padStart(pad, '0');
        offset += 1;
        return { ...r, chequeNumber: `${prefix}${num}` };
      });
    });
  }

  function applyDrawnOnBank(value: string) {
    setDrawnOnBank(value);
    setRows((prev) => prev.map((r) => r.drawnOnBankOverridden ? r : { ...r, drawnOnBank: value }));
  }

  // Re-derive cheque dates when the days-before-due offset moves.
  function recomputeDates(days: number) {
    setDaysBeforeDue(days);
    setRows((prev) => prev.map((r) => ({ ...r, chequeDate: dayjs(r.dueDate).subtract(days, 'day') })));
  }

  const updateRow = (idx: number, patch: Partial<typeof rows[number]>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  // Live validation: which selected rows are missing required fields, and which cheque numbers
  // collide with another row in the grid. Used both for inline cell highlighting and to gate
  // the Save button - so the cashier sees errors immediately, not after they click Save.
  const selectedRows = rows.filter((r) => r.selected);
  const totalAmount = selectedRows.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  const duplicateNumbers = (() => {
    const counts = new Map<string, number>();
    for (const r of selectedRows) {
      const k = r.chequeNumber.trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  })();
  const rowIsInvalid = (r: typeof rows[number]) =>
    r.selected && (!r.chequeNumber.trim() || !r.drawnOnBank.trim() || !(r.amount > 0)
      || duplicateNumbers.has(r.chequeNumber.trim()));
  const invalidCount = rows.filter(rowIsInvalid).length;
  const canSubmit = selectedRows.length > 0 && invalidCount === 0;

  // Tells the user the cheque-number pattern they're about to commit to. We compute one preview
  // (first selected row) so the prefix/padding is visible without scrolling the grid.
  const numberPreview = (() => {
    const first = selectedRows[0];
    const last = selectedRows[selectedRows.length - 1];
    if (!first || !last || selectedRows.length < 2) return null;
    return `${first.chequeNumber || '(empty)'} → ${last.chequeNumber || '(empty)'}`;
  })();

  const submit = async () => {
    if (!canSubmit) return;
    let ok = 0; let failed = 0;
    for (const r of selectedRows) {
      try {
        await postDatedChequesApi.add({
          commitmentId,
          commitmentInstallmentId: r.installmentId,
          chequeNumber: r.chequeNumber.trim(),
          chequeDate: r.chequeDate.format('YYYY-MM-DD'),
          drawnOnBank: r.drawnOnBank.trim(),
          amount: r.amount,
          currency,
        });
        ok += 1;
      } catch (e) {
        failed += 1;
        const p = extractProblem(e);
        message.error(`Cheque ${r.chequeNumber} (instalment #${r.installmentNo}): ${p.detail ?? 'failed'}`);
      }
    }
    void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] });
    if (ok > 0) message.success(`${ok} cheque(s) recorded${failed ? ` · ${failed} failed` : ''}.`);
    if (failed === 0) onDone();
  };

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBlockEnd: 12 }}
        message="Bulk add: one cheque per remaining instalment."
        description="The three fields below pre-fill every row in the grid. Edit any cell directly to override one cheque (e.g. a different cheque book or bank). Manual edits stick - they won't be overwritten if you change the common starting values afterwards." />

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) minmax(220px, 1fr)',
        gap: 12, marginBlockEnd: 12, padding: 12, background: 'var(--jm-gray-50, #FAFAFA)',
        border: '1px solid var(--jm-border)', borderRadius: 6,
      }}>
        <Form.Item label="Starting cheque #" style={{ marginBlockEnd: 0 }}
          tooltip="Auto-fills each row by incrementing the trailing number. Per-row overrides are kept.">
          <Input value={startingNumber} onChange={(e) => applyStartingNumber(e.target.value)} placeholder="e.g., 100123" />
        </Form.Item>
        <Form.Item label="Drawn on bank" style={{ marginBlockEnd: 0 }}
          tooltip="Pre-fills the bank for every row. Per-row overrides are kept.">
          <Input value={drawnOnBank} onChange={(e) => applyDrawnOnBank(e.target.value)} placeholder="e.g., Emirates NBD" />
        </Form.Item>
        <Form.Item label="Cheque date offset" style={{ marginBlockEnd: 0 }}
          tooltip="Each cheque date = (instalment due date - this many days). 7 days is typical so the cheque clears before the due date.">
          <InputNumber min={0} max={60} value={daysBeforeDue} onChange={(v) => recomputeDates(Number(v ?? 0))} addonAfter="days before due" style={{ inlineSize: '100%' }} />
        </Form.Item>
      </div>

      <Table size="small" pagination={false}
        rowKey="installmentId"
        rowSelection={{
          selectedRowKeys: rows.filter((r) => r.selected).map((r) => r.installmentId),
          onChange: (keys) => setRows((prev) => prev.map((r) => ({ ...r, selected: keys.includes(r.installmentId) }))),
        }}
        dataSource={rows}
        columns={[
          { title: '#', dataIndex: 'installmentNo', width: 60, render: (v: number) => <span className="jm-tnum">#{v}</span> },
          { title: 'Due', dataIndex: 'dueDate', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Cheque #', dataIndex: 'chequeNumber', render: (v: string, row, idx) => {
            const trimmed = v.trim();
            const isDupe = trimmed.length > 0 && duplicateNumbers.has(trimmed);
            const isMissing = row.selected && !trimmed;
            return (
              <Input size="small" value={v} placeholder="from starting #"
                status={isDupe || isMissing ? 'error' : undefined}
                onChange={(e) => updateRow(idx, { chequeNumber: e.target.value, chequeNumberOverridden: e.target.value.trim().length > 0 })}
                style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                title={isDupe ? `Duplicate of another row` : isMissing ? 'Required' : undefined} />
            );
          } },
          { title: 'Cheque date', dataIndex: 'chequeDate', width: 160, render: (v: Dayjs, _row, idx) => (
            <DatePicker size="small" value={v} format="DD MMM YYYY" onChange={(d) => updateRow(idx, { chequeDate: d ?? v })} style={{ inlineSize: '100%' }} />
          ) },
          { title: 'Drawn on bank', dataIndex: 'drawnOnBank', render: (v: string, row, idx) => {
            const isMissing = row.selected && !v.trim();
            return (
              <Input size="small" value={v} placeholder="from common bank"
                status={isMissing ? 'error' : undefined}
                onChange={(e) => updateRow(idx, { drawnOnBank: e.target.value, drawnOnBankOverridden: e.target.value.trim().length > 0 })} />
            );
          } },
          { title: 'Amount', dataIndex: 'amount', width: 200, render: (v: number, row, idx) => (
            <InputNumber size="small" value={v} min={0.01} step={100} addonAfter={currency}
              status={row.selected && !(v > 0) ? 'error' : undefined}
              style={{ inlineSize: '100%' }}
              onChange={(n) => updateRow(idx, { amount: Number(n ?? 0) })} />
          ) },
        ]}
      />

      {/* Footer: live total + validation summary on the left, action buttons on the right.
          Disable Save until every selected row passes inline validation - the user can see
          which cells are red and fix them in place rather than chasing toast messages. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBlockStart: 16, paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--jm-gray-700)' }}>
          {selectedRows.length === 0 ? (
            <span style={{ color: 'var(--jm-gray-500)' }}>No instalments selected.</span>
          ) : (
            <Space size={16}>
              <span><strong className="jm-tnum">{selectedRows.length}</strong> cheque(s) selected</span>
              <span>Total: <strong className="jm-tnum">{money(totalAmount, currency)}</strong></span>
              {numberPreview && <span style={{ color: 'var(--jm-gray-500)' }}>Cheque #: <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{numberPreview}</span></span>}
              {invalidCount > 0 && (
                <Tag color="red" style={{ margin: 0 }}>
                  {invalidCount} row(s) need attention
                </Tag>
              )}
            </Space>
          )}
        </div>
        <Space>
          <Button onClick={onDone}>Cancel</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={submit} disabled={!canSubmit}>
            Save {selectedRows.length} cheque(s)
          </Button>
        </Space>
      </div>
    </div>
  );
}

function DepositButton({ id, commitmentId, disabled, disabledReason }: { id: string; commitmentId: string; disabled?: boolean; disabledReason?: string }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const mut = useMutation({
    mutationFn: (depositedOn: string) => postDatedChequesApi.deposit(id, depositedOn),
    onSuccess: () => { message.success('Marked deposited.'); void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });
  return (
    <Tooltip title={disabled ? disabledReason : undefined}>
      <Button size="small" disabled={disabled} onClick={() => modal.confirm({
        title: 'Mark cheque deposited?',
        content: 'Records that the cheque has been submitted to the bank. It still hasn\'t affected the ledger - clear it after the bank confirms funds.',
        okText: 'Yes, deposited',
        onOk: () => mut.mutateAsync(dayjs().format('YYYY-MM-DD')),
      })}>Deposit</Button>
    </Tooltip>
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
            <strong>#{cheque.installmentNo ?? '-'}</strong> and post the ledger.
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

function BounceButton({ id, commitmentId, disabled, disabledReason }: { id: string; commitmentId: string; disabled?: boolean; disabledReason?: string }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: (r: string) => postDatedChequesApi.bounce(id, { bouncedOn: dayjs().format('YYYY-MM-DD'), reason: r }),
    onSuccess: () => {
      message.success('Marked bounced.');
      void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] });
      setOpen(false);
      setReason('');
    },
    // Bumped duration so the cashier doesn't miss it - default 3s is too quick when their
    // attention is on the modal closing.
    onError: (e) => message.error({ content: extractProblem(e).detail ?? 'Failed.', duration: 6 }),
  });
  const onSubmit = () => {
    if (!reason.trim()) { message.error('Reason is required.'); return; }
    mut.mutate(reason);
  };
  return (
    <>
      <Tooltip title={disabled ? disabledReason : undefined}>
        <Button size="small" danger icon={<CloseCircleOutlined />} disabled={disabled} onClick={() => setOpen(true)}>Bounce</Button>
      </Tooltip>
      <Modal
        title="Mark cheque bounced?"
        open={open}
        onCancel={() => { if (!mut.isPending) { setOpen(false); setReason(''); } }}
        onOk={onSubmit}
        okText="Mark bounced"
        okButtonProps={{ danger: true }}
        confirmLoading={mut.isPending}
        destroyOnHidden
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Reason (visible in audit log):</Typography.Text>
        <Input.TextArea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}

function CancelButton({ id, commitmentId }: { id: string; commitmentId: string }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: (r: string) => postDatedChequesApi.cancel(id, { cancelledOn: dayjs().format('YYYY-MM-DD'), reason: r }),
    onSuccess: () => {
      message.success('Cancelled.');
      void qc.invalidateQueries({ queryKey: ['pdcs', commitmentId] });
      setOpen(false);
      setReason('');
    },
    onError: (e) => message.error({ content: extractProblem(e).detail ?? 'Failed.', duration: 6 }),
  });
  const onSubmit = () => {
    if (!reason.trim()) { message.error('Reason is required.'); return; }
    mut.mutate(reason);
  };
  return (
    <>
      <Button size="small" icon={<StopOutlined />} onClick={() => setOpen(true)}>Cancel</Button>
      <Modal
        title="Cancel cheque?"
        open={open}
        onCancel={() => { if (!mut.isPending) { setOpen(false); setReason(''); } }}
        onOk={onSubmit}
        okText="Cancel cheque"
        confirmLoading={mut.isPending}
        destroyOnHidden
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Reason:</Typography.Text>
        <Input.TextArea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}
