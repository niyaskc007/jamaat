import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Tag, Empty, Tree, App as AntdApp, Segmented, Dropdown, Table } from 'antd';
import type { MenuProps, TableColumnsType } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, EditOutlined,
  DeleteOutlined, BookOutlined, FolderOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { AccountTypeLabel } from '../shared';
import { accountsApi, type Account, type AccountTreeNode, type AccountType } from './accountsApi';
import { AccountFormDrawer } from './AccountFormDrawer';

type View = 'tree' | 'list';

export function ChartOfAccountsPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const [view, setView] = useState<View>('tree');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const treeQuery = useQuery({ queryKey: ['accounts', 'tree'], queryFn: accountsApi.tree, enabled: view === 'tree' });
  const listQuery = useQuery({
    queryKey: ['accounts', 'list', { search, type: typeFilter }],
    queryFn: () => accountsApi.list({ page: 1, pageSize: 500, search, type: typeFilter }),
    enabled: view === 'list',
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => accountsApi.remove(id),
    onSuccess: () => { message.success('Account deactivated'); void qc.invalidateQueries({ queryKey: ['accounts'] }); },
    onError: (err) => message.error(extractProblem(err).detail ?? 'Failed'),
  });

  const treeData = useMemo(() => buildAntTree(treeQuery.data ?? [], (n) => {
    setEditing({ id: n.id, code: n.code, name: n.name, type: n.type, parentId: n.parentId ?? null, parentCode: null, isControl: n.isControl, isActive: n.isActive });
    setDrawerOpen(true);
  }, (n) => {
    modal.confirm({
      title: 'Deactivate account?',
      content: `${n.code} · ${n.name} will be marked inactive. Accounts with children cannot be deactivated.`,
      okText: 'Deactivate', okButtonProps: { danger: true },
      onOk: () => deleteMut.mutateAsync(n.id),
    });
  }), [treeQuery.data, modal, deleteMut]);

  const columns: TableColumnsType<Account> = useMemo(() => [
    {
      title: 'Code', dataIndex: 'code', key: 'code', width: 120,
      render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</span>,
    },
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 140, render: (v: AccountType) => <TypeTag type={v} /> },
    { title: 'Parent', dataIndex: 'parentCode', key: 'parent', width: 120,
      render: (v?: string) => v ? <span className="jm-tnum">{v}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
    {
      title: 'Role', key: 'role', width: 110,
      render: (_: unknown, row: Account) => row.isControl
        ? <Tag color="purple" style={{ margin: 0 }}>Control</Tag>
        : <Tag style={{ margin: 0 }}>Posting</Tag>,
    },
    {
      title: 'Status', dataIndex: 'isActive', key: 'isActive', width: 100,
      render: (v: boolean) => v
        ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
        : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag>,
    },
    {
      key: 'actions', width: 56, fixed: 'right',
      render: (_: unknown, row: Account) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          {
            key: 'delete', icon: <DeleteOutlined />, danger: true,
            label: row.isActive ? 'Deactivate' : 'Already inactive', disabled: !row.isActive,
            onClick: () => modal.confirm({ title: 'Deactivate account?', okButtonProps: { danger: true }, onOk: () => deleteMut.mutateAsync(row.id) }),
          },
        ];
        return <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      },
    },
  ], [deleteMut, modal]);

  const treeEmpty = view === 'tree' && !treeQuery.isLoading && (treeQuery.data?.length ?? 0) === 0;
  const listEmpty = view === 'list' && !listQuery.isLoading && (listQuery.data?.total ?? 0) === 0;
  const emptyElement = (
    <Empty
      image={<BookOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
      styles={{ image: { blockSize: 56 } }}
      description={
        <div style={{ paddingBlock: 16 }}>
          <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No accounts yet</div>
          <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>Define your chart of accounts to start posting to the ledger.</div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Create first account</Button>
        </div>
      }
    />
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12, flexWrap: 'wrap' }}>
        <Segmented value={view} onChange={(v) => setView(v as View)} options={[{ label: 'Tree', value: 'tree' }, { label: 'List', value: 'list' }]} />
        <Input placeholder="Search by code or name" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ inlineSize: 320 }} />
        <Select allowClear placeholder="Type" style={{ inlineSize: 160 }} value={typeFilter}
          onChange={(v) => setTypeFilter(v)}
          options={Object.entries(AccountTypeLabel).map(([v, l]) => ({ value: Number(v) as AccountType, label: l }))} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => { view === 'tree' ? treeQuery.refetch() : listQuery.refetch(); }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New account</Button>
      </div>

      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: view === 'tree' ? 16 : 0 } }}>
        {view === 'tree' ? (
          treeEmpty ? emptyElement : (
            <Tree
              treeData={treeData} showLine showIcon defaultExpandAll blockNode
              style={{ fontSize: 13 }}
            />
          )
        ) : (
          <Table<Account> rowKey="id" size="middle" loading={listQuery.isLoading} columns={columns}
            dataSource={listQuery.data?.items ?? []}
            pagination={{ pageSize: 25, showSizeChanger: true }}
            locale={{ emptyText: listEmpty ? emptyElement : undefined }}
            scroll={{ x: 'max-content' }}
          />
        )}
      </Card>

      <AccountFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} account={editing} />
    </>
  );
}

function TypeTag({ type }: { type: AccountType }) {
  const color: Record<AccountType, string> = { 1: 'blue', 2: 'magenta', 3: 'green', 4: 'orange', 5: 'purple', 6: 'gold' };
  return <Tag color={color[type]} style={{ margin: 0 }}>{AccountTypeLabel[type]}</Tag>;
}

type TreeNode = { key: string; title: React.ReactNode; icon?: React.ReactNode; children?: TreeNode[] };

function buildAntTree(nodes: AccountTreeNode[], onEdit: (n: AccountTreeNode) => void, onDelete: (n: AccountTreeNode) => void): TreeNode[] {
  return nodes.map((n) => ({
    key: n.id,
    icon: n.isControl ? <FolderOutlined /> : <FileTextOutlined />,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: 'var(--jm-gray-600)', minInlineSize: 60 }}>{n.code}</span>
        <span style={{ fontWeight: n.isControl ? 600 : 500 }}>{n.name}</span>
        <Tag color={['blue', 'magenta', 'green', 'orange', 'purple', 'gold'][n.type - 1]} style={{ margin: 0 }}>{AccountTypeLabel[n.type]}</Tag>
        {n.isControl && <Tag color="purple" style={{ margin: 0 }}>Control</Tag>}
        {!n.isActive && <Tag style={{ margin: 0 }}>Inactive</Tag>}
        <span style={{ flex: 1 }} />
        <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); onEdit(n); }} />
        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); onDelete(n); }} disabled={!n.isActive} />
      </span>
    ),
    children: buildAntTree(n.children, onEdit, onDelete),
  }));
}
