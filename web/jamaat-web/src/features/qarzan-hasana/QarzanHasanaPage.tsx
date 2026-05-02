import { useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, Empty, Progress, Space } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, BankOutlined, DownloadOutlined } from '@ant-design/icons';
import { downloadServerXlsx } from '../../shared/export/server';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ModuleEmptyState } from '../../shared/ui/ModuleEmptyState';
import { useAuth } from '../../shared/auth/useAuth';
import { formatDate, money } from '../../shared/format/format';
import {
  qarzanHasanaApi, type QhLoan, type QhStatus, type QhScheme,
  QhStatusLabel, QhStatusColor, QhSchemeLabel,
} from './qarzanHasanaApi';

export function QarzanHasanaPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('qh.create');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QhStatus>();
  const [scheme, setScheme] = useState<QhScheme>();
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['qh', page, search, status, scheme],
    queryFn: () => qarzanHasanaApi.list({ page, pageSize: 25, search, status, scheme }),
    placeholderData: keepPreviousData,
  });

  const cols: TableProps<QhLoan>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 150, render: (v: string) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'Borrower', dataIndex: 'memberName', render: (v: string, r) => (
      // Stop click propagation so opening the borrower in their own dashboard doesn't also
      // navigate the row (the row click usually opens the loan detail).
      <Link to={`/dashboards/members/${r.memberId}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 500 }}>{v}</div>
        <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>ITS {r.memberItsNumber}</div>
      </Link>
    ) },
    { title: 'Scheme', dataIndex: 'scheme', width: 160, render: (s: QhScheme) => QhSchemeLabel[s] },
    { title: 'Requested', dataIndex: 'amountRequested', width: 140, align: 'end',
      render: (v: number, r) => <span className="jm-tnum">{money(v, r.currency)}</span> },
    { title: 'Approved', dataIndex: 'amountApproved', width: 140, align: 'end',
      render: (v: number, r) => v > 0 ? <span className="jm-tnum" style={{ fontWeight: 500 }}>{money(v, r.currency)}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
    {
      title: 'Progress', key: 'progress', width: 200,
      render: (_: unknown, r) => r.amountDisbursed > 0 ? (
        <div>
          <Progress percent={Math.min(100, Number(r.progressPercent.toFixed(1)))} size="small"
            status={r.status === 7 ? 'success' : r.status === 8 || r.status === 9 || r.status === 10 ? 'exception' : 'active'} />
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
            Repaid {money(r.amountRepaid, r.currency)} Â· outstanding {money(r.amountOutstanding, r.currency)}
          </div>
        </div>
      ) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span>,
    },
    { title: 'Status', dataIndex: 'status', width: 130, render: (s: QhStatus) => <Tag color={QhStatusColor[s]}>{QhStatusLabel[s]}</Tag> },
    { title: 'Start', dataIndex: 'startDate', width: 110, render: (v: string) => formatDate(v) },
  ];

  const hasActiveFilters = !!(search || status !== undefined || scheme !== undefined);
  const empty = !isLoading && (data?.total ?? 0) === 0;
  const firstRun = empty && !hasActiveFilters;

  return (
    <div>
      <PageHeader
        title="Qarzan Hasana"
        subtitle="Interest-free loans with 2-level approval, guarantors, gold backing and installment repayment tracking."
        actions={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => downloadServerXlsx('/api/v1/qarzan-hasana/export.xlsx', { search, status, scheme } as Record<string, unknown>, `qarzan-hasana_${new Date().toISOString().slice(0, 10)}.xlsx`)}>Export XLSX</Button>
            {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/qarzan-hasana/new')}>New loan application</Button>}
          </Space>
        }
      />

      {firstRun ? (
        <ModuleEmptyState
          icon={<BankOutlined />}
          title="No loan applications yet"
          description="Qarzan Hasana is the Jamaat's interest-free loan facility. Applications go through L1 then L2 approval, with optional guarantors and gold collateral. Repayments come in as receipts against the loan."
          primaryAction={canCreate ? { label: 'New loan application', onClick: () => navigate('/qarzan-hasana/new') } : undefined}
          helpHref="/help"
        />
      ) : (
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBlockEnd: '1px solid var(--jm-border)' }}>
          <Input placeholder="Search code" prefix={<SearchOutlined />} allowClear value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} style={{ inlineSize: 240 }} />
          <Select allowClear placeholder="Status" style={{ inlineSize: 160 }} value={status}
            onChange={(v) => setStatus(v as QhStatus | undefined)}
            options={Object.entries(QhStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          <Select allowClear placeholder="Scheme" style={{ inlineSize: 200 }} value={scheme}
            onChange={(v) => setScheme(v as QhScheme | undefined)}
            options={Object.entries(QhSchemeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>

        <Table rowKey="id" size="middle" loading={isLoading} columns={cols} dataSource={data?.items ?? []}
          onChange={(p) => setPage(p.current ?? 1)}
          pagination={{ current: page, pageSize: 25, total: data?.total ?? 0 }}
          onRow={(row) => ({ onClick: () => navigate(`/qarzan-hasana/${row.id}`), style: { cursor: 'pointer' } })}
          locale={{ emptyText: empty ? (
            <Empty image={<BankOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
              description={
                <div style={{ paddingBlock: 12 }}>
                  <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)' }}>No matches</div>
                  <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 12 }}>No loans match the current filters.</div>
                  <Button onClick={() => { setSearch(''); setStatus(undefined); setScheme(undefined); setPage(1); }}>Clear filters</Button>
                </div>
              } />
          ) : undefined }}
        />
      </Card>
      )}
    </div>
  );
}
