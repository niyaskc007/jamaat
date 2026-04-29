import { useMemo, useState } from 'react';
import { Card, Select, Spin, Empty, Alert, Tag, Space, Button, App as AntdApp, Checkbox, Typography, Divider } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api, extractProblem } from '../../../shared/api/client';
import { rolesApi, groupPermissions } from './rolesApi';

type UserListItem = {
  id: string; userName: string; fullName: string; email?: string | null;
  roles: string[]; isActive: boolean;
};

/// Cross-functional grants: pick a user, see what they get from their roles vs. what's granted
/// directly, and toggle direct grants. Useful for one-off permissions (e.g. give a Counter user
/// `voucher.approve` for a holiday cover) without changing their role membership.
export function UserPermissionsPanel() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [userId, setUserId] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ['users-for-permissions'],
    queryFn: async () => (await api.get<{ items: UserListItem[]; total: number }>('/api/v1/users', { params: { page: 1, pageSize: 200 } })).data,
  });

  const permsQ = useQuery({ queryKey: ['permissions-all'], queryFn: rolesApi.allPermissions });
  const rolesQ = useQuery({ queryKey: ['roles-detailed'], queryFn: rolesApi.list });

  const detailQ = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => userId ? rolesApi.userPermissions(userId) : Promise.resolve(null),
    enabled: !!userId,
  });

  // Permissions inherited via roles (so the UI can show them as "from role: X" — read-only).
  const fromRoles = useMemo(() => {
    if (!detailQ.data || !rolesQ.data) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const rn of detailQ.data.roles) {
      const r = rolesQ.data.find((x) => x.name === rn);
      if (!r) continue;
      for (const p of r.permissions) {
        const lower = p.toLowerCase();
        if (!map.has(lower)) map.set(lower, []);
        map.get(lower)!.push(rn);
      }
    }
    return map;
  }, [detailQ.data, rolesQ.data]);

  const directSet = useMemo(() => {
    return new Set((detailQ.data?.directPermissions ?? []).map((p) => p.toLowerCase()));
  }, [detailQ.data]);

  const [pending, setPending] = useState<Set<string>>(new Set());

  const toggleMut = useMutation({
    mutationFn: async ({ perm, on }: { perm: string; on: boolean }) => {
      if (!userId) return;
      if (on) await rolesApi.addUserPermission(userId, perm);
      else await rolesApi.removeUserPermission(userId, perm);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to update grant'),
    onSettled: (_, __, vars) => {
      setPending((prev) => { const next = new Set(prev); next.delete(vars.perm); return next; });
      void qc.invalidateQueries({ queryKey: ['user-permissions', userId] });
    },
  });

  const groups = useMemo(() => permsQ.data ? groupPermissions(permsQ.data) : [], [permsQ.data]);

  return (
    <div>
      <Alert
        type="info" showIcon
        style={{ marginBlockEnd: 12 }}
        message="Cross-functional grants"
        description="Use this panel to give a single user one or two extra permissions without changing their role. A Super-admin (Administrator role) already has everything — picking them here is a no-op."
      />

      <Card size="small" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 12 }}>
        <Space size={12} wrap>
          <Typography.Text strong>User</Typography.Text>
          <Select
            showSearch
            allowClear
            placeholder="Pick a user"
            style={{ inlineSize: 360 }}
            loading={usersQ.isLoading}
            value={userId ?? undefined}
            onChange={(v) => setUserId(v ?? null)}
            optionFilterProp="label"
            options={(usersQ.data?.items ?? []).map((u) => ({
              value: u.id,
              label: `${u.fullName || u.userName} · ${u.userName}${u.isActive ? '' : ' (inactive)'}`,
            }))}
          />
          {detailQ.data && (
            <Space size={4}>
              <UserOutlined style={{ color: 'var(--jm-gray-500)' }} />
              <Typography.Text>{detailQ.data.fullName ?? detailQ.data.userName}</Typography.Text>
              <span style={{ color: 'var(--jm-gray-400)' }}>·</span>
              {detailQ.data.roles.map((r) => <Tag key={r} color={r === 'Administrator' ? 'gold' : 'blue'}>{r}</Tag>)}
            </Space>
          )}
        </Space>
      </Card>

      {!userId && <Empty description="Pick a user above to see and edit their permissions." />}

      {userId && detailQ.isLoading && <div style={{ textAlign: 'center', paddingBlock: 60 }}><Spin /></div>}

      {userId && detailQ.data && detailQ.data.roles.includes('Administrator') && (
        <Alert
          type="warning" showIcon
          style={{ marginBlockEnd: 12 }}
          message="This user is in the Administrator role — they already have every permission system-wide."
        />
      )}

      {userId && detailQ.data && (
        <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
          {groups.map((g, idx) => (
            <div key={g.resource}>
              {idx > 0 && <Divider style={{ marginBlock: 8 }} />}
              <div style={{ fontWeight: 600, color: 'var(--jm-gray-700)', marginBlockEnd: 8, textTransform: 'capitalize' }}>
                <SafetyCertificateOutlined style={{ marginInlineEnd: 6, color: 'var(--jm-primary-500)' }} />
                {g.resource}
              </div>
              <Space direction="vertical" size={4} style={{ inlineSize: '100%' }}>
                {g.permissions.map((p) => {
                  const lower = p.toLowerCase();
                  const inheritedRoles = fromRoles.get(lower) ?? [];
                  const inherited = inheritedRoles.length > 0;
                  const direct = directSet.has(lower);
                  const isAdminUser = detailQ.data!.roles.includes('Administrator');
                  return (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Checkbox
                        checked={direct || inherited || isAdminUser}
                        disabled={inherited || isAdminUser || pending.has(p)}
                        onChange={(e) => {
                          setPending((prev) => new Set(prev).add(p));
                          toggleMut.mutate({ perm: p, on: e.target.checked });
                        }}
                      >
                        <code style={{ fontSize: 12 }}>{p}</code>
                      </Checkbox>
                      {inherited && (
                        <Tag color="blue" style={{ margin: 0 }}>via role: {inheritedRoles.join(', ')}</Tag>
                      )}
                      {!inherited && direct && !isAdminUser && (
                        <Tag color="green" style={{ margin: 0 }}>direct grant</Tag>
                      )}
                    </div>
                  );
                })}
              </Space>
            </div>
          ))}
          <Divider style={{ marginBlock: 12 }} />
          <Space>
            <Button onClick={() => detailQ.refetch()}>Refresh</Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Changes take effect at the user's next login.
            </Typography.Text>
          </Space>
        </Card>
      )}
    </div>
  );
}
