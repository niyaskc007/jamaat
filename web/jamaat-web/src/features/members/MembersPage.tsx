import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Dropdown, Empty, App as AntdApp } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  ExportOutlined,
  ImportOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate } from '../../shared/format/format';
import { membersApi, MemberStatusLabel, type Member, type MemberListQuery, type MemberStatus } from './membersApi';
import { MemberFormDrawer } from './MemberFormDrawer';
import { extractProblem } from '../../shared/api/client';

export function MembersPage() {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();

  const [query, setQuery] = useState<MemberListQuery>({ page: 1, pageSize: 25, sortBy: 'createdAtUtc', sortDir: 'Desc' });
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['members', query],
    queryFn: () => membersApi.list(query),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => membersApi.remove(id),
    onSuccess: () => { message.success('Member deactivated'); void qc.invalidateQueries({ queryKey: ['members'] }); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to deactivate'); },
  });

  const columns: TableProps<Member>['columns'] = useMemo(() => [
    {
      title: 'ITS',
      dataIndex: 'itsNumber',
      key: 'itsNumber',
      width: 110,
      sorter: true,
      render: (v: string) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: 'Full name',
      dataIndex: 'fullName',
      key: 'fullName',
      sorter: true,
      render: (v: string, row: Member) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <a style={{ fontWeight: 500, color: 'var(--jm-gray-900)' }} onClick={() => navigate(`/members/${row.id}`)}>{v}</a>
          {row.email && <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.email}</span>}
        </div>
      ),
    },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 140, render: (v?: string) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      sorter: true,
      render: (s: MemberStatus) => <StatusTag status={s} />,
    },
    {
      title: 'Created',
      dataIndex: 'createdAtUtc',
      key: 'createdAtUtc',
      width: 140,
      sorter: true,
      render: (v: string) => <span style={{ color: 'var(--jm-gray-600)' }}>{formatDate(v)}</span>,
    },
    {
      key: 'actions',
      width: 64,
      fixed: 'right',
      render: (_: unknown, row: Member) => {
        const items: MenuProps['items'] = [
          { key: 'profile', icon: <UserOutlined />, label: 'Open profile', onClick: () => navigate(`/members/${row.id}`) },
          { key: 'edit', icon: <EditOutlined />, label: 'Quick edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          {
            key: 'deactivate',
            icon: <DeleteOutlined />,
            danger: true,
            label: row.status === 1 ? 'Deactivate' : 'Already inactive',
            disabled: row.status !== 1,
            onClick: () => {
              modal.confirm({
                title: 'Deactivate member?',
                content: `${row.fullName} will be marked inactive. This is reversible — use Edit to change the status back.`,
                okText: 'Deactivate',
                okButtonProps: { danger: true },
                onOk: () => deleteMutation.mutateAsync(row.id),
              });
            },
          },
        ];
        return (
          <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ], [deleteMutation, modal]);

  const onTableChange: TableProps<Member>['onChange'] = (pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    setQuery((q) => ({
      ...q,
      page: pagination.current ?? 1,
      pageSize: pagination.pageSize ?? 25,
      sortBy: (s?.field as string) ?? q.sortBy,
      sortDir: s?.order === 'ascend' ? 'Asc' : s?.order === 'descend' ? 'Desc' : q.sortDir,
    }));
  };

  const empty = !isLoading && !isError && (data?.total ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title={t('nav.members')}
        subtitle="Members synced from the main Jamaat platform plus locally added contacts."
        actions={
          <Space>
            <Button icon={<ImportOutlined />} disabled>Import</Button>
            <Button icon={<ExportOutlined />} disabled>Export</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>
              Add member
            </Button>
          </Space>
        }
      />

      <Card
        style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }}
        styles={{ body: { padding: 0 } }}
      >
        {/* Filter bar */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBlockEnd: '1px solid var(--jm-border)' }}>
          <Input
            placeholder="Search by ITS, name, phone, or email"
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
            placeholder="Status"
            style={{ inlineSize: 160 }}
            value={query.status}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, status: v as MemberStatus | undefined }))}
            options={Object.entries(MemberStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))}
          />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>

        <Table<Member>
          rowKey="id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items ?? []}
          onChange={onTableChange}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 25, 50, 100],
            showTotal: (total, [from, to]) => `${from}–${to} of ${total}`,
          }}
          locale={{
            emptyText: empty ? (
              <Empty
                image={<TeamOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
                styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No members yet</div>
                    <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>
                      Add members manually or import from the main Jamaat platform.
                    </div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                      Add your first member
                    </Button>
                  </div>
                }
              />
            ) : undefined,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <MemberFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} member={editing} />

      {isError && (
        <Card size="small" style={{ marginBlockStart: 16, borderColor: 'var(--jm-danger)' }}>
          <span style={{ color: 'var(--jm-danger)' }}>Failed to load members: {(error as Error).message}</span>
        </Card>
      )}
    </div>
  );
}

function StatusTag({ status }: { status: MemberStatus }) {
  const cfg: Record<MemberStatus, { color: string; bg: string; label: string }> = {
    1: { color: '#065F46', bg: '#D1FAE5', label: 'Active' },
    2: { color: '#64748B', bg: '#E5E9EF', label: 'Inactive' },
    3: { color: '#1E293B', bg: '#F1F4F7', label: 'Deceased' },
    4: { color: '#92400E', bg: '#FEF3C7', label: 'Suspended' },
  };
  const c = cfg[status];
  return <Tag style={{ margin: 0, background: c.bg, color: c.color, border: 'none', fontWeight: 500 }}>{c.label}</Tag>;
}
