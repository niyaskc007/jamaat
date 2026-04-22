import { useMemo, useState } from 'react';
import { Card, Input, Table, Tag, Button, Dropdown, App as AntdApp, Drawer, Form, Select, Space, Switch, InputNumber } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { money } from '../../../../shared/format/format';
import { expenseTypesApi, type ExpenseType } from './expenseTypesApi';
import { accountsApi } from '../chart-of-accounts/accountsApi';

export function ExpenseTypesPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseType | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['expenseTypes', page, search],
    queryFn: () => expenseTypesApi.list({ page, pageSize: 25, search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  const accountsQuery = useQuery({ queryKey: ['accounts', 'expense'], queryFn: () => accountsApi.list({ page: 1, pageSize: 500, type: 4 }) });

  const deleteMut = useMutation({
    mutationFn: (id: string) => expenseTypesApi.remove(id),
    onSuccess: () => { message.success('Expense type deactivated'); void qc.invalidateQueries({ queryKey: ['expenseTypes'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<ExpenseType> = useMemo(() => [
    { title: 'Code', dataIndex: 'code', key: 'c', width: 120, render: (v: string) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</span> },
    { title: 'Name', dataIndex: 'name', key: 'n', render: (v: string, row) => (
      <div><div style={{ fontWeight: 500 }}>{v}</div>
        {row.description && <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.description}</div>}
      </div>
    ) },
    { title: 'Debit account', dataIndex: 'debitAccountName', key: 'da', render: (v?: string | null) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>Default (5000)</span> },
    { title: 'Approval', key: 'app', width: 180, render: (_, row) =>
      row.requiresApproval ? <Tag color="orange" style={{ margin: 0 }}>Always required</Tag>
      : row.approvalThreshold ? <Tag color="gold" style={{ margin: 0 }}>&ge; {money(row.approvalThreshold, 'INR')}</Tag>
      : <Tag style={{ margin: 0 }}>No</Tag>
    },
    { title: 'Status', dataIndex: 'isActive', key: 's', width: 100,
      render: (v: boolean) => v
        ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
        : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag> },
    { key: 'a', width: 56, fixed: 'right',
      render: (_, row) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { key: 'delete', icon: <DeleteOutlined />, danger: true, label: row.isActive ? 'Deactivate' : 'Already inactive', disabled: !row.isActive,
            onClick: () => modal.confirm({ title: 'Deactivate?', okButtonProps: { danger: true }, onOk: () => deleteMut.mutateAsync(row.id) }) },
        ];
        return <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      } },
  ], [deleteMut, modal]);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12 }}>
        <Input placeholder="Search code or name" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} onBlur={() => setPage(1)} style={{ inlineSize: 320 }} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New expense type</Button>
      </div>
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<ExpenseType>
          rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={data?.items ?? []}
          pagination={{ current: page, total: data?.total ?? 0, onChange: setPage }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
      <ExpenseTypeDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} et={editing}
        accounts={accountsQuery.data?.items ?? []}
        onSaved={() => { void qc.invalidateQueries({ queryKey: ['expenseTypes'] }); }} message={message} />
    </>
  );
}

function ExpenseTypeDrawer({ open, onClose, et, accounts, onSaved, message }:
  { open: boolean; onClose: () => void; et: ExpenseType | null; accounts: { id: string; code: string; name: string }[]; onSaved: () => void; message: ReturnType<typeof AntdApp.useApp>['message'] }) {
  const isEdit = !!et;
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: async (v: Record<string, unknown>) => isEdit && et ? expenseTypesApi.update(et.id, v as never) : expenseTypesApi.create(v as never),
    onSuccess: () => { message.success(isEdit ? 'Updated' : 'Created'); onSaved(); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  return (
    <Drawer title={isEdit ? `Edit ${et?.code}` : 'New expense type'} open={open} onClose={onClose} width={480} destroyOnHidden
      footer={<Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={mutation.isPending} onClick={() => form.submit()}>{isEdit ? 'Save' : 'Create'}</Button></Space>}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={isEdit ? { name: et?.name, code: et?.code, description: et?.description, debitAccountId: et?.debitAccountId, requiresApproval: et?.requiresApproval, approvalThreshold: et?.approvalThreshold, isActive: et?.isActive } : { requiresApproval: false, isActive: true }}
        onFinish={(v) => mutation.mutate(v)}>
        {!isEdit && <Form.Item name="code" label="Code" rules={[{ required: true, max: 32 }]}><Input autoFocus /></Form.Item>}
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 200 }]}><Input /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="debitAccountId" label="Debit to account">
          <Select allowClear showSearch optionFilterProp="label" placeholder="(Default 5000 Expenses)"
            options={accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
        </Form.Item>
        <Form.Item name="requiresApproval" label="Always requires approval" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="approvalThreshold" label="Approval threshold (auto-approval below)">
          <InputNumber min={0} style={{ inlineSize: 160 }} className="jm-tnum" />
        </Form.Item>
        {isEdit && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Drawer>
  );
}
