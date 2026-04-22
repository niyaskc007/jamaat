import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, Dropdown, Empty, App as AntdApp } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, EditOutlined,
  DeleteOutlined, FieldNumberOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { NumberingScopeLabel } from '../shared';
import { numberingSeriesApi, type NumberingSeries, type NumberingSeriesQuery } from './numberingSeriesApi';
import { NumberingSeriesFormDrawer } from './NumberingSeriesFormDrawer';

export function NumberingSeriesPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const [query, setQuery] = useState<NumberingSeriesQuery>({ page: 1, pageSize: 25 });
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NumberingSeries | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['numberingSeries', query],
    queryFn: () => numberingSeriesApi.list(query),
    placeholderData: keepPreviousData,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => numberingSeriesApi.remove(id),
    onSuccess: () => { message.success('Series deactivated'); void qc.invalidateQueries({ queryKey: ['numberingSeries'] }); },
    onError: (err) => message.error(extractProblem(err).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<NumberingSeries> = useMemo(() => [
    { title: 'Scope', dataIndex: 'scope', key: 'scope', width: 120, render: (v: number) => <Tag color="blue" style={{ margin: 0 }}>{NumberingScopeLabel[v]}</Tag> },
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    {
      title: 'Preview', dataIndex: 'preview', key: 'preview', width: 160,
      render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: 'var(--jm-primary-500)', fontWeight: 600 }}>{v}</span>,
    },
    { title: 'Current', dataIndex: 'currentValue', key: 'currentValue', width: 110, render: (v: number) => <span className="jm-tnum">{v}</span> },
    {
      title: 'Status', dataIndex: 'isActive', key: 'isActive', width: 100,
      render: (v: boolean) => v
        ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
        : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag>,
    },
    {
      key: 'actions', width: 56, fixed: 'right',
      render: (_: unknown, row: NumberingSeries) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          {
            key: 'delete', icon: <DeleteOutlined />, danger: true,
            label: row.isActive ? 'Deactivate' : 'Already inactive', disabled: !row.isActive,
            onClick: () => modal.confirm({ title: 'Deactivate series?', okButtonProps: { danger: true }, onOk: () => deleteMut.mutateAsync(row.id) }),
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
        <Input placeholder="Search by name or prefix" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
          onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))} style={{ inlineSize: 320 }} />
        <Select allowClear placeholder="Scope" style={{ inlineSize: 140 }} value={query.scope}
          onChange={(v) => setQuery((q) => ({ ...q, page: 1, scope: v }))}
          options={Object.entries(NumberingScopeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New series</Button>
      </div>
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<NumberingSeries>
          rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={data?.items ?? []}
          pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total ?? 0, showSizeChanger: true, showTotal: (t, [from, to]) => `${from}–${to} of ${t}` }}
          onChange={(p) => setQuery((q) => ({ ...q, page: p.current ?? 1, pageSize: p.pageSize ?? 25 }))}
          locale={{
            emptyText: empty ? (
              <Empty image={<FieldNumberOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
                styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No numbering series</div>
                    <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>Define receipt / voucher number formats.</div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Create first series</Button>
                  </div>
                } />
            ) : undefined,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
      <NumberingSeriesFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} entity={editing} />
    </>
  );
}
