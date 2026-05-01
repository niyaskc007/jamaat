import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Descriptions, Tag, Table, Button, Space, Spin, Alert, App as AntdApp, Input, Modal, Form, InputNumber, DatePicker, Select } from 'antd';
import { PrinterOutlined, RollbackOutlined, StopOutlined, ArrowLeftOutlined, RedoOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money, formatDateTime } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { receiptsApi, PaymentModeLabel, ReceiptStatusLabel, type ReceiptStatus, type Receipt, type PaymentMode } from './receiptsApi';
import { useAuth } from '../../shared/auth/useAuth';
import { bankAccountsApi } from '../admin/master-data/bank-accounts/bankAccountsApi';

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { hasPermission } = useAuth();
  const canReprint = hasPermission('receipt.reprint');
  const canCancel = hasPermission('receipt.cancel');
  const canReverse = hasPermission('receipt.reverse');
  const canApprove = hasPermission('receipt.approve');
  const canReturn = hasPermission('receipt.return');
  const canReturnEarly = hasPermission('receipt.return.early');
  const [returnOpen, setReturnOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['receipt', id], queryFn: () => receiptsApi.get(id!),
    enabled: !!id,
  });

  const cancelMut = useMutation({
    mutationFn: (reason: string) => receiptsApi.cancel(id!, reason),
    onSuccess: () => {
      message.success('Receipt cancelled.');
      void qc.invalidateQueries({ queryKey: ['receipt', id] });
      void qc.invalidateQueries({ queryKey: ['receipts'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to cancel'),
  });
  const reverseMut = useMutation({
    mutationFn: (reason: string) => receiptsApi.reverse(id!, reason),
    onSuccess: () => {
      message.success('Receipt reversed.');
      void qc.invalidateQueries({ queryKey: ['receipt', id] });
      void qc.invalidateQueries({ queryKey: ['receipts'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to reverse'),
  });
  const approveMut = useMutation({
    mutationFn: () => receiptsApi.approve(id!),
    onSuccess: (r) => {
      message.success(`Approved. Receipt ${r.receiptNumber} now confirmed and posted to the GL.`);
      void qc.invalidateQueries({ queryKey: ['receipt', id] });
      void qc.invalidateQueries({ queryKey: ['receipts'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to approve'),
  });

  if (isLoading) return <div style={{ padding: 24 }}><Spin /></div>;
  if (isError || !data) return <Alert type="error" message="Receipt not found" style={{ margin: 24 }} />;

  const statusCfg: Record<ReceiptStatus, { bg: string; color: string }> = {
    1: { bg: '#FEF3C7', color: '#92400E' }, 2: { bg: '#D1FAE5', color: '#065F46' },
    3: { bg: '#E5E9EF', color: '#475569' }, 4: { bg: '#FEE2E2', color: '#991B1B' },
    // PendingClearance shares the amber palette with Draft (also a non-final state) - tells the
    // viewer "this is paused awaiting something external" without overlapping the green Confirmed
    // colour that means money is in the GL.
    5: { bg: '#FEF3C7', color: '#92400E' },
  };

  return (
    <div>
      <PageHeader
        title={`Receipt ${data.receiptNumber ?? 'Draft'}`}
        subtitle={`${dayjs(data.receiptDate).format('DD MMM YYYY')} · ${data.memberNameSnapshot}`}
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/receipts')}>Back</Button>
            {canReprint && (
              <Button icon={<PrinterOutlined />} onClick={() => void receiptsApi.openPdf(data.id, true)} disabled={!data.receiptNumber}>
                Reprint (duplicate)
              </Button>
            )}
          </Space>
        }
      />

      {/* Approval banner: Draft receipts (parked because at least one fund had RequiresApproval)
          surface a yellow card at the top with the Approve action front-and-centre. Cashiers
          who can't approve still see the banner so they know why the receipt has no number. */}
      {data.status === 1 && (
        <Card size="small" style={{ marginBlockEnd: 16, borderColor: '#FCD34D', background: '#FFFBEB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <ClockCircleOutlined style={{ color: '#B45309', fontSize: 18 }} />
            <div style={{ flex: 1, minInlineSize: 280 }}>
              <strong style={{ color: '#92400E' }}>Pending approval</strong>
              <div style={{ color: '#92400E', fontSize: 12, marginBlockStart: 2 }}>
                One or more funds on this receipt require approval. The receipt is in Draft - no number, no GL post,
                no commitment / QH allocation - until an approver signs off.
              </div>
            </div>
            {canApprove && (
              <Button type="primary" icon={<CheckCircleOutlined />}
                loading={approveMut.isPending} onClick={() => approveMut.mutate()}>
                Approve & post
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* PendingClearance banner: a future-dated cheque is in flight. The receipt has full
          line + payment data captured but no number, no GL post, no allocations - the linked
          PostDatedCheque drives the eventual confirm-or-cancel transition. */}
      {data.status === 5 && (
        <Card size="small" style={{ marginBlockEnd: 16, borderColor: '#FCD34D', background: '#FFFBEB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <ClockCircleOutlined style={{ color: '#B45309', fontSize: 18 }} />
            <div style={{ flex: 1, minInlineSize: 280 }}>
              <strong style={{ color: '#92400E' }}>Awaiting cheque clearance</strong>
              <div style={{ color: '#92400E', fontSize: 12, marginBlockStart: 2 }}>
                Cheque {data.chequeNumber ? <strong>{data.chequeNumber}</strong> : null}
                {data.drawnOnBank ? <> drawn on <strong>{data.drawnOnBank}</strong></> : null}
                {data.chequeDate ? <>, dated {dayjs(data.chequeDate).format('DD MMM YYYY')}</> : null}.
                The receipt is held in 'Pending clearance' - no number, no GL post, no commitment / QH
                allocation - until the cheque is marked Cleared from the Cheques workbench. If it bounces,
                the receipt is cancelled with no GL impact.
              </div>
            </div>
            <Button icon={<ClockCircleOutlined />} onClick={() => navigate('/cheques')}>
              Open Cheques workbench
            </Button>
          </div>
        </Card>
      )}

      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBlockEnd: 16 }}>
          <Tag style={{ margin: 0, background: statusCfg[data.status].bg, color: statusCfg[data.status].color, border: 'none', fontWeight: 500 }}>
            {ReceiptStatusLabel[data.status]}
          </Tag>
          <span style={{ color: 'var(--jm-gray-500)', fontSize: 13 }}>
            Created {formatDateTime(data.createdAtUtc)}
            {data.confirmedAtUtc ? ` · Confirmed ${formatDateTime(data.confirmedAtUtc)}${data.confirmedByUserName ? ` by ${data.confirmedByUserName}` : ''}` : ''}
          </span>
        </div>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Receipt #"><span className="jm-tnum" style={{ fontWeight: 600 }}>{data.receiptNumber ?? '-'}</span></Descriptions.Item>
          <Descriptions.Item label="Date">{dayjs(data.receiptDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Currency">
            {data.currency}
            {data.currency !== data.baseCurrency && (
              <span style={{ color: 'var(--jm-gray-500)', fontSize: 12, marginInlineStart: 8 }}>
                · {money(data.baseAmountTotal, data.baseCurrency)} @ {data.fxRate.toFixed(6)} {data.baseCurrency}/{data.currency}
              </span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="ITS"><span className="jm-tnum">{data.itsNumberSnapshot}</span></Descriptions.Item>
          <Descriptions.Item label="Member" span={2}>{data.memberNameSnapshot}</Descriptions.Item>
          <Descriptions.Item label="Payment mode">{PaymentModeLabel[data.paymentMode]}</Descriptions.Item>
          {data.chequeNumber && <Descriptions.Item label="Cheque">{data.chequeNumber} · {data.chequeDate ? dayjs(data.chequeDate).format('DD MMM YYYY') : ''}</Descriptions.Item>}
          {data.bankAccountName && <Descriptions.Item label="Bank">{data.bankAccountName}</Descriptions.Item>}
          {data.paymentReference && <Descriptions.Item label="Reference">{data.paymentReference}</Descriptions.Item>}
          {data.remarks && <Descriptions.Item label="Remarks" span={3}>{data.remarks}</Descriptions.Item>}
          {/* Returnable-contribution tracking - only visible when relevant. */}
          {data.intention === 2 && (
            <>
              <Descriptions.Item label="Intention">
                <Tag color="gold" style={{ margin: 0 }}>Returnable</Tag>
                {data.amountReturned > 0 && (
                  <span style={{ marginInlineStart: 8, color: 'var(--jm-gray-600)', fontSize: 12 }}>
                    {money(data.amountReturned, data.currency)} of {money(data.amountTotal, data.currency)} returned
                  </span>
                )}
              </Descriptions.Item>
              {data.maturityDate && <Descriptions.Item label="Maturity">{dayjs(data.maturityDate).format('DD MMM YYYY')}</Descriptions.Item>}
              {data.agreementReference && <Descriptions.Item label="Agreement"><span className="jm-tnum">{data.agreementReference}</span></Descriptions.Item>}
              <Descriptions.Item label="Agreement document" span={3}>
                <AgreementDocumentControl receipt={data} />
              </Descriptions.Item>
            </>
          )}
          {data.niyyathNote && <Descriptions.Item label="Niyyath" span={3}>{data.niyyathNote}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card title="Lines" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" size="middle" pagination={false}
          dataSource={data.lines}
          columns={[
            { title: '#', dataIndex: 'lineNo', key: 'lineNo', width: 60 },
            { title: 'Fund', dataIndex: 'fundTypeName', key: 'fund', render: (v, row: { fundTypeCode: string }) => (
              <div><div style={{ fontWeight: 500 }}>{v}</div>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{row.fundTypeCode}</div>
              </div>
            ) },
            { title: 'Purpose', dataIndex: 'purpose', key: 'purpose' },
            { title: 'Period ref', dataIndex: 'periodReference', key: 'period', width: 120 },
            {
              title: 'Applied to', key: 'appliedTo', width: 240,
              render: (_: unknown, row: import('./receiptsApi').ReceiptLine) => {
                if (row.commitmentId) {
                  return (
                    <span style={{ fontSize: 12 }}>
                      <Tag color="blue" style={{ margin: 0 }}>Commitment</Tag>{' '}
                      <Button type="link" size="small" style={{ padding: 0 }}
                        onClick={() => navigate(`/commitments/${row.commitmentId}`)}>
                        {row.commitmentCode}
                      </Button>
                      {row.installmentNo != null && <span style={{ color: 'var(--jm-gray-500)' }}> · inst #{row.installmentNo}</span>}
                    </span>
                  );
                }
                if (row.fundEnrollmentId) {
                  return (
                    <span style={{ fontSize: 12 }}>
                      <Tag color="cyan" style={{ margin: 0 }}>Patronage</Tag>{' '}
                      <Button type="link" size="small" style={{ padding: 0 }}
                        onClick={() => navigate(`/fund-enrollments`)}>
                        {row.fundEnrollmentCode}
                      </Button>
                    </span>
                  );
                }
                if (row.qarzanHasanaLoanId) {
                  return (
                    <span style={{ fontSize: 12 }}>
                      <Tag color="purple" style={{ margin: 0 }}>QH loan</Tag>{' '}
                      <Button type="link" size="small" style={{ padding: 0 }}
                        onClick={() => navigate(`/qarzan-hasana/${row.qarzanHasanaLoanId}`)}>
                        {row.qarzanHasanaLoanCode}
                      </Button>
                      {row.qarzanHasanaInstallmentNo != null && <span style={{ color: 'var(--jm-gray-500)' }}> · inst #{row.qarzanHasanaInstallmentNo}</span>}
                    </span>
                  );
                }
                return <span style={{ color: 'var(--jm-gray-400)', fontSize: 12 }}>One-off</span>;
              },
            },
            { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', width: 160,
              render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, data.currency)}</span> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5} align="right"><strong>Total</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <span className="jm-tnum" style={{ fontWeight: 700, fontSize: 16 }}>{money(data.amountTotal, data.currency)}</span>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      {/* Returnable-contribution panel - only visible for confirmed Returnable receipts.
          Shows the running balance, maturity status, and the "Process return" trigger.
          Returns are normal-business actions (not destructive), so this card uses
          neutral/positive styling instead of the danger-zone treatment below. */}
      {data.intention === 2 && data.status === 2 && canReturn && (
        <ReturnableContributionPanel
          receipt={data}
          onProcessReturn={() => setReturnOpen(true)}
          canReturnEarly={canReturnEarly}
        />
      )}

      {(canCancel || canReverse) && (
        // Destructive zone, sectioned off so "Cancel receipt" doesn't read as a generic
        // dismiss/back button. Both actions are voiding operations on a confirmed receipt
        // (Cancel = mark cancelled & roll back the ledger; Reverse = create reversal entries
        // that undo it but keep the audit trail intact). Both are danger-styled so the
        // user can't mistake them for navigation.
        <Card size="small" style={{ marginBlockStart: 16, borderColor: 'var(--jm-danger, #DC2626)', background: '#FEF2F2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#991B1B' }}>
              <strong>Danger zone</strong>{' '}
              <span style={{ color: '#7F1D1D' }}>- voiding actions on a confirmed receipt. Both reverse the ledger; Cancel marks it cancelled, Reverse creates an audit-trailed reversal.</span>
            </div>
            <Space>
              {canCancel && (
                <Button
                  danger
                  icon={<StopOutlined />}
                  disabled={data.status !== 2 || cancelMut.isPending}
                  loading={cancelMut.isPending}
                  onClick={() => promptReason(modal, 'Cancel receipt', 'Reason for cancellation', (r) => cancelMut.mutate(r))}
                >
                  Cancel receipt
                </Button>
              )}
              {canReverse && (
                <Button
                  danger
                  type="primary"
                  icon={<RollbackOutlined />}
                  disabled={data.status !== 2 || reverseMut.isPending}
                  loading={reverseMut.isPending}
                  onClick={() => promptReason(modal, 'Reverse receipt', 'Reason for reversal', (r) => reverseMut.mutate(r))}
                >
                  Reverse receipt
                </Button>
              )}
            </Space>
          </div>
        </Card>
      )}

      {data.intention === 2 && data.status === 2 && canReturn && (
        <ReturnContributionModal
          open={returnOpen}
          receipt={data}
          canReturnEarly={canReturnEarly}
          onClose={() => setReturnOpen(false)}
          onDone={() => {
            setReturnOpen(false);
            void qc.invalidateQueries({ queryKey: ['receipt', id] });
            void qc.invalidateQueries({ queryKey: ['receipts'] });
          }}
        />
      )}
    </div>
  );
}

/// Returnable-contribution summary panel. Shows running balance + maturity status, gates
/// the "Process return" button. Reads the receipt's intention/maturity/amount-returned
/// fields straight from the API; nothing is computed server-side here.
function ReturnableContributionPanel({
  receipt, onProcessReturn, canReturnEarly,
}: {
  receipt: Receipt;
  onProcessReturn: () => void;
  canReturnEarly: boolean;
}) {
  const today = dayjs().format('YYYY-MM-DD');
  const matured = !receipt.maturityDate || receipt.maturityDate <= today;
  const remaining = receipt.amountTotal - receipt.amountReturned;
  const fullyReturned = remaining <= 0.005;
  const canClick = !fullyReturned && (matured || canReturnEarly);
  const blockedReason = fullyReturned
    ? 'Fully returned - no remaining balance.'
    : !matured && !canReturnEarly
      ? `Not yet matured. Matures on ${dayjs(receipt.maturityDate!).format('DD MMM YYYY')}. An admin with maturity-override permission can process the return early.`
      : null;

  return (
    <Card size="small" style={{ marginBlockStart: 16, borderColor: '#FCD34D', background: '#FFFBEB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minInlineSize: 280 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#92400E', marginBlockEnd: 6 }}>
            Returnable contribution
          </div>
          <Space size={20} wrap>
            <span>
              <span style={{ fontSize: 11, color: 'var(--jm-gray-600)', display: 'block' }}>Original</span>
              <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(receipt.amountTotal, receipt.currency)}</span>
            </span>
            <span>
              <span style={{ fontSize: 11, color: 'var(--jm-gray-600)', display: 'block' }}>Returned</span>
              <span className="jm-tnum" style={{ fontWeight: 600, color: '#0E5C40' }}>{money(receipt.amountReturned, receipt.currency)}</span>
            </span>
            <span>
              <span style={{ fontSize: 11, color: 'var(--jm-gray-600)', display: 'block' }}>Outstanding</span>
              <span className="jm-tnum" style={{ fontWeight: 700, fontSize: 16, color: fullyReturned ? '#9CA3AF' : '#92400E' }}>
                {money(remaining, receipt.currency)}
              </span>
            </span>
            {receipt.maturityDate && (
              <span>
                <span style={{ fontSize: 11, color: 'var(--jm-gray-600)', display: 'block' }}>Maturity</span>
                <span className="jm-tnum" style={{ fontWeight: 600 }}>
                  {dayjs(receipt.maturityDate).format('DD MMM YYYY')}
                  {matured
                    ? <CheckCircleOutlined style={{ marginInlineStart: 6, color: '#0E5C40' }} />
                    : <ClockCircleOutlined style={{ marginInlineStart: 6, color: '#B45309' }} />}
                </span>
              </span>
            )}
          </Space>
        </div>
        <div>
          <Button type="primary" icon={<RedoOutlined />} disabled={!canClick} onClick={onProcessReturn}
            title={blockedReason ?? undefined}>
            Process return
          </Button>
        </div>
      </div>
      {!matured && !canReturnEarly && !fullyReturned && (
        <div style={{ marginBlockStart: 8, fontSize: 12, color: '#92400E' }}>
          {blockedReason}
        </div>
      )}
      {!matured && canReturnEarly && !fullyReturned && (
        <div style={{ marginBlockStart: 8, fontSize: 12, color: '#92400E' }}>
          Not yet matured (matures {dayjs(receipt.maturityDate!).format('DD MMM YYYY')}). You have early-return permission - the system will accept a pre-maturity return.
        </div>
      )}
    </Card>
  );
}

function ReturnContributionModal({
  open, receipt, canReturnEarly, onClose, onDone,
}: {
  open: boolean;
  receipt: Receipt;
  canReturnEarly: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const banksQ = useQuery({
    queryKey: ['bank-accounts', 'all'],
    queryFn: () => bankAccountsApi.list({ page: 1, pageSize: 100, active: true }),
    enabled: open,
  });
  const remaining = receipt.amountTotal - receipt.amountReturned;
  const today = dayjs().format('YYYY-MM-DD');
  const matured = !receipt.maturityDate || receipt.maturityDate <= today;

  const mut = useMutation({
    mutationFn: (v: { amount: number; returnDate: Dayjs; paymentMode: PaymentMode; bankAccountId?: string; chequeNumber?: string; chequeDate?: Dayjs; reason?: string }) =>
      receiptsApi.returnContribution(receipt.id, {
        receiptId: receipt.id,
        amount: v.amount,
        returnDate: v.returnDate.format('YYYY-MM-DD'),
        paymentMode: v.paymentMode,
        bankAccountId: v.paymentMode === 1 ? null : v.bankAccountId,
        chequeNumber: v.paymentMode === 2 ? v.chequeNumber : undefined,
        chequeDate: v.paymentMode === 2 ? v.chequeDate?.format('YYYY-MM-DD') : undefined,
        reason: v.reason,
      }),
    onSuccess: (r) => {
      message.success(`Return processed. Voucher issued. Outstanding now ${money(r.amountTotal - r.amountReturned, r.currency)}.`);
      form.resetFields();
      onDone();
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to process return.'),
  });

  return (
    <Modal
      open={open}
      title={`Process return - receipt ${receipt.receiptNumber}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Process return"
      okButtonProps={{ type: 'primary', loading: mut.isPending }}
      width={560}
      destroyOnHidden
    >
      <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', padding: 10, borderRadius: 6, marginBlockEnd: 12, fontSize: 13 }}>
        Returning <strong>{receipt.memberNameSnapshot}</strong>'s contribution. Outstanding balance: <strong>{money(remaining, receipt.currency)}</strong>.
        {!matured && (
          <div style={{ marginBlockStart: 6, color: '#92400E' }}>
            <ClockCircleOutlined /> Not yet matured (matures {dayjs(receipt.maturityDate!).format('DD MMM YYYY')}).
            {canReturnEarly ? ' You have early-return permission.' : ' Maturity-override permission required.'}
          </div>
        )}
      </div>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ amount: remaining, returnDate: dayjs(), paymentMode: 1 }}
        onFinish={(v) => mut.mutate(v)}>
        <Form.Item name="amount" label="Return amount"
          rules={[
            { required: true, type: 'number', min: 0.01, message: 'Amount must be positive.' },
            { type: 'number', max: remaining, message: `Max returnable is ${money(remaining, receipt.currency)}.` },
          ]}>
          <InputNumber style={{ inlineSize: '100%' }} addonAfter={receipt.currency} step={100} />
        </Form.Item>
        <Form.Item name="returnDate" label="Return date" rules={[{ required: true }]}>
          <DatePicker style={{ inlineSize: 220 }} format="DD MMM YYYY" disabledDate={(d) => d && d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="paymentMode" label="Payment mode" rules={[{ required: true }]}>
          <Select options={[
            { value: 1, label: 'Cash' }, { value: 2, label: 'Cheque' },
            { value: 4, label: 'Bank transfer' }, { value: 8, label: 'Card' },
            { value: 16, label: 'Online' }, { value: 32, label: 'UPI' },
          ]} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(p, n) => p.paymentMode !== n.paymentMode}>
          {({ getFieldValue }) => {
            const mode = getFieldValue('paymentMode');
            if (mode === 1) return null; // cash needs no bank
            return (
              <>
                <Form.Item name="bankAccountId" label="Pay from bank account" rules={[{ required: true }]}
                  tooltip="The bank account the funds are leaving from. The voucher will credit this account.">
                  <Select placeholder="Select bank account"
                    options={(banksQ.data?.items ?? []).map((b) => ({ value: b.id, label: `${b.name} · ${b.accountNumber}` }))} />
                </Form.Item>
                {mode === 2 && (
                  <>
                    <Form.Item name="chequeNumber" label="Cheque number" rules={[{ required: true, max: 64 }]}>
                      <Input placeholder="e.g. 100123" />
                    </Form.Item>
                    <Form.Item name="chequeDate" label="Cheque date" rules={[{ required: true }]}>
                      <DatePicker style={{ inlineSize: 220 }} format="DD MMM YYYY" />
                    </Form.Item>
                  </>
                )}
              </>
            );
          }}
        </Form.Item>
        <Form.Item name="reason" label="Reason / notes">
          <Input.TextArea rows={2} maxLength={500} placeholder="Optional - kept on the voucher's audit trail." />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/// Modal-with-textarea reason prompt. Shared shape with the list page; we keep two
/// copies because the list version is a closure over its own mutation. If a third
/// caller appears, lift this into shared/ui.
/// Upload / view / replace / delete the receipt's agreement document. Hides itself for
/// permanent receipts (the parent doesn't render it in that case anyway). PDF + image
/// uploads accepted. The "View" button opens the file in a new tab using the same
/// authenticated-blob trick the receipt PDF link uses.
function AgreementDocumentControl({ receipt }: { receipt: Receipt }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('receipt.create');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      await receiptsApi.uploadAgreementDocument(receipt.id, file);
      message.success('Agreement document uploaded.');
      void qc.invalidateQueries({ queryKey: ['receipt', receipt.id] });
    } catch (e) {
      message.error(extractProblem(e).detail ?? 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = () => {
    modal.confirm({
      title: 'Remove agreement document?',
      content: 'The stored file will be deleted. The free-text Agreement reference (if any) stays on the receipt.',
      okText: 'Remove', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await receiptsApi.deleteAgreementDocument(receipt.id);
          message.success('Agreement document removed.');
          void qc.invalidateQueries({ queryKey: ['receipt', receipt.id] });
        } catch (e) {
          message.error(extractProblem(e).detail ?? 'Delete failed.');
        }
      },
    });
  };

  return (
    <Space wrap>
      {receipt.agreementDocumentUrl ? (
        <>
          <Tag color="green" style={{ margin: 0 }}>Uploaded</Tag>
          <Button size="small" onClick={() => void receiptsApi.openAgreementDocument(receipt.id)}>
            View
          </Button>
          {canEdit && (
            <>
              <Button size="small" loading={busy} onClick={() => inputRef.current?.click()}>
                Replace
              </Button>
              <Button size="small" danger onClick={handleDelete}>Remove</Button>
            </>
          )}
        </>
      ) : (
        <>
          <span style={{ color: 'var(--jm-gray-500)', fontSize: 12 }}>No file attached.</span>
          {canEdit && (
            <Button size="small" type="primary" loading={busy} onClick={() => inputRef.current?.click()}>
              Upload PDF / image
            </Button>
          )}
        </>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }} />
    </Space>
  );
}

function promptReason(
  modal: ReturnType<typeof AntdApp.useApp>['modal'],
  title: string,
  label: string,
  onOk: (reason: string) => void,
) {
  let reason = '';
  modal.confirm({
    title,
    content: (
      <div style={{ marginBlockStart: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--jm-gray-600)', marginBlockEnd: 6 }}>{label}</div>
        <Input.TextArea onChange={(e) => { reason = e.target.value; }} rows={3} autoFocus />
      </div>
    ),
    okText: 'Submit',
    okButtonProps: { danger: true },
    onOk: () => {
      if (!reason.trim()) throw new Error('Reason required');
      onOk(reason);
    },
  });
}
