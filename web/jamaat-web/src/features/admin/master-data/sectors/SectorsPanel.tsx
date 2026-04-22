import { useState } from 'react';
import { Button, Card, Input, Table, Tag, Space, App as AntdApp, Drawer, Form, Switch, Select, Empty, Dropdown } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, MoreOutlined, HomeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { sectorsApi, subSectorsApi, type Sector, type SubSector } from '../../../sectors/sectorsApi';
import { MemberPicker } from '../../../families/FamilyFormDrawer';
import { extractProblem } from '../../../../shared/api/client';

export function SectorsPanel() {
  const [tab, setTab] = useState<'sectors' | 'sub'>('sectors');
  return (
    <div>
      <Space style={{ marginBlockEnd: 12 }}>
        <Button type={tab === 'sectors' ? 'primary' : 'default'} onClick={() => setTab('sectors')}>Sectors</Button>
        <Button type={tab === 'sub' ? 'primary' : 'default'} onClick={() => setTab('sub')}>Sub-sectors</Button>
      </Space>
      {tab === 'sectors' ? <SectorsList /> : <SubSectorsList />}
    </div>
  );
}

function SectorsList() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sectors', page, search],
    queryFn: () => sectorsApi.list({ page, pageSize: 25, search }),
    placeholderData: keepPreviousData,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => sectorsApi.remove(id),
    onSuccess: () => { message.success('Deactivated.'); void qc.invalidateQueries({ queryKey: ['sectors'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const cols: TableProps<Sector>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 110 },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Male Incharge', dataIndex: 'maleInchargeName', render: (v: string | null) => v ?? '—' },
    { title: 'Female Incharge', dataIndex: 'femaleInchargeName', render: (v: string | null) => v ?? '—' },
    { title: 'Sub-sectors', dataIndex: 'subSectorCount', width: 120 },
    { title: 'Members', dataIndex: 'memberCount', width: 100 },
    { title: 'Status', dataIndex: 'isActive', width: 100, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Active' : 'Inactive'}</Tag> },
    {
      key: 'actions', width: 60,
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Deactivate',
            onClick: () => modal.confirm({ title: 'Deactivate sector?', onOk: () => delMut.mutateAsync(row.id) }) },
        ];
        return <Dropdown menu={{ items }} trigger={['click']}><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      }
    },
  ];

  return (
    <Card style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBlockEnd: '1px solid var(--jm-border)' }}>
        <Input placeholder="Search sectors" prefix={<SearchOutlined />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} style={{ inlineSize: 320 }} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New sector</Button>
      </div>
      <Table rowKey="id" size="middle" loading={isLoading} columns={cols} dataSource={data?.items ?? []}
        onChange={(p) => setPage(p.current ?? 1)}
        pagination={{ current: page, pageSize: 25, total: data?.total ?? 0 }}
        locale={{ emptyText: <Empty image={<HomeOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />} description="No sectors yet" /> }}
      />
      <SectorDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sector={editing} />
    </Card>
  );
}

function SectorDrawer({ open, onClose, sector }: { open: boolean; onClose: () => void; sector: Sector | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!sector;
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => isEdit
      ? sectorsApi.update(sector!.id, {
          name: v.name as string,
          maleInchargeMemberId: (v.maleInchargeMemberId as string) || null,
          femaleInchargeMemberId: (v.femaleInchargeMemberId as string) || null,
          notes: (v.notes as string) || null,
          isActive: (v.isActive as boolean) ?? true,
        })
      : sectorsApi.create({
          code: v.code as string, name: v.name as string,
          maleInchargeMemberId: (v.maleInchargeMemberId as string) || null,
          femaleInchargeMemberId: (v.femaleInchargeMemberId as string) || null,
          notes: (v.notes as string) || null,
        }),
    onSuccess: () => { message.success('Saved.'); void qc.invalidateQueries({ queryKey: ['sectors'] }); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? `Edit sector · ${sector!.code}` : 'New sector'} width={520} destroyOnHidden
      footer={<Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save</Button></Space>}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={sector ?? { isActive: true }}>
        {!isEdit && <Form.Item label="Code" name="code" rules={[{ required: true }]}><Input placeholder="e.g., HATEMI" /></Form.Item>}
        <Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="Male Incharge" name="maleInchargeMemberId">
          <MemberPickerWrapped />
        </Form.Item>
        <Form.Item label="Female Incharge" name="femaleInchargeMemberId">
          <MemberPickerWrapped />
        </Form.Item>
        <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        {isEdit && <Form.Item label="Active" name="isActive" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Drawer>
  );
}

function MemberPickerWrapped({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return <MemberPicker value={value ?? ''} onChange={(v) => onChange?.(v)} />;
}

function SubSectorsList() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sectorFilter, setSectorFilter] = useState<string>();
  const [editing, setEditing] = useState<SubSector | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['subs', page, search, sectorFilter],
    queryFn: () => subSectorsApi.list({ page, pageSize: 25, search, sectorId: sectorFilter }),
    placeholderData: keepPreviousData,
  });
  const sectorsQ = useQuery({ queryKey: ['sectors-all'], queryFn: () => sectorsApi.list({ pageSize: 200 }) });

  const delMut = useMutation({
    mutationFn: (id: string) => subSectorsApi.remove(id),
    onSuccess: () => { message.success('Deactivated.'); void qc.invalidateQueries({ queryKey: ['subs'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const cols: TableProps<SubSector>['columns'] = [
    { title: 'Sector', dataIndex: 'sectorCode', width: 120 },
    { title: 'Code', dataIndex: 'code', width: 100 },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Male Incharge', dataIndex: 'maleInchargeName', render: (v) => v ?? '—' },
    { title: 'Female Incharge', dataIndex: 'femaleInchargeName', render: (v) => v ?? '—' },
    { title: 'Members', dataIndex: 'memberCount', width: 100 },
    { title: 'Status', dataIndex: 'isActive', width: 100, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Active' : 'Inactive'}</Tag> },
    {
      key: 'actions', width: 60,
      render: (_: unknown, row) => (
        <Dropdown menu={{ items: [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Deactivate',
            onClick: () => modal.confirm({ title: 'Deactivate sub-sector?', onOk: () => delMut.mutateAsync(row.id) }) },
        ] }} trigger={['click']}><Button type="text" icon={<MoreOutlined />} /></Dropdown>
      )
    },
  ];

  return (
    <Card style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBlockEnd: '1px solid var(--jm-border)' }}>
        <Input placeholder="Search" prefix={<SearchOutlined />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} style={{ inlineSize: 240 }} />
        <Select allowClear placeholder="Filter by sector" style={{ inlineSize: 200 }} value={sectorFilter} onChange={setSectorFilter}
          options={(sectorsQ.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New sub-sector</Button>
      </div>
      <Table rowKey="id" size="middle" loading={isLoading} columns={cols} dataSource={data?.items ?? []}
        onChange={(p) => setPage(p.current ?? 1)}
        pagination={{ current: page, pageSize: 25, total: data?.total ?? 0 }} />
      <SubSectorDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sub={editing} sectors={sectorsQ.data?.items ?? []} />
    </Card>
  );
}

function SubSectorDrawer({ open, onClose, sub, sectors }: { open: boolean; onClose: () => void; sub: SubSector | null; sectors: Sector[] }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!sub;
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => isEdit
      ? subSectorsApi.update(sub!.id, {
          name: v.name as string,
          maleInchargeMemberId: (v.maleInchargeMemberId as string) || null,
          femaleInchargeMemberId: (v.femaleInchargeMemberId as string) || null,
          notes: (v.notes as string) || null,
          isActive: (v.isActive as boolean) ?? true,
        })
      : subSectorsApi.create({
          sectorId: v.sectorId as string, code: v.code as string, name: v.name as string,
          maleInchargeMemberId: (v.maleInchargeMemberId as string) || null,
          femaleInchargeMemberId: (v.femaleInchargeMemberId as string) || null,
          notes: (v.notes as string) || null,
        }),
    onSuccess: () => { message.success('Saved.'); void qc.invalidateQueries({ queryKey: ['subs'] }); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? `Edit sub-sector · ${sub!.code}` : 'New sub-sector'} width={520} destroyOnHidden
      footer={<Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save</Button></Space>}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={sub ?? { isActive: true }}>
        {!isEdit && (
          <Form.Item label="Sector" name="sectorId" rules={[{ required: true }]}>
            <Select options={sectors.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))} />
          </Form.Item>
        )}
        {!isEdit && <Form.Item label="Code" name="code" rules={[{ required: true }]}><Input /></Form.Item>}
        <Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="Male Incharge" name="maleInchargeMemberId"><MemberPickerWrapped /></Form.Item>
        <Form.Item label="Female Incharge" name="femaleInchargeMemberId"><MemberPickerWrapped /></Form.Item>
        <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        {isEdit && <Form.Item label="Active" name="isActive" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Drawer>
  );
}
