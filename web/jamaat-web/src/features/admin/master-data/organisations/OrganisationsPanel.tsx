import { useState } from 'react';
import { Button, Card, Input, Table, Tag, Space, App as AntdApp, Drawer, Form, Switch, Empty, Dropdown } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, MoreOutlined, HeartOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { organisationsApi, type Organisation } from '../../../organisations/organisationsApi';
import { extractProblem } from '../../../../shared/api/client';

export function OrganisationsPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Organisation | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['orgs', page, search],
    queryFn: () => organisationsApi.list({ page, pageSize: 25, search }),
    placeholderData: keepPreviousData,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => organisationsApi.remove(id),
    onSuccess: () => { message.success('Deactivated.'); void qc.invalidateQueries({ queryKey: ['orgs'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const cols: TableProps<Organisation>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 140 },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Category', dataIndex: 'category', width: 140, render: (v: string | null) => v ?? '-' },
    { title: 'Members', dataIndex: 'memberCount', width: 100 },
    { title: 'Status', dataIndex: 'isActive', width: 100, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Active' : 'Inactive'}</Tag> },
    {
      key: 'actions', width: 60,
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Deactivate',
            onClick: () => modal.confirm({ title: 'Deactivate organisation?', onOk: () => delMut.mutateAsync(row.id) }) },
        ];
        return <Dropdown menu={{ items }} trigger={['click']}><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      }
    },
  ];

  return (
    <Card className="jm-card" styles={{ body: { padding: 0 } }}>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBlockEnd: '1px solid var(--jm-border)' }}>
        <Input placeholder="Search" prefix={<SearchOutlined />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} style={{ inlineSize: 320 }} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New organisation</Button>
      </div>
      <Table rowKey="id" size="middle" loading={isLoading} columns={cols} dataSource={data?.items ?? []}
        onChange={(p) => setPage(p.current ?? 1)}
        pagination={{ current: page, pageSize: 25, total: data?.total ?? 0 }}
        locale={{ emptyText: <Empty image={<HeartOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />} description="No organisations yet" /> }} />
      <OrganisationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} org={editing} />
    </Card>
  );
}

function OrganisationDrawer({ open, onClose, org }: { open: boolean; onClose: () => void; org: Organisation | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!org;
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => isEdit
      ? organisationsApi.update(org!.id, {
          name: v.name as string,
          nameArabic: (v.nameArabic as string) || null,
          category: (v.category as string) || null,
          notes: (v.notes as string) || null,
          isActive: (v.isActive as boolean) ?? true,
        })
      : organisationsApi.create({
          code: v.code as string,
          name: v.name as string,
          nameArabic: (v.nameArabic as string) || undefined,
          category: (v.category as string) || undefined,
          notes: (v.notes as string) || undefined,
        }),
    onSuccess: () => { message.success('Saved.'); void qc.invalidateQueries({ queryKey: ['orgs'] }); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? `Edit Â· ${org!.code}` : 'New organisation'} width={500} destroyOnHidden
      footer={<Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save</Button></Space>}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={org ?? { isActive: true }}>
        {!isEdit && <Form.Item label="Code" name="code" rules={[{ required: true }]}><Input placeholder="e.g., SHABABIL" /></Form.Item>}
        <Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="Name (Arabic)" name="nameArabic"><Input dir="rtl" /></Form.Item>
        <Form.Item label="Category" name="category"><Input placeholder="Committee / Idara / Group" /></Form.Item>
        <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        {isEdit && <Form.Item label="Active" name="isActive" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Drawer>
  );
}
