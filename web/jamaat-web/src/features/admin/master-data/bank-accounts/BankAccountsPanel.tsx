import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, Dropdown, Empty, App as AntdApp } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, EditOutlined,
  DeleteOutlined, BankOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { bankAccountsApi, type BankAccount, type BankAccountQuery } from './bankAccountsApi';
import { BankAccountFormDrawer } from './BankAccountFormDrawer';

export function BankAccountsPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const [query, setQuery] = useState<BankAccountQuery>({ page: 1, pageSize: 25 });
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['bankAccounts', query],
    queryFn: () => bankAccountsApi.list(query),
    placeholderData: keepPreviousData,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => bankAccountsApi.remove(id),
    onSuccess: () => { message.success('Bank account deactivated'); void qc.invalidateQueries({ queryKey: ['bankAccounts'] }); },
    onError: (err) => message.error(extractProblem(err).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<BankAccount> = useMemo(() => [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v, row) => (
      <div><div style={{ fontWeight: 500 }}>{v}</div>
        <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.bankName}{row.branch ? ` · ${row.branch}` : ''}</div>
      </div>
    ) },
    { title: 'Account no.', dataIndex: 'accountNumber', key: 'accountNumber', width: 200,
      render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v}</span> },
    { title: 'Currency', dataIndex: 'currency', key: 'currency', width: 100, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    { title: 'IFSC', dataIndex: 'ifsc', key: 'ifsc', width: 140, render: (v?: string) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
    {
      title: 'Status', dataIndex: 'isActive', key: 'isActive', width: 100,
      render: (v: boolean) => v
        ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
        : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag>,
    },
    {
      key: 'actions', width: 56, fixed: 'right',
      render: (_: unknown, row: BankAccount) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          {
            key: 'delete', icon: <DeleteOutlined />, danger: true,
            label: row.isActive ? 'Deactivate' : 'Already inactive', disabled: !row.isActive,
            onClick: () => modal.confirm({ title: 'Deactivate bank account?', okButtonProps: { danger: true }, onOk: () => deleteMut.mutateAsync(row.id) }),
          },
        ];
        return <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      },
    },
  ], [deleteMut, modal]);

  const empty = !isLoading && (data?.total ?? 0) === 0;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12 }}>
        <Input placeholder="Search by name, bank or account number" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
          onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))} style={{ inlineSize: 360 }} />
        <Select allowClear placeholder="Status" style={{ inlineSize: 140 }}
          value={query.active === undefined ? undefined : query.active ? 'active' : 'inactive'}
          onChange={(v) => setQuery((q) => ({ ...q, page: 1, active: v === undefined ? undefined : v === 'active' }))}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New bank account</Button>
      </div>
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<BankAccount>
          rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={data?.items ?? []}
          pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total ?? 0, showSizeChanger: true, showTotal: (t, [from, to]) => `${from}–${to} of ${t}` }}
          onChange={(p) => setQuery((q) => ({ ...q, page: p.current ?? 1, pageSize: p.pageSize ?? 25 }))}
          locale={{
            emptyText: empty ? (
              <Empty image={<BankOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />} styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No bank accounts</div>
                    <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>Register the bank accounts you receive into.</div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Create first bank account</Button>
                  </div>
                } />
            ) : undefined,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
      <BankAccountFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} entity={editing} />
    </>
  );
}
