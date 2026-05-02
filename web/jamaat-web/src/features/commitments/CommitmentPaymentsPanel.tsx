import { useMemo, useState } from 'react';
import { Card, Table, Tag, Button, Space, Empty, Tooltip, Segmented, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileSearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { commitmentsApi, type CommitmentPaymentRow } from './commitmentsApi';
import { PaymentModeLabel, ReceiptStatusLabel } from '../receipts/receiptsApi';
import { formatDate, formatDateTime, money } from '../../shared/format/format';
import { UserHoverCard } from '../../shared/ui/UserHoverCard';

/// Lists every receipt-line attributed to this commitment. The parent screen passes
/// `installmentNoFilter` when the cashier wants payments for a specific instalment row.
/// Cancelled/Reversed receipts stay visible (with status tags) so the audit trail is intact.
export function CommitmentPaymentsPanel({ commitmentId, currency, installmentNoFilter, onClearFilter }: {
  commitmentId: string;
  currency: string;
  installmentNoFilter?: number | null;
  onClearFilter?: () => void;
}) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<'confirmed' | 'all'>('confirmed');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['commitment-payments', commitmentId],
    queryFn: () => commitmentsApi.payments(commitmentId),
  });

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (scope === 'confirmed') rows = rows.filter((r) => r.receiptStatus === 2);
    if (installmentNoFilter != null) rows = rows.filter((r) => r.installmentNo === installmentNoFilter);
    return rows;
  }, [data, scope, installmentNoFilter]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((acc, r) => {
      // Only count the "money in" rows so the headline figure matches the commitment ledger.
      if (r.receiptStatus === 2) acc += r.amount;
      return acc;
    }, 0);
    return { confirmedTotal: sum, count: filtered.length };
  }, [filtered]);

  const columns: TableProps<CommitmentPaymentRow>['columns'] = [
    {
      title: 'Receipt', dataIndex: 'receiptNumber', width: 130,
      render: (_, row) => (
        <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => navigate(`/receipts/${row.receiptId}`)}>
          {row.receiptNumber ?? '(draft)'}
        </Button>
      ),
    },
    {
      title: 'Date', dataIndex: 'receiptDate', width: 120,
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Inst#', dataIndex: 'installmentNo', width: 70, align: 'center',
      render: (v: number | null | undefined) => v ? (
        <Tag color="blue" style={{ margin: 0 }}>#{v}</Tag>
      ) : (
        <Tooltip title="Not tied to a specific instalment">
          <span style={{ color: 'var(--jm-gray-400)' }}>-</span>
        </Tooltip>
      ),
    },
    {
      title: 'Amount', dataIndex: 'amount', width: 130, align: 'end',
      render: (v: number, row) => (
        <span className="jm-tnum" style={{
          fontWeight: 600,
          color: row.receiptStatus === 2 ? '#0E5C40' : 'var(--jm-gray-400)',
          textDecoration: row.receiptStatus === 3 || row.receiptStatus === 4 ? 'line-through' : undefined,
        }}>
          {money(v, row.currency)}
        </span>
      ),
    },
    {
      title: 'Mode', dataIndex: 'paymentMode', width: 100,
      render: (m: number) => <Tag style={{ margin: 0 }}>{PaymentModeLabel[m] ?? m}</Tag>,
    },
    {
      title: 'Cheque / Reference', key: 'ref', width: 220,
      render: (_, row) => {
        const bits: string[] = [];
        if (row.chequeNumber) bits.push(`Cheque #${row.chequeNumber}`);
        if (row.chequeDate) bits.push(formatDate(row.chequeDate));
        if (row.paymentReference) bits.push(`Ref: ${row.paymentReference}`);
        if (row.bankAccountName) bits.push(`Bank: ${row.bankAccountName}`);
        return bits.length === 0
          ? <span style={{ color: 'var(--jm-gray-400)' }}>-</span>
          : <span style={{ fontSize: 12 }}>{bits.join(' Â· ')}</span>;
      },
    },
    {
      title: 'Status', dataIndex: 'receiptStatus', width: 110,
      render: (s: number) => {
        const label = ReceiptStatusLabel[s as 1 | 2 | 3 | 4] ?? `${s}`;
        const color = s === 2 ? 'green' : s === 1 ? 'gold' : s === 3 ? 'red' : 'magenta';
        return <Tag color={color} style={{ margin: 0 }}>{label}</Tag>;
      },
    },
    {
      title: 'Confirmed', key: 'cf', width: 200,
      render: (_, row) => row.confirmedAtUtc
        ? <span style={{ fontSize: 12, color: 'var(--jm-gray-600)' }}>
            {formatDateTime(row.confirmedAtUtc)}
            {row.confirmedByUserName && <> Â· <UserHoverCard userId={row.confirmedByUserId ?? null} fallback={row.confirmedByUserName} /></>}
          </span>
        : <span style={{ color: 'var(--jm-gray-400)' }}>-</span>,
    },
  ];

  return (
    <Card
      title={
        <Space>
          <FileSearchOutlined />
          Payments
          {installmentNoFilter != null && (
            <Tag color="blue" style={{ margin: 0 }}>
              Showing instalment #{installmentNoFilter}
              <Button type="link" size="small" style={{ padding: '0 0 0 4px' }} onClick={onClearFilter}>clear</Button>
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Segmented size="small" value={scope} onChange={(v) => setScope(v as 'confirmed' | 'all')}
            options={[{ value: 'confirmed', label: 'Confirmed only' }, { value: 'all', label: 'All (incl. cancelled)' }]} />
          <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()} />
        </Space>
      }
      size="small"
      className="jm-card"
    >
      {filtered.length === 0 && !isLoading ? (
        <Empty description={installmentNoFilter != null
          ? `No payments yet on instalment #${installmentNoFilter}.`
          : 'No payments recorded against this commitment yet.'} />
      ) : (
        <>
          <Table<CommitmentPaymentRow> rowKey={(r) => `${r.receiptId}:${r.commitmentInstallmentId ?? 'none'}`}
            size="small" pagination={false} loading={isLoading}
            columns={columns} dataSource={filtered} />
          <div style={{ marginBlockStart: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {totals.count} {totals.count === 1 ? 'row' : 'rows'} {scope === 'confirmed' ? 'Â· confirmed only' : 'Â· all statuses'}
            </Typography.Text>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Confirmed total: <span className="jm-tnum" style={{ color: '#0E5C40' }}>{money(totals.confirmedTotal, currency)}</span>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
