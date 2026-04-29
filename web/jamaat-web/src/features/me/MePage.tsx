import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, Tag, Alert, App as AntdApp, Descriptions } from 'antd';
import { LockOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { api, extractProblem } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/useAuth';

type MeDto = {
  id: string; userName: string; email: string; fullName: string;
  tenantId: string; preferredLanguage?: string | null;
  permissions: string[];
};

export function MePage() {
  const { message } = AntdApp.useApp();
  const { user } = useAuth();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<MeDto>('/api/v1/auth/me')).data,
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const passwordMut = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/auth/change-password', { currentPassword, newPassword });
    },
    onSuccess: () => {
      message.success('Password changed.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    },
    onError: (e) => {
      const p = extractProblem(e);
      message.error(p.detail ?? p.title ?? 'Change failed.');
    },
  });

  const passwordErr = newPassword && confirmPassword && newPassword !== confirmPassword
    ? 'New password and confirmation do not match.' : null;
  const tooShort = newPassword.length > 0 && newPassword.length < 8 ? 'Use at least 8 characters.' : null;

  const me = meQuery.data;
  return (
    <div style={{ maxInlineSize: 760 }}>
      <PageHeader title="My profile" subtitle="View your account, manage your password." />

      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}>
        <Descriptions title="Account" size="small" column={{ xs: 1, sm: 2 }}
          items={[
            { key: 'name', label: 'Full name', children: me?.fullName ?? user?.fullName ?? '-' },
            { key: 'user', label: 'Username', children: me?.userName ?? user?.userName ?? '-' },
            { key: 'email', label: 'Email', children: me?.email ?? '-' },
            { key: 'lang', label: 'Preferred language', children: me?.preferredLanguage ?? 'en' },
            { key: 'tenant', label: 'Tenant id', children: <code style={{ fontSize: 12 }}>{me?.tenantId ?? user?.tenantId}</code>, span: 2 },
          ]}
        />

        <div style={{ marginBlockStart: 24 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Permissions ({me?.permissions.length ?? user?.permissions.length ?? 0})
          </Typography.Text>
          <div style={{ marginBlockStart: 8 }}>
            {(me?.permissions ?? user?.permissions ?? []).map((p) => (
              <Tag key={p} style={{ margin: 2, fontFamily: 'monospace', fontSize: 11 }}>{p}</Tag>
            ))}
          </div>
        </div>
      </Card>

      <Card title={<Space><LockOutlined /> Change password</Space>}
        style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }}>
        <Form layout="vertical" requiredMark={false}
          onFinish={() => {
            if (passwordErr || tooShort) return;
            passwordMut.mutate();
          }}>
          <Form.Item label="Current password" required>
            <Input.Password value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password" placeholder="Your current password" />
          </Form.Item>
          <Form.Item label="New password" required
            validateStatus={tooShort ? 'error' : ''} help={tooShort ?? undefined}>
            <Input.Password value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password" placeholder="At least 8 characters" />
          </Form.Item>
          <Form.Item label="Confirm new password" required
            validateStatus={passwordErr ? 'error' : ''} help={passwordErr ?? undefined}>
            <Input.Password value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password" placeholder="Re-enter the new password" />
          </Form.Item>
          {passwordMut.isError && (
            <Alert type="error" showIcon style={{ marginBlockEnd: 16 }}
              message={extractProblem(passwordMut.error).detail ?? 'Change failed.'} />
          )}
          <Button
            type="primary" htmlType="submit" icon={<SaveOutlined />}
            loading={passwordMut.isPending}
            disabled={!currentPassword || !newPassword || !confirmPassword || !!passwordErr || !!tooShort}
          >
            Change password
          </Button>
        </Form>
      </Card>
    </div>
  );
}
