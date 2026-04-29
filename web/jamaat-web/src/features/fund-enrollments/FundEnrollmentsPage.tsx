import { useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, Empty, App as AntdApp, Drawer, Form, DatePicker, Dropdown, Space } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, BankOutlined, GiftOutlined, CheckCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, CheckOutlined, DownloadOutlined } from '@ant-design/icons';
import { downloadServerXlsx } from '../../shared/export/server';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ModuleEmptyState } from '../../shared/ui/ModuleEmptyState';
import { useAuth } from '../../shared/auth/useAuth';
import { Typography } from 'antd';
import { formatDate, money } from '../../shared/format/format';
import { extractProblem, api } from '../../shared/api/client';
import {
  fundEnrollmentsApi, type FundEnrollment, type EnrollmentStatus, type Recurrence,
  RecurrenceLabel, EnrollmentStatusLabel, EnrollmentStatusColor,
} from './fundEnrollmentsApi';
import { fundTypesApi } from '../admin/master-data/fund-types/fundTypesApi';
import { MemberPicker } from '../families/FamilyFormDrawer';

export function FundEnrollmentsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('enrollment.create');
  const canApprove = hasPermission('enrollment.approve');
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus>();
  const [fundFilter, setFundFilter] = useState<string>();
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const bulkApprove = async () => {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const { data: res } = await api.post<{ approvedCount: number; failedCount: number; failedIds: string[] }>(
        '/api/v1/fund-enrollments/bulk/approve',
        { ids: selectedIds }
      );
      const msg = `Approved ${res.approvedCount}${res.failedCount ? ` · ${res.failedCount} failed` : ''}.`;
      message[res.failedCount === 0 ? 'success' : 'warning'](msg);
      setSelectedIds([]);
      await qc.invalidateQueries({ queryKey: ['enrollments'] });
    } catch (e) {
      message.error(extractProblem(e).detail ?? 'Bulk approve failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['enrollments', page, search, status, fundFilter],
    queryFn: () => fundEnrollmentsApi.list({ page, pageSize: 25, search, status, fundTypeId: fundFilter }),
    placeholderData: keepPreviousData,
  });

  const fundsQ = useQuery({
    queryKey: ['fund-types-all-nonloan'],
    queryFn: () => fundTypesApi.list({ pageSize: 200, active: true }).then((r) => ({ ...r, items: r.items.filter((f) => !f.isLoan) })),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => fundEnrollmentsApi.approve(id),
    onSuccess: () => { message.success('Approved.'); void qc.invalidateQueries({ queryKey: ['enrollments'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const pauseMut = useMutation({
    mutationFn: (id: string) => fundEnrollmentsApi.pause(id),
    onSuccess: () => { message.success('Paused.'); void qc.invalidateQueries({ queryKey: ['enrollments'] }); },
  });
  const resumeMut = useMutation({
    mutationFn: (id: string) => fundEnrollmentsApi.resume(id),
    onSuccess: () => { message.success('Resumed.'); void qc.invalidateQueries({ queryKey: ['enrollments'] }); },
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => fundEnrollmentsApi.cancel(id),
    onSuccess: () => { message.success('Cancelled.'); void qc.invalidateQueries({ queryKey: ['enrollments'] }); },
  });

  const cols: TableProps<FundEnrollment>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 110, render: (v: string) => <span className="jm-tnum">{v}</span> },
    { title: 'Member', dataIndex: 'memberName', render: (v: string, row) => <div><div style={{ fontWeight: 500 }}>{v}</div><div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>ITS {row.memberItsNumber}</div></div> },
    { title: 'Fund', dataIndex: 'fundTypeName', width: 160, render: (v: string, row) => `${row.fundTypeCode} - ${v}` },
    { title: 'Sub-type', dataIndex: 'subType', width: 140, render: (v: string | null) => v ?? '-' },
    { title: 'Recurrence', dataIndex: 'recurrence', width: 120, render: (r: Recurrence) => RecurrenceLabel[r] },
    { title: 'Collected', dataIndex: 'totalCollected', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum">{money(v, 'AED')}</span> },
    { title: 'Status', dataIndex: 'status', width: 120,
      render: (s: EnrollmentStatus) => <Tag color={EnrollmentStatusColor[s]}>{EnrollmentStatusLabel[s]}</Tag> },
    { title: 'Start', dataIndex: 'startDate', width: 110, render: (v: string) => formatDate(v) },
    {
      key: 'actions', width: 60,
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [];
        if (row.status === 1) items.push({ key: 'approve', icon: <CheckCircleOutlined />, label: 'Approve', onClick: () => approveMut.mutate(row.id) });
        if (row.status === 2) items.push({ key: 'pause', icon: <PauseCircleOutlined />, label: 'Pause', onClick: () => pauseMut.mutate(row.id) });
        if (row.status === 3) items.push({ key: 'resume', icon: <PlayCircleOutlined />, label: 'Resume', onClick: () => resumeMut.mutate(row.id) });
        if (row.status !== 4 && row.status !== 5) {
          items.push({ type: 'divider' });
          items.push({ key: 'cancel', icon: <StopOutlined />, label: 'Cancel', danger: true,
            onClick: () => modal.confirm({ title: 'Cancel patronage?', onOk: () => cancelMut.mutateAsync(row.id) }) });
        }
        return <Dropdown menu={{ items }} trigger={['click']}><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      },
    },
  ];

  const hasActiveFilters = !!(search || status !== undefined || fundFilter);
  const empty = !isLoading && (data?.total ?? 0) === 0;
  const firstRun = empty && !hasActiveFilters;

  return (
    <div>
      <PageHeader
        title="Patronages"
        subtitle="Long-lived per-member patronage of Sabil, Wajebaat, Mutafariq and Niyaz funds."
        actions={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => downloadServerXlsx('/api/v1/fund-enrollments/export.xlsx', { search, status, fundTypeId: fundFilter } as Record<string, unknown>, `fund-enrollments_${new Date().toISOString().slice(0, 10)}.xlsx`)}>Export XLSX</Button>
            {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>New patronage</Button>}
          </Space>
        }
      />

      {firstRun ? (
        <ModuleEmptyState
          icon={<GiftOutlined />}
          title="No patronages yet"
          description="Register a member as a patron of a fund (Sabil, Wajebaat, Niyaz, etc.) so it becomes selectable on the receipt form. Drafts require approval before they go live."
          primaryAction={canCreate ? { label: 'Create patronage', onClick: () => setDrawerOpen(true) } : undefined}
          helpHref="/help"
        />
      ) : (
      <Card style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBlockEnd: '1px solid var(--jm-border)' }}>
          <Input placeholder="Search code" prefix={<SearchOutlined />} allowClear value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} style={{ inlineSize: 240 }} />
          <Select allowClear placeholder="Status" style={{ inlineSize: 160 }} value={status}
            onChange={(v) => setStatus(v as EnrollmentStatus | undefined)}
            options={Object.entries(EnrollmentStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          <Select allowClear placeholder="Fund type" style={{ inlineSize: 240 }} value={fundFilter} onChange={setFundFilter}
            showSearch optionFilterProp="label"
            options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.nameEnglish}` }))} />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>

        {canApprove && selectedIds.length > 0 && (
          <div style={{
            padding: '8px 16px', background: 'rgba(11,110,99,0.08)',
            borderBlockEnd: '1px solid var(--jm-border)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{selectedIds.length} selected</Typography.Text>
            <Button size="small" type="primary" icon={<CheckOutlined />} loading={bulkBusy} onClick={bulkApprove}>
              Approve {selectedIds.length}
            </Button>
            <Button size="small" onClick={() => setSelectedIds([])}>Clear selection</Button>
          </div>
        )}

        <Table<FundEnrollment> rowKey="id" size="middle" loading={isLoading}
          columns={cols} dataSource={data?.items ?? []}
          onChange={(p) => setPage(p.current ?? 1)}
          rowSelection={canApprove ? {
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as string[]),
            // Only Draft (status=1) rows can be approved - disable selection on the others.
            getCheckboxProps: (row) => ({ disabled: row.status !== 1 }),
            preserveSelectedRowKeys: true,
          } : undefined}
          pagination={{ current: page, pageSize: 25, total: data?.total ?? 0 }}
          locale={{ emptyText: empty ? (
            <Empty image={<BankOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
              description={
                <div style={{ paddingBlock: 12 }}>
                  <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)' }}>No matches</div>
                  <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', marginBlockEnd: 12 }}>No patronages match the current filters.</div>
                  <Button onClick={() => { setSearch(''); setStatus(undefined); setFundFilter(undefined); setPage(1); }}>Clear filters</Button>
                </div>
              } />
          ) : undefined }} />
      </Card>
      )}

      <NewEnrollmentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

function NewEnrollmentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [memberId, setMemberId] = useState('');
  const [fundTypeId, setFundTypeId] = useState<string>();
  const [subType, setSubType] = useState<string>('');
  const [recurrence, setRecurrence] = useState<Recurrence>(5);
  const [startDate, setStartDate] = useState<Dayjs>(dayjs());
  const [notes, setNotes] = useState('');

  const fundsQ = useQuery({
    queryKey: ['fund-types-enrollment-eligible'],
    queryFn: () => fundTypesApi.list({ pageSize: 200, active: true }).then((r) => ({ ...r, items: r.items.filter((f) => !f.isLoan) })),
  });

  const mut = useMutation({
    mutationFn: () => fundEnrollmentsApi.create({
      memberId, fundTypeId: fundTypeId!, subType: subType || undefined,
      recurrence, startDate: startDate.format('YYYY-MM-DD'), notes: notes || undefined,
    }),
    onSuccess: () => { message.success('Patronage created (Draft). Approve to activate.'); void qc.invalidateQueries({ queryKey: ['enrollments'] }); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <Drawer open={open} onClose={onClose} width={520} destroyOnHidden title="New patronage"
      footer={<div style={{ textAlign: 'end' }}><Button onClick={onClose} style={{ marginInlineEnd: 8 }}>Cancel</Button>
        <Button type="primary" loading={mut.isPending} disabled={!memberId || !fundTypeId} onClick={() => mut.mutate()}>Create draft</Button></div>}>
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Member" required><MemberPicker value={memberId} onChange={setMemberId} /></Form.Item>
        <Form.Item label="Fund type" required>
          <Select value={fundTypeId} onChange={setFundTypeId} showSearch optionFilterProp="label"
            options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.nameEnglish}` }))} />
        </Form.Item>
        <Form.Item label="Sub-type" help="Enter the Lookup code (e.g., PROFESSIONAL, LOCAL, LQ).">
          <Input value={subType} onChange={(e) => setSubType(e.target.value)} />
        </Form.Item>
        <Form.Item label="Recurrence">
          <Select value={recurrence} onChange={(v) => setRecurrence(v as Recurrence)}
            options={Object.entries(RecurrenceLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
        </Form.Item>
        <Form.Item label="Start date">
          <DatePicker value={startDate} onChange={(v) => v && setStartDate(v)} style={{ inlineSize: '100%' }} />
        </Form.Item>
        <Form.Item label="Notes"><Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Form.Item>
      </Form>
    </Drawer>
  );
}
