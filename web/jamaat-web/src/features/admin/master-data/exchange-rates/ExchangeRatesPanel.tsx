import { useState } from 'react';
import { Card, Table, Tag, Button, App as AntdApp, Modal, Form, Select, DatePicker, InputNumber, Input, Space } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, ReloadOutlined, LineChartOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { extractProblem } from '../../../../shared/api/client';
import { formatDate } from '../../../../shared/format/format';
import { currenciesApi, exchangeRatesApi, type ExchangeRate } from '../currencies/currenciesApi';

export function ExchangeRatesPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currenciesQuery = useQuery({ queryKey: ['currencies'], queryFn: () => currenciesApi.list(true) });
  const { data, isLoading, refetch } = useQuery({ queryKey: ['rates'], queryFn: () => exchangeRatesApi.list() });

  const remove = useMutation({
    mutationFn: (id: string) => exchangeRatesApi.remove(id),
    onSuccess: () => { message.success('Rate deactivated'); void qc.invalidateQueries({ queryKey: ['rates'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<ExchangeRate> = [
    { title: 'From', dataIndex: 'fromCurrency', key: 'f', width: 100, render: (v: string) => <Tag style={{ margin: 0, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</Tag> },
    { title: 'To', dataIndex: 'toCurrency', key: 't', width: 100, render: (v: string) => <Tag color="gold" style={{ margin: 0, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</Tag> },
    {
      title: 'Rate', dataIndex: 'rate', key: 'r', width: 160, align: 'right',
      render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>1 {row.fromCurrency} = {v.toFixed(6)} {row.toCurrency}</span>,
    },
    { title: 'Effective from', dataIndex: 'effectiveFrom', key: 'ef', width: 140, render: (v: string) => formatDate(v) },
    { title: 'Effective to', dataIndex: 'effectiveTo', key: 'et', width: 140,
      render: (v?: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-primary-500)', fontWeight: 500 }}>Open-ended</span> },
    { title: 'Source', dataIndex: 'source', key: 's', render: (v?: string | null) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>manual</span> },
    { title: 'Status', dataIndex: 'isActive', key: 'a', width: 100,
      render: (v: boolean) => v
        ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
        : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag>,
    },
    { key: 'act', width: 90, fixed: 'right', render: (_, row) => (
      <Button type="text" size="small" danger disabled={!row.isActive}
        onClick={() => modal.confirm({ title: 'Deactivate rate?', okButtonProps: { danger: true }, onOk: () => remove.mutateAsync(row.id) })}>
        Deactivate
      </Button>
    ) },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12 }}>
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>New rate</Button>
      </div>
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<ExchangeRate> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false}
          locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><LineChartOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No exchange rates</div> }} />
      </Card>
      <NewRateModal open={drawerOpen} onClose={() => setDrawerOpen(false)} currencies={currenciesQuery.data ?? []}
        onSaved={() => { void qc.invalidateQueries({ queryKey: ['rates'] }); }} message={message} />
    </>
  );
}

function NewRateModal({ open, onClose, currencies, onSaved, message }: { open: boolean; onClose: () => void; currencies: { code: string; isBase: boolean }[]; onSaved: () => void; message: ReturnType<typeof AntdApp.useApp>['message'] }) {
  const [form] = Form.useForm();
  const base = currencies.find((c) => c.isBase)?.code;
  const mutation = useMutation({
    mutationFn: async (v: { from: string; to: string; rate: number; range: [Dayjs, Dayjs?]; source?: string }) => {
      return exchangeRatesApi.create({
        fromCurrency: v.from, toCurrency: v.to, rate: v.rate,
        effectiveFrom: v.range[0].format('YYYY-MM-DD'),
        effectiveTo: v.range[1]?.format('YYYY-MM-DD') ?? null,
        source: v.source || undefined,
      });
    },
    onSuccess: () => { message.success('Exchange rate added'); onSaved(); onClose(); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  return (
    <Modal title="New exchange rate" open={open} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} okText="Create" confirmLoading={mutation.isPending}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ to: base, range: [dayjs(), null] }}
        onFinish={(v) => mutation.mutate(v)}>
        <Space.Compact block>
          <Form.Item name="from" label="From currency" rules={[{ required: true }]} style={{ flex: 1 }}>
            <Select showSearch options={currencies.filter((c) => !c.isBase).map((c) => ({ value: c.code, label: c.code }))} />
          </Form.Item>
          <Form.Item name="to" label="To currency" rules={[{ required: true }]} style={{ flex: 1 }}>
            <Select showSearch options={currencies.map((c) => ({ value: c.code, label: c.code }))} />
          </Form.Item>
        </Space.Compact>
        <Form.Item name="rate" label="Rate (1 From = ? To)" rules={[{ required: true, type: 'number', min: 0.000001 }]}>
          <InputNumber min={0} step={0.0001} style={{ inlineSize: '100%' }} className="jm-tnum" />
        </Form.Item>
        <Form.Item name="range" label="Effective period (To is optional — open-ended)" rules={[{ required: true }]}>
          <DatePicker.RangePicker allowEmpty={[false, true]} />
        </Form.Item>
        <Form.Item name="source" label="Source (optional — e.g. OER, ECB, manual)"><Input /></Form.Item>
      </Form>
    </Modal>
  );
}
