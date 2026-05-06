import { Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { LoginHistoryView, type LoginAttemptVm } from '../../../shared/ui/LoginHistoryView';
import { PageHeader } from '../../../shared/ui/PageHeader';

/// Phase E8 - the member's own login history. Hits an authenticated endpoint scoped to the
/// current user via /portal/me/login-history (added on the backend) so members never see
/// anyone else's attempts. Reuses the shared <PageHeader> + LoginHistoryView so the page
/// matches the operator audit views.
export function MemberLoginHistoryPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['portal-me-login-history'],
    queryFn: async () => {
      const r = await api.get<LoginAttemptVm[]>('/api/v1/portal/me/login-history');
      return r.data;
    },
  });

  return (
    <div>
      <PageHeader title="Login history"
        subtitle="Every sign-in attempt against your account. If you see a session you don't recognise, change your password immediately." />

      {(data?.filter((r) => !r.success).length ?? 0) > 3 && (
        <Alert
          type="warning" showIcon className="jm-portal-dashboard-alert"
          message="Multiple recent failed sign-ins"
          description="Several failed attempts have been recorded against your account. If any of them weren't you, change your password now (avatar menu → Change password) and contact your committee."
        />
      )}

      <LoginHistoryView rows={data ?? []} loading={isLoading} scope="self" onRefresh={() => refetch()} />
    </div>
  );
}
