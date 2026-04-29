import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Descriptions, Tag, Table, Button, Space, Spin, Alert, App as AntdApp, Input } from 'antd';
import { PrinterOutlined, RollbackOutlined, StopOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money, formatDateTime } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { receiptsApi, PaymentModeLabel, ReceiptStatusLabel, type ReceiptStatus } from './receiptsApi';
import { useAuth } from '../../shared/auth/useAuth';

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { hasPermission } = useAuth();
  const canReprint = hasPermission('receipt.reprint');
  const canCancel = hasPermission('receipt.cancel');
  const canReverse = hasPermission('receipt.reverse');
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

  if (isLoading) return <div style={{ padding: 24 }}><Spin /></div>;
  if (isError || !data) return <Alert type="error" message="Receipt not found" style={{ margin: 24 }} />;

  const statusCfg: Record<ReceiptStatus, { bg: string; color: string }> = {
    1: { bg: '#FEF3C7', color: '#92400E' }, 2: { bg: '#D1FAE5', color: '#065F46' },
    3: { bg: '#E5E9EF', color: '#475569' }, 4: { bg: '#FEE2E2', color: '#991B1B' },
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
          <Descriptions.Item label="Receipt #"><span className="jm-tnum" style={{ fontWeight: 600 }}>{data.receiptNumber ?? '—'}</span></Descriptions.Item>
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
          {/* Returnable-contribution tracking — only visible when relevant. */}
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
            { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', width: 160,
              render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, data.currency)}</span> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4} align="right"><strong>Total</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <span className="jm-tnum" style={{ fontWeight: 700, fontSize: 16 }}>{money(data.amountTotal, data.currency)}</span>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      {(canCancel || canReverse) && (
        <div style={{ marginBlockStart: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {canCancel && (
            <Button
              icon={<StopOutlined />}
              disabled={data.status !== 2 || cancelMut.isPending}
              loading={cancelMut.isPending}
              onClick={() => promptReason(modal, 'Cancel receipt', 'Reason for cancellation', (r) => cancelMut.mutate(r))}
            >
              Cancel
            </Button>
          )}
          {canReverse && (
            <Button
              danger
              icon={<RollbackOutlined />}
              disabled={data.status !== 2 || reverseMut.isPending}
              loading={reverseMut.isPending}
              onClick={() => promptReason(modal, 'Reverse receipt', 'Reason for reversal', (r) => reverseMut.mutate(r))}
            >
              Reverse
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/// Modal-with-textarea reason prompt. Shared shape with the list page; we keep two
/// copies because the list version is a closure over its own mutation. If a third
/// caller appears, lift this into shared/ui.
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
