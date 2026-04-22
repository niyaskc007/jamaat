import { useState } from 'react';
import { Card, Table, Tag, Button, App as AntdApp, Modal, Form, Input, InputNumber, Dropdown, Switch } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import { PlusOutlined, ReloadOutlined, MoreOutlined, EditOutlined, StarFilled, DeleteOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { currenciesApi, type Currency } from './currenciesApi';

export function CurrenciesPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['currencies'], queryFn: () => currenciesApi.list() });

  const setBase = useMutation({
    mutationFn: (id: string) => currenciesApi.setBase(id),
    onSuccess: (c) => { message.success(`${c.code} is now the base currency`); void qc.invalidateQueries({ queryKey: ['currencies'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => currenciesApi.remove(id),
    onSuccess: () => { message.success('Currency deactivated'); void qc.invalidateQueries({ queryKey: ['currencies'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<Currency> = [
    {
      title: 'Code', dataIndex: 'code', key: 'c', width: 100,
      render: (v: string, row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</span>
          {row.isBase && <Tag color="gold" style={{ margin: 0 }}><StarFilled /> Base</Tag>}
        </span>
      ),
    },
    { title: 'Name', dataIndex: 'name', key: 'n' },
    { title: 'Symbol', dataIndex: 'symbol', key: 's', width: 80, align: 'center', render: (v: string) => <span style={{ fontSize: 16 }}>{v}</span> },
    { title: 'Decimals', dataIndex: 'decimalPlaces', key: 'd', width: 100, align: 'right' },
    {
      title: 'Status', dataIndex: 'isActive', key: 'a', width: 100,
      render: (v: boolean) => v
        ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
        : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag>,
    },
    {
      key: 'act', width: 56, fixed: 'right',
      render: (_, row) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { key: 'base', icon: <StarFilled />, label: row.isBase ? 'Already base' : 'Set as base', disabled: row.isBase, onClick: () => setBase.mutate(row.id) },
          { type: 'divider' },
          { key: 'del', icon: <DeleteOutlined />, danger: true, disabled: !row.isActive || row.isBase,
            label: row.isBase ? 'Base cannot be removed' : row.isActive ? 'Deactivate' : 'Already inactive',
            onClick: () => modal.confirm({ title: 'Deactivate currency?', okButtonProps: { danger: true }, onOk: () => remove.mutateAsync(row.id) }) },
        ];
        return <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12 }}>
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New currency</Button>
      </div>
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<Currency> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false}
          locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><DollarOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No currencies</div> }} />
      </Card>
      <CurrencyModal open={drawerOpen} onClose={() => setDrawerOpen(false)} currency={editing}
        onSaved={() => { void qc.invalidateQueries({ queryKey: ['currencies'] }); }} message={message} />
    </>
  );
}

function CurrencyModal({ open, onClose, currency, onSaved, message }: { open: boolean; onClose: () => void; currency: Currency | null; onSaved: () => void; message: ReturnType<typeof AntdApp.useApp>['message'] }) {
  const isEdit = !!currency;
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: async (v: Record<string, unknown>) => isEdit && currency
      ? currenciesApi.update(currency.id, v as { name: string; symbol: string; decimalPlaces: number; isActive: boolean })
      : currenciesApi.create(v as { code: string; name: string; symbol: string; decimalPlaces: number }),
    onSuccess: () => { message.success(isEdit ? 'Currency updated' : 'Currency created'); onSaved(); onClose(); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  return (
    <Modal title={isEdit ? `Edit ${currency?.code}` : 'New currency'} open={open} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} confirmLoading={mutation.isPending} okText={isEdit ? 'Save' : 'Create'}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={isEdit ? { name: currency?.name, symbol: currency?.symbol, decimalPlaces: currency?.decimalPlaces, isActive: currency?.isActive } : { decimalPlaces: 2 }}
        onFinish={(v) => mutation.mutate(v)}>
        {!isEdit && <Form.Item name="code" label="ISO code (3 letters)" rules={[{ required: true, len: 3, pattern: /^[A-Za-z]{3}$/ }]}>
          <Input autoFocus maxLength={3} style={{ textTransform: 'uppercase', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
        </Form.Item>}
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="symbol" label="Symbol" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="decimalPlaces" label="Decimal places" rules={[{ required: true }]}><InputNumber min={0} max={4} /></Form.Item>
        {isEdit && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Modal>
  );
}
