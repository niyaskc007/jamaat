import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, Empty, Progress, Space } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, HeartOutlined, DownloadOutlined } from '@ant-design/icons';
import { downloadServerXlsx } from '../../shared/export/server';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ModuleEmptyState } from '../../shared/ui/ModuleEmptyState';
import { useAuth } from '../../shared/auth/useAuth';
import { formatDate, money } from '../../shared/format/format';
import {
  commitmentsApi,
  type Commitment,
  type CommitmentListQuery,
  type CommitmentStatus,
  type CommitmentPartyType,
  StatusLabel,
  StatusColor,
  PartyTypeLabel,
  FrequencyLabel,
} from './commitmentsApi';

export function CommitmentsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('commitment.create');
  const [query, setQuery] = useState<CommitmentListQuery>({ page: 1, pageSize: 25 });
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['commitments', query],
    queryFn: () => commitmentsApi.list(query),
    placeholderData: keepPreviousData,
  });

  const columns: TableProps<Commitment>['columns'] = useMemo(() => [
    {
      title: 'Code',
      dataIndex: 'code',
      width: 110,
      render: (v: string) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: 'Party',
      dataIndex: 'partyName',
      render: (v: string, row) => {
        // Member-party commitments link to the per-member dashboard; family-party commitments
        // link to the family page. Either way, stop propagation so the row's open-detail
        // handler doesn't fire on top of the navigation.
        const target = row.memberId ? `/dashboards/members/${row.memberId}`
          : row.familyId ? `/families/${row.familyId}` : null;
        const inner = (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 500, color: 'var(--jm-gray-900)' }}>{v}</span>
            <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
              {PartyTypeLabel[row.partyType]}
              {row.memberItsNumber ? ` · ITS ${row.memberItsNumber}` : ''}
              {row.familyCode ? ` · ${row.familyCode}` : ''}
            </span>
          </div>
        );
        return target
          ? <Link to={target} onClick={(e) => e.stopPropagation()}>{inner}</Link>
          : inner;
      },
    },
    {
      title: 'Fund',
      dataIndex: 'fundTypeName',
      width: 160,
      render: (v: string, row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span>{v}</span>
          <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.fundTypeCode}</span>
        </div>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'totalAmount',
      width: 140,
      align: 'end',
      render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, row.currency)}</span>,
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 200,
      render: (_: unknown, row) => (
        <div>
          <Progress
            percent={Math.min(100, Number(row.progressPercent.toFixed(1)))}
            size="small"
            status={row.status === 3 ? 'success' : row.status === 4 || row.status === 5 ? 'exception' : 'active'}
            strokeColor={row.status === 3 ? undefined : '#0E5C40'}
          />
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
            {money(row.paidAmount, row.currency)} of {money(row.totalAmount, row.currency)}
          </div>
        </div>
      ),
    },
    {
      title: 'Schedule',
      key: 'schedule',
      width: 160,
      render: (_: unknown, row) => (
        <span style={{ fontSize: 13, color: 'var(--jm-gray-700)' }}>
          {row.numberOfInstallments} × {FrequencyLabel[row.frequency]}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (s: CommitmentStatus) => <Tag color={StatusColor[s]} style={{ margin: 0 }}>{StatusLabel[s]}</Tag>,
    },
    {
      title: 'Start',
      dataIndex: 'startDate',
      width: 110,
      render: (v: string) => <span style={{ color: 'var(--jm-gray-600)' }}>{formatDate(v)}</span>,
    },
  ], []);

  const hasActiveFilters = !!(query.search || query.status !== undefined || query.partyType !== undefined);
  const empty = !isLoading && !isError && (data?.total ?? 0) === 0;
  const firstRun = empty && !hasActiveFilters;

  return (
    <div>
      <PageHeader
        title="Commitments"
        subtitle="Pledges against fund types, tracked through scheduled installments until fully paid or waived."
        actions={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => downloadServerXlsx('/api/v1/commitments/export.xlsx', query as Record<string, unknown>, `commitments_${new Date().toISOString().slice(0, 10)}.xlsx`)}>Export XLSX</Button>
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/commitments/new')}>
                New commitment
              </Button>
            )}
          </Space>
        }
      />

      {firstRun ? (
        <ModuleEmptyState
          icon={<HeartOutlined />}
          title="No commitments yet"
          description="A commitment is a pledge from a member or family - usually multiple instalments against a fund. Receipts allocated here close out instalments automatically."
          primaryAction={canCreate ? { label: 'Create your first commitment', onClick: () => navigate('/commitments/new') } : undefined}
          helpHref="/help"
        />
      ) : (
      <Card
        style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBlockEnd: '1px solid var(--jm-border)' }}>
          <Input
            placeholder="Search by code or party name"
            prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
            onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))}
            style={{ inlineSize: 360 }}
          />
          <Select
            allowClear placeholder="Status" style={{ inlineSize: 160 }}
            value={query.status}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, status: v as CommitmentStatus | undefined }))}
            options={Object.entries(StatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))}
          />
          <Select
            allowClear placeholder="Party type" style={{ inlineSize: 160 }}
            value={query.partyType}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, partyType: v as CommitmentPartyType | undefined }))}
            options={Object.entries(PartyTypeLabel).map(([v, l]) => ({ value: Number(v), label: l }))}
          />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>

        <Table<Commitment>
          rowKey="id" size="middle"
          loading={isLoading} columns={columns} dataSource={data?.items ?? []}
          onChange={(p) => setQuery((q) => ({ ...q, page: p.current ?? 1, pageSize: p.pageSize ?? 25 }))}
          pagination={{
            current: query.page, pageSize: query.pageSize, total: data?.total ?? 0,
            showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100],
            showTotal: (total, [from, to]) => `${from}–${to} of ${total}`,
          }}
          onRow={(row) => ({ onClick: () => navigate(`/commitments/${row.id}`), style: { cursor: 'pointer' } })}
          locale={{
            emptyText: empty ? (
              <Empty
                image={<HeartOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
                styles={{ image: { blockSize: 56 } }}
                description={
                  <div style={{ paddingBlock: 16 }}>
                    <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No matches</div>
                    <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 16 }}>
                      No commitments match the current filters. Try clearing them.
                    </div>
                    <Button onClick={() => { setSearch(''); setQuery({ page: 1, pageSize: 25 }); }}>Clear filters</Button>
                  </div>
                }
              />
            ) : undefined,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
      )}

      {isError && (
        <Card size="small" style={{ marginBlockStart: 16, borderColor: 'var(--jm-danger)' }}>
          <span style={{ color: 'var(--jm-danger)' }}>Failed to load commitments: {(error as Error).message}</span>
        </Card>
      )}
    </div>
  );
}
