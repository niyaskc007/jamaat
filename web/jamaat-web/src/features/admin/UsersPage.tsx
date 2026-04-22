import { useState } from 'react';
import { Card, Table, Tag, Button, Input, App as AntdApp, Drawer, Form, Select, Space, Switch } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined, SearchOutlined, ReloadOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { api, extractProblem } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/format/format';

type User = {
  id: string; userName: string; fullName: string; email?: string | null; itsNumber?: string | null;
  roles: string[]; isActive: boolean; preferredLanguage?: string | null; lastLoginAtUtc?: string | null;
};

type Role = { id: string; name: string; description?: string | null; permissions: string[] };

export function UsersPage() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['users', page, search],
    queryFn: async () => (await api.get<{ items: User[]; total: number }>('/api/v1/users', { params: { page, pageSize: 25, search: search || undefined } })).data,
  });

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<Role[]>('/api/v1/roles')).data });

  return (
    <div>
      <PageHeader title="Users & Roles" subtitle="Local users and their role assignments."
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Add user</Button>} />
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8 }}>
          <Input placeholder="Search by email, name" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} onBlur={() => setPage(1)} style={{ inlineSize: 320 }} />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        </div>
        <Table<User>
          rowKey="id" size="middle" loading={isLoading} dataSource={data?.items ?? []}
          pagination={{ current: page, total: data?.total ?? 0, onChange: setPage }}
          columns={[
            { title: 'User', key: 'u', render: (_, row) => (
              <div><div style={{ fontWeight: 500 }}>{row.fullName}</div>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.userName}</div>
              </div>
            ) },
            { title: 'Roles', dataIndex: 'roles', key: 'r', render: (roles: string[]) => (
              <Space size={4} wrap>{roles.map((r) => <Tag key={r} color="blue" style={{ margin: 0 }}>{r}</Tag>)}</Space>
            ) },
            { title: 'Status', dataIndex: 'isActive', key: 's', width: 100,
              render: (v: boolean) => v
                ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
                : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag> },
            { title: 'Last login', dataIndex: 'lastLoginAtUtc', key: 'l', width: 180,
              render: (v?: string | null) => v ? formatDateTime(v) : <span style={{ color: 'var(--jm-gray-400)' }}>Never</span> },
            { title: '', key: 'a', width: 80, render: (_, row) => <Button type="link" onClick={() => { setEditing(row); setDrawerOpen(true); }}>Edit</Button> },
          ]}
          locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><UserSwitchOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No users yet</div> }}
        />
      </Card>
      <UserDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={editing} roles={rolesQuery.data ?? []}
        onSaved={() => { void qc.invalidateQueries({ queryKey: ['users'] }); }} message={message} />
    </div>
  );
}

function UserDrawer({ open, onClose, user, roles, onSaved, message }: { open: boolean; onClose: () => void; user: User | null; roles: Role[]; onSaved: () => void; message: ReturnType<typeof AntdApp.useApp>['message'] }) {
  const isEdit = !!user;
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (isEdit && user) {
        await api.put(`/api/v1/users/${user.id}`, values);
      } else {
        await api.post('/api/v1/users', values);
      }
    },
    onSuccess: () => { message.success(isEdit ? 'User updated' : 'User created'); onSaved(); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <Drawer title={isEdit ? `Edit ${user?.userName}` : 'New user'} open={open} onClose={onClose} width={480} destroyOnHidden
      footer={<Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={mutation.isPending} onClick={() => form.submit()}>{isEdit ? 'Save' : 'Create'}</Button></Space>}
    >
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={isEdit ? { fullName: user?.fullName, itsNumber: user?.itsNumber, isActive: user?.isActive, roles: user?.roles, preferredLanguage: user?.preferredLanguage ?? 'en' } : { isActive: true, roles: ['Counter'], preferredLanguage: 'en' }}
        onFinish={(v) => mutation.mutate(v)}>
        {!isEdit && <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input autoFocus /></Form.Item>}
        <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="itsNumber" label="ITS number"><Input className="jm-tnum" maxLength={8} /></Form.Item>
        {!isEdit && <Form.Item name="password" label="Password" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>}
        <Form.Item name="roles" label="Roles">
          <Select mode="multiple" options={roles.map((r) => ({ value: r.name, label: r.name }))} />
        </Form.Item>
        {isEdit && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Drawer>
  );
}
