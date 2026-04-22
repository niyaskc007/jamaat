import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Tag, Table, Button, Space, Spin, Alert } from 'antd';
import { PrinterOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money, formatDateTime } from '../../shared/format/format';
import { vouchersApi, PaymentModeLabel, VoucherStatusLabel, type VoucherStatus } from './vouchersApi';

export function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({ queryKey: ['voucher', id], queryFn: () => vouchersApi.get(id!), enabled: !!id });

  if (isLoading) return <div style={{ padding: 24 }}><Spin /></div>;
  if (isError || !data) return <Alert type="error" message="Voucher not found" style={{ margin: 24 }} />;

  const statusCfg: Record<VoucherStatus, { bg: string; color: string }> = {
    1: { bg: '#FEF3C7', color: '#92400E' }, 2: { bg: '#FEF3C7', color: '#D97706' },
    3: { bg: '#DBEAFE', color: '#1E40AF' }, 4: { bg: '#D1FAE5', color: '#065F46' },
    5: { bg: '#E5E9EF', color: '#475569' }, 6: { bg: '#FEE2E2', color: '#991B1B' },
  };

  return (
    <div>
      <PageHeader
        title={`Voucher ${data.voucherNumber ?? 'Draft'}`}
        subtitle={`${dayjs(data.voucherDate).format('DD MMM YYYY')} · ${data.payTo}`}
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/vouchers')}>Back</Button>
            <Button icon={<PrinterOutlined />} disabled={!data.voucherNumber} onClick={() => void vouchersApi.openPdf(data.id)}>
              Print PDF
            </Button>
          </Space>
        }
      />

      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBlockEnd: 16 }}>
          <Tag style={{ margin: 0, background: statusCfg[data.status].bg, color: statusCfg[data.status].color, border: 'none', fontWeight: 500 }}>
            {VoucherStatusLabel[data.status]}
          </Tag>
          <span style={{ color: 'var(--jm-gray-500)', fontSize: 13 }}>
            Created {formatDateTime(data.createdAtUtc)}
            {data.paidAtUtc ? ` · Paid ${formatDateTime(data.paidAtUtc)}${data.paidByUserName ? ` by ${data.paidByUserName}` : ''}` : ''}
          </span>
        </div>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Voucher #"><span className="jm-tnum" style={{ fontWeight: 600 }}>{data.voucherNumber ?? '—'}</span></Descriptions.Item>
          <Descriptions.Item label="Date">{dayjs(data.voucherDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Currency">
            {data.currency}
            {data.currency !== data.baseCurrency && (
              <span style={{ color: 'var(--jm-gray-500)', fontSize: 12, marginInlineStart: 8 }}>
                · {money(data.baseAmountTotal, data.baseCurrency)} @ {data.fxRate.toFixed(6)} {data.baseCurrency}/{data.currency}
              </span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Pay to" span={2}>{data.payTo}</Descriptions.Item>
          {data.payeeItsNumber && <Descriptions.Item label="Payee ITS"><span className="jm-tnum">{data.payeeItsNumber}</span></Descriptions.Item>}
          {data.purpose && <Descriptions.Item label="Purpose" span={3}>{data.purpose}</Descriptions.Item>}
          <Descriptions.Item label="Mode">{PaymentModeLabel[data.paymentMode]}</Descriptions.Item>
          {data.chequeNumber && <Descriptions.Item label="Cheque">{data.chequeNumber} · {data.chequeDate ? dayjs(data.chequeDate).format('DD MMM YYYY') : ''}</Descriptions.Item>}
          {data.drawnOnBank && <Descriptions.Item label="Drawn on">{data.drawnOnBank}</Descriptions.Item>}
          {data.bankAccountName && <Descriptions.Item label="Bank">{data.bankAccountName}</Descriptions.Item>}
          {data.remarks && <Descriptions.Item label="Remarks" span={3}>{data.remarks}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card title="Lines" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" size="middle" pagination={false} dataSource={data.lines}
          columns={[
            { title: '#', dataIndex: 'lineNo', key: 'lineNo', width: 60 },
            { title: 'Expense', dataIndex: 'expenseTypeName', key: 'exp', render: (v, row: { expenseTypeCode: string }) => (
              <div><div style={{ fontWeight: 500 }}>{v}</div>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{row.expenseTypeCode}</div>
              </div>) },
            { title: 'Narration', dataIndex: 'narration', key: 'narr' },
            { title: 'Amount', dataIndex: 'amount', key: 'amt', align: 'right', width: 160,
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
    </div>
  );
}
