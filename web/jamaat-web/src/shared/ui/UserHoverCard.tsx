import { Popover, Tag, Spin, Skeleton } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDateTime } from '../format/format';

/// Lite user shape returned by /api/v1/users/{id}/lite (auth-light - any signed-in user
/// can resolve a user-id to a friendly name without inheriting admin.users access).
type UserLiteDto = {
  id: string;
  userName: string;
  fullName: string;
  roles: string[];
  isActive: boolean;
  lastLoginAtUtc: string | null;
};

type Props = {
  userId: string | null | undefined;
  /// Text shown when the popover is closed. Usually the username we already have on the
  /// parent record (so the hover card is purely additive — even users without admin.users
  /// permission see a meaningful name).
  fallback: React.ReactNode;
  /// Where the click takes the user. Defaults to the admin user-detail page; pass a
  /// different path (or omit) when the visitor likely lacks admin.users access.
  navigateTo?: string | null;
};

/// Hover card that fetches lightweight user info on demand and renders it in an AntD
/// Popover. Used wherever we display "this was approved/posted/created by …" so the
/// reader can confirm who that actually is without leaving the page.
export function UserHoverCard({ userId, fallback, navigateTo }: Props) {
  const navigate = useNavigate();
  // Treat the empty-Guid string as "no user known" (e.g. seeded data without a real
  // approver UserId). Avoids a guaranteed 404 + a misleading hover affordance.
  const isRealUserId = !!userId && userId !== '00000000-0000-0000-0000-000000000000';
  const enabled = isRealUserId;
  const q = useQuery({
    queryKey: ['user-lite', userId],
    queryFn: async () => (await api.get<UserLiteDto>(`/api/v1/users/${userId}/lite`)).data,
    enabled,
    staleTime: 5 * 60_000,
    // The lookup hits an Identity table — failures (e.g. user deleted) shouldn't make the
    // popover spin forever. Surface them as a polite "not available" line instead.
    retry: 1,
  });

  if (!enabled) return <>{fallback}</>;

  const onClick = () => {
    const target = navigateTo === undefined ? `/admin/users/${userId}` : navigateTo;
    if (target) navigate(target);
  };

  const content = q.isLoading ? (
    <div style={{ minWidth: 200 }}><Skeleton active paragraph={{ rows: 2 }} title={false} /></div>
  ) : q.isError || !q.data ? (
    <div style={{ minWidth: 200, color: 'var(--jm-gray-500)' }}>User details unavailable.</div>
  ) : (
    <div style={{ minWidth: 220, maxWidth: 320 }}>
      <div style={{ fontWeight: 600, color: 'var(--jm-gray-900)' }}>{q.data.fullName || q.data.userName}</div>
      <div className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{q.data.userName}</div>
      <div style={{ marginBlockStart: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {q.data.roles.length === 0
          ? <Tag>No roles</Tag>
          : q.data.roles.map((r) => <Tag key={r} color="blue">{r}</Tag>)}
        {!q.data.isActive && <Tag color="red">Inactive</Tag>}
      </div>
      {q.data.lastLoginAtUtc && (
        <div style={{ marginBlockStart: 8, fontSize: 12, color: 'var(--jm-gray-500)' }}>
          Last login: <span className="jm-tnum">{formatDateTime(q.data.lastLoginAtUtc)}</span>
        </div>
      )}
      {navigateTo !== null && (
        <div style={{ marginBlockStart: 8, fontSize: 11, color: 'var(--jm-gray-400)' }}>
          Click to open user profile
        </div>
      )}
    </div>
  );

  // Conditional role/tabIndex: only mark as button when there's somewhere to click through.
  // jsx-a11y rejects `role={cond ? 'button' : undefined}` because the expression isn't a
  // statically-known ARIA role - spreading a typed object instead keeps it analysable.
  const interactiveProps = navigateTo === null
    ? {}
    : { role: 'button' as const, tabIndex: 0, onClick };

  return (
    <Popover content={content} trigger={['hover', 'focus']} mouseEnterDelay={0.2} placement="topLeft">
      <span
        {...interactiveProps}
        style={{
          cursor: navigateTo === null ? 'default' : 'pointer',
          textDecoration: navigateTo === null ? 'none' : 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: 3,
          color: 'inherit',
        }}
      >
        {q.isLoading ? <Spin size="small" /> : (q.data?.fullName || fallback)}
      </span>
    </Popover>
  );
}
