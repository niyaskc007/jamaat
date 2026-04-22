import type { ReactNode } from 'react';
import { Result, Button, Tag, Typography, Space } from 'antd';
import { LockOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';

type Props = {
  /// The user needs at least ONE of these permissions to view the route.
  /// Pass an empty array to allow any signed-in user (equivalent to no guard).
  anyOf: string[];
  children: ReactNode;
};

/// Route-level guard that renders a friendly 403 screen when the user lacks the
/// required permissions. Used by deep-linked URLs — e.g. a viewer who types
/// `/admin/users` directly should see this screen, not a half-broken page.
export function RequirePermission({ anyOf, children }: Props) {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  if (anyOf.length === 0 || anyOf.some(hasPermission)) {
    return <>{children}</>;
  }

  return (
    <Result
      icon={<LockOutlined style={{ color: 'var(--jm-gray-400)' }} />}
      status="info"
      title="You don't have access to this page"
      subTitle={
        <Space direction="vertical" size={8} style={{ alignItems: 'center' }}>
          <Typography.Text type="secondary">
            This module requires one of the following permissions:
          </Typography.Text>
          <div>
            {anyOf.map((p) => (
              <Tag key={p} color="default" style={{ margin: 2, fontFamily: 'monospace' }}>
                {p}
              </Tag>
            ))}
          </div>
          {user && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Signed in as <strong>{user.fullName ?? user.userName}</strong>. Ask an administrator to grant access.
            </Typography.Text>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button type="primary" onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
          <Button icon={<QuestionCircleOutlined />} onClick={() => navigate('/help')}>Open Help</Button>
        </Space>
      }
    />
  );
}
