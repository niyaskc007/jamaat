import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Descriptions, Tag, Table, Button, Space, Spin, Alert, App as AntdApp, Input, Row, Col, Statistic, Empty, Timeline } from 'antd';
import {
  PrinterOutlined, ArrowLeftOutlined, CheckCircleFilled, StopOutlined, RollbackOutlined,
  WalletOutlined, BankOutlined, FileDoneOutlined, CalendarOutlined, BookOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { UserHoverCard } from '../../shared/ui/UserHoverCard';
import { money, formatDateTime, formatDate } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { vouchersApi, PaymentModeLabel, VoucherStatusLabel, type VoucherStatus } from './vouchersApi';
import { useAuth } from '../../shared/auth/useAuth';
import { ledgerApi } from '../ledger/ledgerApi';

/// Voucher detail page (uplifted UX) - mirrors the CommitmentDetailPage pattern:
/// header KPIs + 2-col main + lines table + ledger impact + sticky-feeling action bar.
export function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { hasPermission } = useAuth();
  const canPrint = hasPermission('voucher.view');
  const canApprove = hasPermission('voucher.approve');
  const canCancel = hasPermission('voucher.cancel');
  const canReverse = hasPermission('voucher.reverse');

  const approveMut = useMutation({
    mutationFn: () => vouchersApi.approve(id!),
    onSuccess: () => { message.success('Voucher approved & paid.'); void qc.invalidateQueries({ queryKey: ['voucher', id] }); void qc.invalidateQueries({ queryKey: ['vouchers'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to approve'),
  });
  const cancelMut = useMutation({
    mutationFn: (reason: string) => vouchersApi.cancel(id!, reason),
    onSuccess: () => { message.success('Voucher cancelled.'); void qc.invalidateQueries({ queryKey: ['voucher', id] }); void qc.invalidateQueries({ queryKey: ['vouchers'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to cancel'),
  });
  const reverseMut = useMutation({
    mutationFn: (reason: string) => vouchersApi.reverse(id!, reason),
    onSuccess: () => { message.success('Voucher reversed.'); void qc.invalidateQueries({ queryKey: ['voucher', id] }); void qc.invalidateQueries({ queryKey: ['vouchers'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to reverse'),
  });
  const { data, isLoading, isError } = useQuery({ queryKey: ['voucher', id], queryFn: () => vouchersApi.get(id!), enabled: !!id });

  // Ledger impact - GL postings made when this voucher was paid. Only run when the voucher is
  // Paid or Reversed - other states don't have postings, so skip the round-trip.
  const ledgerQ = useQuery({
    queryKey: ['voucher-ledger', id],
    queryFn: () => ledgerApi.list({ sourceType: 2 /* Voucher */, sourceId: id!, pageSize: 50 }),
    enabled: !!id && !!data && (data.status === 4 || data.status === 6),
  });

  if (isLoading) return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>;
  if (isError || !data) return <Alert type="error" message="Voucher not found" style={{ margin: 24 }} />;

  const statusCfg: Record<VoucherStatus, { bg: string; color: string }> = {
    1: { bg: '#FEF3C7', color: '#92400E' }, 2: { bg: '#FEF3C7', color: '#D97706' },
    3: { bg: '#DBEAFE', color: '#1E40AF' }, 4: { bg: '#D1FAE5', color: '#065F46' },
    5: { bg: '#E5E9EF', color: '#475569' }, 6: { bg: '#FEE2E2', color: '#991B1B' },
    // PendingClearance shares the amber palette with Draft - paused awaiting an external event,
    // not a final state.
    7: { bg: '#FEF3C7', color: '#92400E' },
  };

  const isPaid = data.status === 4;
  const isReversed = data.status === 6;
  const isCancelled = data.status === 5;

  return (
    <div className="jm-stack" style={{ gap: 16 }}>
      <PageHeader
        title={`Voucher ${data.voucherNumber ?? 'Draft'}`}
        subtitle={
          <span>
            <Tag style={{ marginInlineEnd: 8, background: statusCfg[data.status].bg, color: statusCfg[data.status].color, border: 'none', fontWeight: 500 }}>
              {VoucherStatusLabel[data.status]}
            </Tag>
            {dayjs(data.voucherDate).format('DD MMM YYYY')} - {data.payTo}
          </span>
        }
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/vouchers')}>Back</Button>
            {canPrint && (
              <Button icon={<PrinterOutlined />} disabled={!data.voucherNumber} onClick={() => void vouchersApi.openPdf(data.id)}>
                Print PDF
              </Button>
            )}
          </Space>
        }
      />

      {/* PendingClearance banner: a future-dated cheque is in flight. The voucher has full
          line + payment data captured but no number, no GL post - the linked PostDatedCheque
          drives the eventual MarkPaid (clear) or Cancel (bounce) transition. */}
      {data.status === 7 && (
        <Card size="small" style={{ borderColor: '#FCD34D', background: '#FFFBEB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <ClockCircleOutlined style={{ color: '#B45309', fontSize: 18 }} />
            <div style={{ flex: 1, minInlineSize: 280 }}>
              <strong style={{ color: '#92400E' }}>Awaiting cheque clearance</strong>
              <div style={{ color: '#92400E', fontSize: 12, marginBlockStart: 2 }}>
                Cheque {data.chequeNumber ? <strong>{data.chequeNumber}</strong> : null}
                {data.drawnOnBank ? <> drawn on <strong>{data.drawnOnBank}</strong></> : null}
                {data.chequeDate ? <>, dated {dayjs(data.chequeDate).format('DD MMM YYYY')}</> : null}.
                The voucher is held in 'Pending clearance' - no number and no GL post until the cheque
                is marked Cleared from the Cheques workbench. If it bounces, the voucher is cancelled
                with no GL impact.
              </div>
            </div>
            <Button icon={<ClockCircleOutlined />} onClick={() => navigate('/cheques')}>
              Open Cheques workbench
            </Button>
          </div>
        </Card>
      )}

      {/* KPI strip - 4 tiles. Surfaces voucher#, amount, status, paid-on at a glance so the
          approver/auditor doesn't have to scan the descriptions card to find the basics. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" className="jm-card">
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>
              <FileDoneOutlined /> Voucher
            </div>
            <div className="jm-tnum" style={{ fontSize: 18, fontWeight: 700 }}>{data.voucherNumber ?? '(unnumbered)'}</div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              {dayjs(data.voucherDate).format('DD MMM YYYY')}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="jm-card">
            <Statistic title="Amount" value={data.amountTotal} precision={2}
              formatter={(v) => money(Number(v), data.currency)}
              valueStyle={{ fontSize: 18, fontWeight: 700 }} />
            {data.currency !== data.baseCurrency && (
              <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }} className="jm-tnum">
                = {money(data.baseAmountTotal, data.baseCurrency)} @ {data.fxRate.toFixed(4)}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="jm-card">
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>Status</div>
            <Tag style={{ background: statusCfg[data.status].bg, color: statusCfg[data.status].color, border: 'none', fontSize: 14, padding: '4px 10px', fontWeight: 600 }}>
              {VoucherStatusLabel[data.status]}
            </Tag>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 6 }}>
              {PaymentModeLabel[data.paymentMode]}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="jm-card">
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>
              <CalendarOutlined /> Paid on
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {data.paidAtUtc ? formatDateTime(data.paidAtUtc).split(' ')[0] : (isCancelled ? 'Cancelled' : 'Not paid')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              {data.paidByUserName ? <>by <UserHoverCard userId={data.paidByUserId ?? null} fallback={data.paidByUserName} /></> : ' '}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Two-column main. Same proportions as CommitmentDetailPage so spatial muscle memory holds. */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card size="small" title={<span><WalletOutlined /> Voucher details</span>}
            className="jm-card">
            <Descriptions size="small" column={2} colon={false} labelStyle={{ color: 'var(--jm-gray-500)', fontSize: 12 }}>
              <Descriptions.Item label="Pay to" span={2}>
                <div style={{ fontWeight: 500 }}>{data.payTo}</div>
                {data.payeeItsNumber && <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }} className="jm-tnum">ITS {data.payeeItsNumber}</div>}
              </Descriptions.Item>
              <Descriptions.Item label="Purpose" span={2}>
                {data.purpose ? <span style={{ whiteSpace: 'pre-wrap' }}>{data.purpose}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>None</span>}
              </Descriptions.Item>
              <Descriptions.Item label="Mode">{PaymentModeLabel[data.paymentMode]}</Descriptions.Item>
              <Descriptions.Item label="Bank account">{data.bankAccountName ?? '-'}</Descriptions.Item>
              {data.chequeNumber && (
                <Descriptions.Item label="Cheque">
                  <span className="jm-tnum">{data.chequeNumber}</span>
                  {data.chequeDate && <span style={{ color: 'var(--jm-gray-500)', marginInlineStart: 6 }}>{formatDate(data.chequeDate)}</span>}
                </Descriptions.Item>
              )}
              {data.drawnOnBank && <Descriptions.Item label="Drawn on">{data.drawnOnBank}</Descriptions.Item>}
              {data.remarks && (
                <Descriptions.Item label="Remarks" span={2}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</span>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="Approval timeline" style={{ border: '1px solid var(--jm-border)', blockSize: '100%' }}>
            <Timeline
              style={{ marginBlockStart: 8 }}
              items={[
                {
                  color: 'gray',
                  children: (
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>Created</div>
                      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{formatDateTime(data.createdAtUtc)}</div>
                    </div>
                  ),
                },
                ...(data.approvedAtUtc ? [{
                  color: 'blue',
                  children: (
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>Approved</div>
                      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
                        {formatDateTime(data.approvedAtUtc)}
                        {data.approvedByUserName && <> by <UserHoverCard userId={data.approvedByUserId ?? null} fallback={data.approvedByUserName} /></>}
                      </div>
                    </div>
                  ),
                }] : []),
                ...(data.paidAtUtc ? [{
                  color: 'green',
                  children: (
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>Paid</div>
                      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
                        {formatDateTime(data.paidAtUtc)}
                        {data.paidByUserName && <> by <UserHoverCard userId={data.paidByUserId ?? null} fallback={data.paidByUserName} /></>}
                      </div>
                    </div>
                  ),
                }] : []),
                ...(isCancelled ? [{
                  color: 'red',
                  children: (
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>Cancelled</div>
                      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>This voucher posted no GL entries.</div>
                    </div>
                  ),
                }] : []),
                ...(isReversed ? [{
                  color: 'red',
                  children: (
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>Reversed</div>
                      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Reversal entries below offset the original posting.</div>
                    </div>
                  ),
                }] : []),
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Lines table - same shape as before, slightly cleaner header styling. */}
      <Card title="Expense lines" size="small" className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" size="middle" pagination={false} dataSource={data.lines}
          columns={[
            { title: '#', dataIndex: 'lineNo', key: 'lineNo', width: 60 },
            { title: 'Expense', dataIndex: 'expenseTypeName', key: 'exp',
              render: (v: string, row: { expenseTypeCode: string }) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{v}</div>
                  <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }} className="jm-tnum">{row.expenseTypeCode}</div>
                </div>
              ) },
            { title: 'Narration', dataIndex: 'narration', key: 'narr',
              render: (v: string | null | undefined) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
            { title: 'Amount', dataIndex: 'amount', key: 'amt', align: 'end', width: 160,
              render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, data.currency)}</span> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3} align="right"><strong>Total</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <span className="jm-tnum" style={{ fontWeight: 700, fontSize: 16 }}>{money(data.amountTotal, data.currency)}</span>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      {/* Ledger impact - only meaningful for Paid/Reversed vouchers. Shows the actual GL
          postings produced. Drafts/Pending/Approved/Cancelled don't post anything; we surface
          a friendly placeholder rather than an empty card. */}
      <Card title={<span><BookOutlined /> Ledger impact</span>} size="small"
        className="jm-card"
        extra={<span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
          {isPaid ? 'Posted on payment' : isReversed ? 'Reversal entries shown below' : 'Posts when the voucher is paid'}
        </span>}>
        {!isPaid && !isReversed ? (
          <div style={{ padding: 12, color: 'var(--jm-gray-500)', fontSize: 13 }}>
            No GL entries yet. Vouchers post Dr Expense / Cr Cash-or-Bank only when they move from Pending Approval to Paid.
          </div>
        ) : ledgerQ.isLoading ? (
          <Spin />
        ) : (ledgerQ.data?.items.length ?? 0) === 0 ? (
          <Empty description="No ledger entries found for this voucher" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            rowKey="id" size="small" pagination={false} dataSource={ledgerQ.data!.items}
            columns={[
              { title: 'Posted', dataIndex: 'postingDate', width: 120, render: (v: string) => formatDate(v) },
              { title: 'Account', dataIndex: 'accountName',
                render: (v: string, row) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{v}</div>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }} className="jm-tnum">{row.accountCode}</div>
                  </div>
                ) },
              { title: 'Narration', dataIndex: 'narration',
                render: (v: string | null) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
              { title: 'Debit', dataIndex: 'debit', width: 130, align: 'end',
                render: (v: number, row) => v > 0 ? <span className="jm-tnum">{money(v, row.currency)}</span> : <span style={{ color: 'var(--jm-gray-300)' }}>-</span> },
              { title: 'Credit', dataIndex: 'credit', width: 130, align: 'end',
                render: (v: number, row) => v > 0 ? <span className="jm-tnum">{money(v, row.currency)}</span> : <span style={{ color: 'var(--jm-gray-300)' }}>-</span> },
            ]}
          />
        )}
      </Card>

      {(canApprove || canCancel || canReverse) && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {canApprove && (
            <Button type="primary" icon={<CheckCircleFilled />} loading={approveMut.isPending}
              disabled={data.status !== 2 || approveMut.isPending}
              onClick={() => approveMut.mutate()}>
              Approve &amp; Pay
            </Button>
          )}
          {canCancel && (
            <Button icon={<StopOutlined />} loading={cancelMut.isPending}
              disabled={data.status === 4 || data.status === 5 || data.status === 6 || cancelMut.isPending}
              onClick={() => promptReason(modal, 'Cancel voucher', 'Reason for cancellation', (r) => cancelMut.mutate(r))}>
              Cancel
            </Button>
          )}
          {canReverse && (
            <Button danger icon={<RollbackOutlined />} loading={reverseMut.isPending}
              disabled={data.status !== 4 || reverseMut.isPending}
              onClick={() => promptReason(modal, 'Reverse voucher', 'Reason for reversal', (r) => reverseMut.mutate(r))}>
              Reverse
            </Button>
          )}
        </div>
      )}
    </div>
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
    onOk: () => { if (!reason.trim()) throw new Error('Reason required'); onOk(reason); },
  });
}
