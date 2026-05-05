import { useState } from 'react';
import {
  Card, Table, Tag, Button, Input, App as AntdApp, Drawer, Form, Select, Space, Switch, Tabs,
  Modal, Alert, Typography, Popconfirm, Tooltip,
} from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, UserSwitchOutlined, SafetyCertificateOutlined,
  KeyOutlined, TeamOutlined, HistoryOutlined, CheckCircleOutlined, CloseCircleOutlined, CopyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { api, extractProblem } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/format/format';
import { RolesMatrixPanel } from './roles/RolesMatrixPanel';
import { UserPermissionsPanel } from './roles/UserPermissionsPanel';
import { LoginHistoryView } from '../../shared/ui/LoginHistoryView';

dayjs.extend(relativeTime);

type User = {
  id: string; userName: string; fullName: string; email?: string | null; itsNumber?: string | null;
  roles: string[]; isActive: boolean; preferredLanguage?: string | null; lastLoginAtUtc?: string | null;
  isLoginAllowed?: boolean;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAtUtc?: string | null;
  lastPasswordChangedAtUtc?: string | null;
  phoneE164?: string | null;
  // 'Operator' / 'Member' / 'Hybrid'. May be missing on rows fetched before the 2026-05
  // backend migration; UI treats absence as Operator (the safe default).
  userType?: string | null;
};

type Role = { id: string; name: string; description?: string | null; permissions: string[] };

type LoginAttempt = {
  id: number; userId: string | null; identifier: string; attemptedAtUtc: string; success: boolean;
  failureReason: string | null; ipAddress: string | null; userAgent: string | null;
  geoCountry: string | null; geoCity: string | null;
};

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'users';

  return (
    <div>
      <PageHeader title="Users, Roles & Permissions" subtitle="Local users, role assignments, role × permission matrix, per-user grants, and login history." />
      <Tabs
        activeKey={active}
        onChange={(k) => setParams({ tab: k })}
        items={[
          { key: 'users', label: (<span><TeamOutlined /> Users</span>), children: <UsersTab /> },
          { key: 'matrix', label: (<span><SafetyCertificateOutlined /> Roles &amp; Permissions</span>), children: <RolesMatrixPanel /> },
          { key: 'cross-functional', label: (<span><KeyOutlined /> Cross-functional grants</span>), children: <UserPermissionsPanel /> },
          { key: 'login-history', label: (<span><HistoryOutlined /> Login history</span>), children: <LoginHistoryTab /> },
        ]}
      />
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['users', page, search],
    queryFn: async () => (await api.get<{ items: User[]; total: number }>('/api/v1/users', { params: { page, pageSize: 25, search: search || undefined } })).data,
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<Role[]>('/api/v1/roles')).data });

  const bulkMut = useMutation({
    mutationFn: async (allow: boolean) => {
      await api.post('/api/v1/users/bulk-allow-login', { userIds: selected, allow });
    },
    onSuccess: (_, allow) => {
      message.success(`${selected.length} user${selected.length === 1 ? '' : 's'} ${allow ? 'enabled' : 'disabled'} for login.`);
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Bulk update failed'),
  });

  const onBulk = (allow: boolean) => modal.confirm({
    title: allow ? 'Enable login for selected users?' : 'Disable login for selected users?',
    content: allow
      ? `${selected.length} user${selected.length === 1 ? '' : 's'} will be able to sign in immediately. Make sure they've received their temporary password.`
      : `${selected.length} user${selected.length === 1 ? '' : 's'} will lose the ability to sign in until you re-enable.`,
    okText: allow ? 'Enable login' : 'Disable login',
    okButtonProps: allow ? undefined : { danger: true },
    onOk: () => bulkMut.mutateAsync(allow),
  });

  return (
    <div>
      <div className="jm-section-head">
        <Space>
          {selected.length > 0 && <Typography.Text type="secondary">{selected.length} selected</Typography.Text>}
          {selected.length > 0 && (
            <>
              <Button icon={<CheckCircleOutlined />} onClick={() => onBulk(true)} loading={bulkMut.isPending}>Enable login</Button>
              <Button icon={<CloseCircleOutlined />} danger onClick={() => onBulk(false)} loading={bulkMut.isPending}>Disable login</Button>
            </>
          )}
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Add user</Button>
      </div>
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
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
          columns={[
            { title: 'User', key: 'u', render: (_, row) => (
              <div><div style={{ fontWeight: 500 }}>{row.fullName}</div>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.userName}</div>
              </div>
            ) },
            { title: 'Roles', dataIndex: 'roles', key: 'r', render: (roles: string[]) => (
              <Space size={4} wrap>{roles.map((r) => <Tag key={r} color={r === 'Administrator' ? 'gold' : r === 'Member' ? 'cyan' : 'blue'} style={{ margin: 0 }}>{r}</Tag>)}</Space>
            ) },
            {
              title: 'Login allowed', dataIndex: 'isLoginAllowed', key: 'allow', width: 130,
              render: (v?: boolean, row?: User) => (
                <Tooltip title={v ? 'User can sign in.' : 'User cannot sign in until enabled.'}>
                  <Tag color={v ? 'green' : 'default'} icon={v ? <CheckCircleOutlined /> : <CloseCircleOutlined />} className="jm-status-tag-flush">
                    {v ? 'Allowed' : 'Disabled'}
                  </Tag>
                  {row?.mustChangePassword && <Tag color="orange" className="jm-tag-after">Temp pw</Tag>}
                </Tooltip>
              ),
            },
            { title: 'Status', dataIndex: 'isActive', key: 's', width: 100,
              render: (v: boolean) => v
                ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Active</Tag>
                : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#64748B', border: 'none', fontWeight: 500 }}>Inactive</Tag> },
            { title: 'Last login', dataIndex: 'lastLoginAtUtc', key: 'l', width: 180,
              render: (v?: string | null) => v ? formatDateTime(v) : <span style={{ color: 'var(--jm-gray-400)' }}>Never</span> },
            { title: '', key: 'a', width: 80, render: (_, row) => <Button type="link" onClick={() => { setEditing(row); setDrawerOpen(true); }}>Manage</Button> },
          ]}
          locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><UserSwitchOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No users yet</div> }}
        />
      </Card>
      <UserDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={editing} roles={rolesQuery.data ?? []}
        onSaved={() => { void qc.invalidateQueries({ queryKey: ['users'] }); }} />
    </div>
  );
}

function UserDrawer({ open, onClose, user, roles, onSaved }: {
  open: boolean; onClose: () => void; user: User | null; roles: Role[]; onSaved: () => void;
}) {
  const { message } = AntdApp.useApp();
  const isEdit = !!user;
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('details');

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
    <Drawer title={isEdit ? `Manage · ${user?.fullName}` : 'New user'} open={open} onClose={onClose} width={560} destroyOnHidden
      footer={
        activeTab === 'details'
          ? <Space className="jm-toolbar-end">
              <Button onClick={onClose}>Cancel</Button>
              <Button type="primary" loading={mutation.isPending} onClick={() => form.submit()}>{isEdit ? 'Save' : 'Create'}</Button>
            </Space>
          : <Button onClick={onClose}>Close</Button>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'details', label: 'Details',
            children: (
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
            ),
          },
          ...(isEdit && user ? [
            { key: 'portal-access', label: 'Portal access', children: <PortalAccessPanel user={user} onChanged={onSaved} /> },
            { key: 'temp-password', label: 'Temp password', children: <TempPasswordPanel user={user} onChanged={onSaved} /> },
            { key: 'login-history', label: 'Login history', children: <UserLoginHistoryPanel userId={user.id} /> },
          ] : []),
        ]}
      />
    </Drawer>
  );
}

/// Portal Access panel — surfaces the member-portal status of a user in one place:
/// audience type (Operator/Member/Hybrid), login-allowed flag, must-change-password,
/// last login, with a one-click "Send welcome email" action that issues a fresh temp
/// password + emails the user the credentials. Replaces having to hunt across the
/// existing tabs to figure out whether a member can actually sign in.
function PortalAccessPanel({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const userType = (user.userType ?? 'Operator') as 'Operator' | 'Member' | 'Hybrid';
  const canPortal = userType === 'Member' || userType === 'Hybrid';

  const setTypeMut = useMutation({
    mutationFn: async (t: 'Operator' | 'Member' | 'Hybrid') =>
      (await api.put(`/api/v1/users/${user.id}/user-type`, { userType: t })).data,
    onSuccess: () => {
      message.success('Audience type updated.');
      onChanged();
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to update user type'),
  });

  const sendWelcomeMut = useMutation({
    mutationFn: async () =>
      (await api.post<{ plaintext: string; expiresAtUtc: string | null }>(`/api/v1/users/${user.id}/send-welcome`)).data,
    onSuccess: (data) => {
      message.success('Welcome email queued. Temp password rotated.');
      onChanged();
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['user-temp-pw', user.id] });
      // Show the plaintext briefly in case email delivery is in log-only mode.
      Modal.info({
        title: 'Welcome email sent',
        content: (
          <div>
            <Typography.Paragraph>
              Temporary password (also emailed to the user):
            </Typography.Paragraph>
            <code style={{ display: 'block', padding: 12, background: '#F5F5F5', borderRadius: 6, fontSize: 14, wordBreak: 'break-all' }}>
              {data.plaintext}
            </code>
            <Typography.Paragraph type="secondary" style={{ marginBlockStart: 12, fontSize: 12 }}>
              The user must change this on first login. Expires {data.expiresAtUtc ? new Date(data.expiresAtUtc).toLocaleString() : 'soon'}.
            </Typography.Paragraph>
          </div>
        ),
      });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to send welcome email'),
  });

  return (
    <div>
      <Alert
        type="info" showIcon
        message="Portal access controls"
        description={
          <ul className="jm-bullets-flush">
            <li><b>Operator</b>: staff/admin. Lands on /dashboard after login.</li>
            <li><b>Member</b>: member-portal user. Lands on /portal/me. Should also have the "Member" role for granular permissions.</li>
            <li><b>Hybrid</b>: both. Defaults to /dashboard with a "Switch to member portal" link in the avatar menu.</li>
            <li>The seeder reconciles this from role membership on each boot — manual overrides set here may be reverted unless role membership matches.</li>
          </ul>
        }
      />

      <Card size="small" className="jm-card" style={{ marginBlockStart: 16 }}>
        <Typography.Text type="secondary" className="jm-overline">Audience type</Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBlockStart: 8 }}>
          <Select
            value={userType}
            onChange={(t) => setTypeMut.mutate(t)}
            style={{ inlineSize: 200 }}
            options={[
              { value: 'Operator', label: 'Operator' },
              { value: 'Member', label: 'Member' },
              { value: 'Hybrid', label: 'Hybrid' },
            ]}
          />
          {setTypeMut.isPending && <Typography.Text type="secondary">Saving…</Typography.Text>}
        </div>
      </Card>

      <Card size="small" className="jm-card" style={{ marginBlockStart: 16 }}>
        <Typography.Text type="secondary" className="jm-overline">Login readiness</Typography.Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBlockStart: 8 }}>
          <div>
            <Tag color={user.isLoginAllowed ? 'green' : 'default'}>
              {user.isLoginAllowed ? 'Login allowed' : 'Login disabled'}
            </Tag>
            <Tag color={user.mustChangePassword ? 'gold' : 'blue'}>
              {user.mustChangePassword ? 'Must change password' : 'Has set their own password'}
            </Tag>
            <Tag color={user.isActive ? 'green' : 'red'}>
              {user.isActive ? 'Active' : 'Inactive'}
            </Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Last login: {user.lastLoginAtUtc ? new Date(user.lastLoginAtUtc).toLocaleString() : 'never'}
          </Typography.Text>
        </div>
      </Card>

      <Card size="small" className="jm-card" style={{ marginBlockStart: 16 }}>
        <Typography.Text type="secondary" className="jm-overline">Welcome email</Typography.Text>
        <Typography.Paragraph style={{ marginBlockStart: 8, marginBlockEnd: 12 }}>
          Issues a fresh temporary password, flips MustChangePassword=true, and emails
          the user with sign-in instructions. Use this for <b>first-time onboarding</b> or
          when a member has lost their welcome email. {!canPortal && <em>(This user is currently {userType} — they will receive the email but should be flipped to Member or Hybrid first if they need portal access.)</em>}
        </Typography.Paragraph>
        <Popconfirm
          title="Send welcome email?"
          description="A fresh temp password will replace any existing one."
          onConfirm={() => sendWelcomeMut.mutate()}
          okText="Send"
          okType="primary"
        >
          <Button type="primary" loading={sendWelcomeMut.isPending}>Send welcome email</Button>
        </Popconfirm>
      </Card>
    </div>
  );
}

/// Phase B2 frontend - shows the active temp password (if any), with Copy + Re-issue.
function TempPasswordPanel({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const tempQ = useQuery({
    queryKey: ['user-temp-pw', user.id],
    queryFn: async () => {
      try {
        const r = await api.get<{ plaintext: string; expiresAtUtc: string | null; mustChangePassword: boolean }>(`/api/v1/users/${user.id}/temp-password`);
        return r.data;
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status;
        if (status === 404) return null;
        throw e;
      }
    },
    enabled: !!user.id,
  });

  const issueMut = useMutation({
    mutationFn: async () => (await api.post<{ plaintext: string; expiresAtUtc: string | null }>(`/api/v1/users/${user.id}/issue-temp-password`)).data,
    onSuccess: () => {
      message.success('Temporary password issued.');
      onChanged();
      void qc.invalidateQueries({ queryKey: ['user-temp-pw', user.id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to issue temp password'),
  });

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text)
      .then(() => message.success('Temp password copied.'))
      .catch(() => message.error("Couldn't copy."));
  };

  return (
    <div>
      <Alert
        type="info" showIcon
        className="jm-temppw-howto"
        message="How temporary passwords work"
        description={
          <ul className="jm-bullets-flush">
            <li>System generates a cryptographically random one-time password.</li>
            <li>The user must change it on first login.</li>
            <li>Re-issuing creates a fresh password and resets the expiry.</li>
            <li>The plaintext is wiped the moment the user changes it.</li>
          </ul>
        }
      />

      {tempQ.isLoading ? null : tempQ.data ? (
        <Card size="small" className="jm-card jm-temppw-card">
          <Typography.Text type="secondary" className="jm-overline">Active temporary password</Typography.Text>
          <div className="jm-temppw-row">
            <code className="jm-temppw-plaintext">{tempQ.data.plaintext}</code>
            <Button icon={<CopyOutlined />} onClick={() => copy(tempQ.data!.plaintext)}>Copy</Button>
          </div>
          {tempQ.data.expiresAtUtc && (
            <Typography.Text type="secondary" className="jm-temppw-expiry">
              Expires {dayjs(tempQ.data.expiresAtUtc).format('DD MMM YYYY HH:mm')} ({dayjs(tempQ.data.expiresAtUtc).fromNow()}).
            </Typography.Text>
          )}
        </Card>
      ) : (
        <Card size="small" className="jm-card jm-temppw-card">
          <Typography.Text type="secondary">
            No active temporary password. The user has either rotated to a permanent password, or never had one issued.
          </Typography.Text>
        </Card>
      )}

      <Popconfirm
        title="Issue a new temporary password?"
        description={tempQ.data ? "The previous temp password will be invalidated immediately." : 'Issuing forces the user to change their password on next login.'}
        onConfirm={() => issueMut.mutateAsync()}
        okText="Issue"
        cancelText="Cancel"
      >
        <Button type="primary" icon={<KeyOutlined />} loading={issueMut.isPending}>
          {tempQ.data ? 'Re-issue temporary password' : 'Issue temporary password'}
        </Button>
      </Popconfirm>
    </div>
  );
}

/// Phase B4 frontend (per-user) - login history limited to this user. Uses the shared
/// LoginHistoryView so admin per-user, admin tenant-wide and the member's own page all share
/// the same polished + mobile-responsive layout (KPIs, spark histogram, filters, CSV export
/// where appropriate).
function UserLoginHistoryPanel({ userId }: { userId: string }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-login-history', userId],
    queryFn: async () => (await api.get<LoginAttempt[]>(`/api/v1/users/${userId}/login-history?max=50`)).data,
  });
  return <LoginHistoryView rows={data ?? []} loading={isLoading} scope="user" onRefresh={() => refetch()} />;
}

/// Phase B4 frontend (tenant-wide) - new tab on the Users page.
function LoginHistoryTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tenant-login-history'],
    queryFn: async () => (await api.get<LoginAttempt[]>('/api/v1/users/login-history?max=200')).data,
  });
  return <LoginHistoryView rows={data ?? []} loading={isLoading} scope="tenant" onRefresh={() => refetch()} />;
}
