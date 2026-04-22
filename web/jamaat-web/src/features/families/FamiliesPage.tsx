import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Dropdown, Empty, App as AntdApp } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  MoreOutlined,
  EditOutlined,
  TeamOutlined,
  HomeOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate } from '../../shared/format/format';
import { familiesApi, type Family, type FamilyListQuery } from './familiesApi';
import { FamilyFormDrawer } from './FamilyFormDrawer';
import { FamilyDetailDrawer } from './FamilyDetailDrawer';

export function FamiliesPage() {
  const { message } = AntdApp.useApp();

  const [query, setQuery] = useState<FamilyListQuery>({ page: 1, pageSize: 25 });
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Family | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['families', query],
    queryFn: () => familiesApi.list(query),
    placeholderData: keepPreviousData,
  });

  const columns: TableProps<Family>['columns'] = useMemo(() => [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 110,
      render: (v: string) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: 'Family',
      dataIndex: 'familyName',
      key: 'familyName',
      render: (v: string, row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 500, color: 'var(--jm-gray-900)' }}>{v}</span>
          {row.headName && (
            <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
              Head: {row.headName} {row.headItsNumber ? `· ${row.headItsNumber}` : ''}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Members',
      dataIndex: 'memberCount',
      key: 'memberCount',
      width: 110,
      render: (v: number) => (
        <span style={{ color: 'var(--jm-gray-700)' }}>
          <TeamOutlined style={{ marginInlineEnd: 6, color: 'var(--jm-gray-400)' }} />{v}
        </span>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 220,
      render: (_: unknown, row) =>
        row.contactPhone || row.contactEmail
          ? <span style={{ color: 'var(--jm-gray-700)' }}>{row.contactPhone ?? row.contactEmail}</span>
          : <span style={{ color: 'var(--jm-gray-400)' }}>—</span>,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 110,
      render: (active: boolean) =>
        <Tag style={{ margin: 0, background: active ? '#D1FAE5' : '#E5E9EF', color: active ? '#065F46' : '#64748B', border: 'none', fontWeight: 500 }}>
          {active ? 'Active' : 'Inactive'}
        </Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAtUtc',
      key: 'createdAtUtc',
      width: 140,
      render: (v: string) => <span style={{ color: 'var(--jm-gray-600)' }}>{formatDate(v)}</span>,
    },
    {
      key: 'actions',
      width: 64,
      fixed: 'right',
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [
          { key: 'view', icon: <EyeOutlined />, label: 'View members', onClick: () => setDetailId(row.id) },
          { key: 'edit', icon: <EditOutlined />, label: 'Edit details', onClick: () => { setEditing(row); setDrawerOpen(true); } },
        ];
        return (
          <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ], []);

  const onTableChange: TableProps<Family>['onChange'] = (pagination) => {
    setQuery((q) => ({ ...q, page: pagination.current ?? 1, pageSize: pagination.pageSize ?? 25 }));
  };

  const empty = !isLoading && !isError && (data?.total ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title="Families"
        subtitle="Households and their members. The head can pay for the entire family or individual members."
        actions={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>
              Add family
            </Button>
          </Space>
        }
      />

      <Card
        style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBlockEnd: '1px solid var(--jm-border)' }}>
          <Input
            placeholder="Search by family name or code"
            prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
            onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))}
            style={{ inlineSize: 360 }}
          />
          <Select
            allowClear
            placeholder="Active state"
            style={{ inlineSize: 160 }}
            value={query.active as boolean | undefined}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, active: v }))}
            options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]}
          />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>

        <Table<Family>
          rowKey="id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items ?? []}
          onChange={onTableChange}
          pagination={{
            current: query.page, pageSize: query.pageSize, total: data?.total ?? 0,
            showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100],
            showTotal: (total, [from, to]) => `${from}–${to} of ${total}`,
          }}
          onRow={(row) => ({ onClick: () => setDetailId(row.id), style: { cursor: 'pointer' } })}
          locale={{
            emptyText: empty ? (
              <Empty
                image={<HomeOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
                styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No families yet</div>
                    <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>
                      Create a family by picking a head member — other members can then be assigned.
                    </div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                      Add your first family
                    </Button>
                  </div>
                }
              />
            ) : undefined,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <FamilyFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} family={editing} />
      {detailId && <FamilyDetailDrawer familyId={detailId} onClose={() => setDetailId(null)} />}

      {isError && (
        <Card size="small" style={{ marginBlockStart: 16, borderColor: 'var(--jm-danger)' }}>
          <span style={{ color: 'var(--jm-danger)' }}>Failed to load families: {(error as Error).message}</span>
          {void message /* keep message in scope for future use */}
        </Card>
      )}
    </div>
  );
}
