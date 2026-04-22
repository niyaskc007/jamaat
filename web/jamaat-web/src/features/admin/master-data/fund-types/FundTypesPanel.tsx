import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Dropdown, Empty, App as AntdApp } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, EditOutlined,
  DeleteOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { paymentModeFlagsToLabels } from '../shared';
import { fundTypesApi, FundCategoryLabel, FundCategoryColor, type FundType, type FundTypeQuery, type FundCategory } from './fundTypesApi';
import { FundTypeFormDrawer } from './FundTypeFormDrawer';

export function FundTypesPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const [query, setQuery] = useState<FundTypeQuery>({ page: 1, pageSize: 25, sortBy: 'nameEnglish', sortDir: 'Asc' });
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<FundType | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['fundTypes', query],
    queryFn: () => fundTypesApi.list(query),
    placeholderData: keepPreviousData,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => fundTypesApi.remove(id),
    onSuccess: () => { message.success('Fund type deactivated'); void qc.invalidateQueries({ queryKey: ['fundTypes'] }); },
    onError: (err) => message.error(extractProblem(err).detail ?? 'Failed'),
  });

  const columns: TableColumnsType<FundType> = useMemo(() => [
    {
      title: 'Code', dataIndex: 'code', key: 'code', width: 120, sorter: true,
      render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</span>,
    },
    {
      title: 'Name', dataIndex: 'nameEnglish', key: 'nameEnglish', sorter: true,
      render: (v: string, row) => (
        <div>
          <div style={{ fontWeight: 500, color: 'var(--jm-gray-900)' }}>{v}</div>
          {row.description && <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.description}</div>}
        </div>
      ),
    },
    {
      title: 'Category', dataIndex: 'category', key: 'category', width: 160,
      render: (c: FundCategory) => <Tag color={FundCategoryColor[c]} style={{ margin: 0 }}>{FundCategoryLabel[c]}</Tag>,
    },
    {
      title: 'Payment modes', dataIndex: 'allowedPaymentModes', key: 'modes', width: 260,
      render: (v: number) => (
        <Space size={4} wrap>{paymentModeFlagsToLabels(v).map((l) => <Tag key={l} style={{ margin: 0 }}>{l}</Tag>)}</Space>
      ),
    },
    {
      title: 'Rules', key: 'rules', width: 200,
      render: (_: unknown, row: FundType) => (
        <Space size={4} wrap>
          {row.requiresItsNumber && <Tag color="blue" style={{ margin: 0 }}>ITS required</Tag>}
          {row.requiresPeriodReference && <Tag color="gold" style={{ margin: 0 }}>Period ref</Tag>}
        </Space>
      ),
    },
    {
      title: 'Status', dataIndex: 'isActive', key: 'isActive', width: 100,
      render: (v: boolean) => v
        ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
        : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag>,
    },
    {
      key: 'actions', width: 56, fixed: 'right',
      render: (_: unknown, row: FundType) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          {
            key: 'delete', icon: <DeleteOutlined />, danger: true,
            label: row.isActive ? 'Deactivate' : 'Already inactive', disabled: !row.isActive,
            onClick: () => modal.confirm({
              title: 'Deactivate fund type?',
              content: `${row.nameEnglish} will be marked inactive. This is reversible — use Edit.`,
              okText: 'Deactivate', okButtonProps: { danger: true },
              onOk: () => deleteMut.mutateAsync(row.id),
            }),
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
        <Input
          placeholder="Search by code or name"
          prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />}
          allowClear value={search} onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
          onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))}
          style={{ inlineSize: 320 }}
        />
        <Select allowClear placeholder="Status" style={{ inlineSize: 140 }}
          value={query.active === undefined ? undefined : query.active ? 'active' : 'inactive'}
          onChange={(v) => setQuery((q) => ({ ...q, page: 1, active: v === undefined ? undefined : v === 'active' }))}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
        />
        <Select allowClear placeholder="Category" style={{ inlineSize: 180 }}
          value={query.category}
          onChange={(v) => setQuery((q) => ({ ...q, page: 1, category: v as FundCategory | undefined }))}
          options={Object.entries(FundCategoryLabel).map(([v, l]) => ({ value: Number(v) as FundCategory, label: l }))}
        />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New fund type</Button>
      </div>

      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<FundType>
          rowKey="id" size="middle" loading={isLoading} columns={columns}
          dataSource={data?.items ?? []}
          onChange={(p, _f, s) => {
            const sorter = Array.isArray(s) ? s[0] : s;
            setQuery((q) => ({
              ...q,
              page: p.current ?? 1, pageSize: p.pageSize ?? 25,
              sortBy: (sorter?.field as string) ?? q.sortBy,
              sortDir: sorter?.order === 'ascend' ? 'Asc' : sorter?.order === 'descend' ? 'Desc' : q.sortDir,
            }));
          }}
          pagination={{
            current: query.page, pageSize: query.pageSize, total: data?.total ?? 0,
            showSizeChanger: true, showTotal: (t, [from, to]) => `${from}–${to} of ${t}`,
          }}
          locale={{
            emptyText: empty ? (
              <Empty
                image={<DatabaseOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
                styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No fund types yet</div>
                    <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>Define Niyaz, Darees, Madrasa, etc.</div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Create first fund type</Button>
                  </div>
                }
              />
            ) : undefined,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <FundTypeFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} fundType={editing} />
    </>
  );
}
