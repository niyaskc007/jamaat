import { useState } from 'react';
import { Button, Card, Input, Table, Tag, Space, App as AntdApp, Drawer, Form, Switch, InputNumber, Select, Dropdown } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../../../shared/api/client';
import { extractProblem } from '../../../../shared/api/client';

type Lookup = {
  id: string; category: string; code: string; name: string; nameArabic?: string | null;
  sortOrder: number; isActive: boolean; notes?: string | null; createdAtUtc: string;
};

const lookupsApi = {
  list: async (q: Record<string, unknown>) => (await api.get('/api/v1/lookups', { params: q })).data as { items: Lookup[]; total: number },
  categories: async () => (await api.get('/api/v1/lookups/categories')).data as string[],
  create: async (input: Record<string, unknown>) => (await api.post('/api/v1/lookups', input)).data as Lookup,
  update: async (id: string, input: Record<string, unknown>) => (await api.put(`/api/v1/lookups/${id}`, input)).data as Lookup,
  remove: async (id: string) => { await api.delete(`/api/v1/lookups/${id}`); },
};

export function LookupsPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Lookup | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const categoriesQ = useQuery({ queryKey: ['lookup-categories'], queryFn: lookupsApi.categories });
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['lookups', page, search, category],
    queryFn: () => lookupsApi.list({ page, pageSize: 50, search, category }),
    placeholderData: keepPreviousData,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => lookupsApi.remove(id),
    onSuccess: () => { message.success('Removed.'); void qc.invalidateQueries({ queryKey: ['lookups'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const cols: TableProps<Lookup>['columns'] = [
    { title: 'Category', dataIndex: 'category', width: 200, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'Code', dataIndex: 'code', width: 160 },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Arabic', dataIndex: 'nameArabic', width: 160, render: (v: string | null) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
    { title: 'Order', dataIndex: 'sortOrder', width: 80 },
    { title: 'Status', dataIndex: 'isActive', width: 100, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Active' : 'Inactive'}</Tag> },
    {
      key: 'actions', width: 60,
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Delete',
            onClick: () => modal.confirm({ title: 'Delete lookup?', onOk: () => delMut.mutateAsync(row.id) }) },
        ];
        return <Dropdown menu={{ items }} trigger={['click']}><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      }
    },
  ];

  return (
    <Card className="jm-card" styles={{ body: { padding: 0 } }}>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBlockEnd: '1px solid var(--jm-border)' }}>
        <Input placeholder="Search" prefix={<SearchOutlined />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} style={{ inlineSize: 240 }} />
        <Select allowClear placeholder="Category" style={{ inlineSize: 200 }} value={category} onChange={setCategory}
          options={(categoriesQ.data ?? []).map((c) => ({ value: c, label: c }))} />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New lookup</Button>
      </div>
      <Table rowKey="id" size="middle" loading={isLoading} columns={cols} dataSource={data?.items ?? []}
        onChange={(p) => setPage(p.current ?? 1)}
        pagination={{ current: page, pageSize: 50, total: data?.total ?? 0 }} />
      <LookupDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} lookup={editing} categories={categoriesQ.data ?? []} />
    </Card>
  );
}

function LookupDrawer({ open, onClose, lookup, categories }: { open: boolean; onClose: () => void; lookup: Lookup | null; categories: string[] }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!lookup;
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => isEdit
      ? lookupsApi.update(lookup!.id, {
          name: v.name, nameArabic: v.nameArabic || null,
          sortOrder: v.sortOrder ?? 0, notes: v.notes || null,
          isActive: v.isActive ?? true,
        })
      : lookupsApi.create({
          category: v.category, code: v.code, name: v.name,
          nameArabic: v.nameArabic || undefined, sortOrder: v.sortOrder ?? 0, notes: v.notes || undefined,
        }),
    onSuccess: () => { message.success('Saved.'); void qc.invalidateQueries({ queryKey: ['lookups'] }); void qc.invalidateQueries({ queryKey: ['lookup-categories'] }); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? `Edit lookup Â· ${lookup!.code}` : 'New lookup'} width={460} destroyOnHidden
      footer={<Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save</Button></Space>}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={lookup ?? { isActive: true, sortOrder: 0 }}>
        {!isEdit && (
          <Form.Item label="Category" name="category" rules={[{ required: true }]}>
            <Select showSearch allowClear placeholder="Pick or type"
              options={categories.map((c) => ({ value: c, label: c }))}
              mode="tags" maxCount={1} />
          </Form.Item>
        )}
        {!isEdit && <Form.Item label="Code" name="code" rules={[{ required: true }]}><Input /></Form.Item>}
        <Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="Name (Arabic)" name="nameArabic"><Input dir="rtl" /></Form.Item>
        <Form.Item label="Sort order" name="sortOrder"><InputNumber style={{ inlineSize: '100%' }} /></Form.Item>
        <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        {isEdit && <Form.Item label="Active" name="isActive" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Drawer>
  );
}
