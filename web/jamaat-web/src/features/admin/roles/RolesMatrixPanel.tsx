import { useMemo, useState } from 'react';
import { Card, Checkbox, Table, Tag, Spin, Alert, App as AntdApp, Space, Typography, Tooltip } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircleTwoTone, SafetyCertificateOutlined } from '@ant-design/icons';
import { rolesApi, groupPermissions, type Role } from './rolesApi';
import { extractProblem } from '../../../shared/api/client';

/// Role × Permission matrix. Each row = one permission; each column = one role.
/// Toggling a checkbox calls add/remove on the role and propagates to users in that role
/// (server side), so the change takes effect on the user's next login. Administrator role is
/// rendered locked-on for every permission — super-admin must always have everything.
export function RolesMatrixPanel() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const permsQ = useQuery({ queryKey: ['permissions-all'], queryFn: rolesApi.allPermissions });
  const rolesQ = useQuery({ queryKey: ['roles-detailed'], queryFn: rolesApi.list });

  const [pending, setPending] = useState<Set<string>>(new Set()); // key = `${role}::${perm}`

  const toggleMut = useMutation({
    mutationFn: async ({ role, perm, on }: { role: string; perm: string; on: boolean }) => {
      if (on) await rolesApi.addPermission(role, perm);
      else await rolesApi.removePermission(role, perm);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to update permission'),
    onSettled: (_, __, vars) => {
      setPending((prev) => { const next = new Set(prev); next.delete(`${vars.role}::${vars.perm}`); return next; });
      void qc.invalidateQueries({ queryKey: ['roles-detailed'] });
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  const groups = useMemo(() => permsQ.data ? groupPermissions(permsQ.data) : [], [permsQ.data]);
  const roleByName = useMemo(() => {
    const m = new Map<string, Role>();
    for (const r of rolesQ.data ?? []) m.set(r.name, r);
    return m;
  }, [rolesQ.data]);

  if (permsQ.isLoading || rolesQ.isLoading) return <div style={{ textAlign: 'center', paddingBlock: 60 }}><Spin /></div>;
  if (!permsQ.data || !rolesQ.data) return <Alert type="error" message="Failed to load roles or permissions." />;

  const roleNames = (rolesQ.data ?? []).map((r) => r.name);

  // Build a flat row per permission (with a leading group-label row separator handled via grouping).
  type Row = { kind: 'header'; resource: string } | { kind: 'perm'; permission: string };
  const rows: Row[] = [];
  for (const g of groups) {
    rows.push({ kind: 'header', resource: g.resource });
    for (const p of g.permissions) rows.push({ kind: 'perm', permission: p });
  }

  return (
    <div>
      <Alert
        type="info" showIcon
        style={{ marginBlockEnd: 12 }}
        message="How role-permission changes propagate"
        description={
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            <li>Toggling a permission on a role updates every user currently in that role — they'll see the change at their next login.</li>
            <li>The <b>Administrator</b> role always has every permission and cannot be modified here.</li>
            <li>To grant a one-off permission to a single user without changing their role, use the <b>Users · cross-functional</b> tab.</li>
          </ul>
        }
      />

      <Card size="small" style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey={(r) => (r.kind === 'header' ? `h:${r.resource}` : `p:${r.permission}`)}
          size="small"
          pagination={false}
          dataSource={rows}
          sticky
          columns={[
            {
              title: 'Permission',
              key: 'permission',
              fixed: 'left',
              width: 280,
              render: (_, row) =>
                row.kind === 'header' ? (
                  <span style={{ fontWeight: 600, color: 'var(--jm-gray-700)', textTransform: 'capitalize' }}>
                    <SafetyCertificateOutlined style={{ marginInlineEnd: 6, color: 'var(--jm-primary-500)' }} />
                    {row.resource}
                  </span>
                ) : (
                  <span style={{ paddingInlineStart: 18 }}>
                    <code style={{ fontSize: 12, color: 'var(--jm-gray-800)' }}>{row.permission}</code>
                  </span>
                ),
            },
            ...roleNames.map((rn) => ({
              title: <Tag color={rn === 'Administrator' ? 'gold' : 'blue'} style={{ margin: 0 }}>{rn}</Tag>,
              key: rn,
              align: 'center' as const,
              width: 130,
              render: (_: unknown, row: Row) => {
                if (row.kind === 'header') return null;
                const role = roleByName.get(rn);
                const isAdmin = rn === 'Administrator';
                const checked = isAdmin ? true : !!role?.permissions.some((p) => p.toLowerCase() === row.permission.toLowerCase());
                const key = `${rn}::${row.permission}`;
                if (isAdmin) {
                  return <Tooltip title="Administrator always has every permission."><CheckCircleTwoTone twoToneColor="#0B6E63" /></Tooltip>;
                }
                return (
                  <Checkbox
                    checked={checked}
                    disabled={pending.has(key)}
                    onChange={(e) => {
                      setPending((prev) => new Set(prev).add(key));
                      toggleMut.mutate({ role: rn, perm: row.permission, on: e.target.checked });
                    }}
                  />
                );
              },
            })),
          ]}
          rowClassName={(r) => (r.kind === 'header' ? 'jm-roles-matrix-header-row' : '')}
        />
      </Card>

      <Space direction="vertical" size={4} style={{ marginBlockStart: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Permissions are referenced by name in code (e.g. <code>receipt.create</code>). Adding a brand-new permission requires a server change.
        </Typography.Text>
      </Space>
    </div>
  );
}
