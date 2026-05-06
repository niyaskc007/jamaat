import { useMemo, useState } from 'react';
import { Layout, Menu, Avatar, Space, Typography, Dropdown, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined, UserOutlined, GiftOutlined, HeartOutlined, BankOutlined,
  TeamOutlined, CalendarOutlined, HistoryOutlined, LockOutlined, LogoutOutlined,
  AppstoreOutlined, ProfileOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authStore } from '../../../shared/auth/authStore';
import { Logo } from '../../../shared/ui/Logo';
import { LanguageSwitcher } from '../../../shared/i18n/LanguageSwitcher';
import { InstallPrompt } from '../../../shared/pwa/InstallPrompt';
import { OfflineBanner } from '../../../shared/pwa/OfflineBanner';
import { UpdateToast } from '../../../shared/pwa/UpdateToast';

/// Self-service portal shell for members. Distinct from the operator AppLayout.
/// Visual chrome (sider brand, header bar, avatar pill, content padding) is fully styled
/// by `.jm-portal-*` classes in `app/portal.css`; this component is layout-only.
export function MemberPortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const user = authStore.getUser();
  const { t } = useTranslation('portal');

  // Grouped nav (matches the operator AppLayout pattern: Operations / Insights). Members
  // see "My activity" (transactional), "Engagement" (events + kafil), and "Account" (profile,
  // history). Home stays flat at the top so it's always one click away.
  const items: MenuProps['items'] = useMemo(() => [
    { key: '/portal/me', icon: <HomeOutlined />, label: t('nav.home') },
    {
      key: 'activity', icon: <AppstoreOutlined />, label: 'My activity',
      children: [
        { key: '/portal/me/contributions', icon: <GiftOutlined />, label: t('nav.contributions') },
        { key: '/portal/me/commitments', icon: <HeartOutlined />, label: t('nav.commitments') },
        { key: '/portal/me/fund-enrollments', icon: <GiftOutlined />, label: t('nav.patronages') },
        { key: '/portal/me/qarzan-hasana', icon: <BankOutlined />, label: t('nav.qarzanHasana') },
      ],
    },
    {
      key: 'engagement', icon: <TeamOutlined />, label: 'Engagement',
      children: [
        { key: '/portal/me/guarantor-inbox', icon: <TeamOutlined />, label: t('nav.guarantorInbox') },
        { key: '/portal/me/events', icon: <CalendarOutlined />, label: t('nav.events') },
      ],
    },
    {
      key: 'account', icon: <ProfileOutlined />, label: 'Account',
      children: [
        { key: '/portal/me/profile', icon: <UserOutlined />, label: t('nav.profile') },
        { key: '/portal/me/login-history', icon: <HistoryOutlined />, label: t('nav.loginHistory') },
      ],
    },
  ], [t]);

  // Flatten the grouped tree so the existing matchKey() helper still picks the right
  // selection from the URL.
  const flatKeys = useMemo(() => {
    const out: string[] = [];
    function walk(nodes: NonNullable<MenuProps['items']>) {
      for (const n of nodes) {
        if (!n) continue;
        if (typeof n === 'object' && 'key' in n && typeof n.key === 'string' && n.key.startsWith('/')) out.push(n.key);
        if (typeof n === 'object' && 'children' in n && Array.isArray(n.children)) walk(n.children as NonNullable<MenuProps['items']>);
      }
    }
    walk(items);
    return out;
  }, [items]);

  const onLogout = () => {
    authStore.clear();
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="jm-portal-shell">
      <Layout.Sider
        collapsible collapsed={collapsed} onCollapse={setCollapsed}
        theme="dark" width={232}
        className="jm-portal-sider"
      >
        <div className={`jm-portal-sider-brand ${collapsed ? 'jm-portal-sider-brand--collapsed' : ''}`}>
          <Logo size={28} variant="light" />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultOpenKeys={['activity', 'engagement', 'account']}
          selectedKeys={[matchKey(flatKeys, location.pathname)]}
          items={items}
          onClick={({ key }) => { if (key.startsWith('/')) navigate(key); }}
        />
      </Layout.Sider>

      <Layout>
        <Layout.Header className="jm-portal-header">
          <Typography.Text type="secondary" className="jm-portal-header-label">
            {t('shell.label')}
          </Typography.Text>
          <Space>
            <LanguageSwitcher />
            <Dropdown
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'profile', icon: <UserOutlined />, label: t('menu.profile'), onClick: () => navigate('/portal/me/profile') },
                  { key: 'change-pw', icon: <LockOutlined />, label: t('menu.changePassword'), onClick: () => navigate('/change-password?returnTo=/portal/me') },
                  { type: 'divider' as const },
                  { key: 'logout', icon: <LogoutOutlined />, label: t('menu.signOut'), danger: true, onClick: onLogout },
                ],
              }}
            >
              <Button type="text" className="jm-portal-header-trigger">
                <Space>
                  <Avatar size={32} className="jm-portal-avatar">
                    {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
                  </Avatar>
                  <div className="jm-portal-user-block">
                    <div className="jm-portal-user-name">{user?.fullName}</div>
                    <div className="jm-portal-user-role">{t('shell.memberRole')}</div>
                  </div>
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Layout.Header>

        <Layout.Content className="jm-portal-content">
          <OfflineBanner />
          <Outlet />
          <InstallPrompt />
          <UpdateToast />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

/// AntD's selectedKeys requires an exact match; for nested routes we want the longest matching
/// prefix to stay highlighted (e.g. /portal/me/contributions/123 should highlight Contributions).
function matchKey(keys: string[], path: string): string {
  return keys
    .filter((k) => path === k || path.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0] ?? keys[0];
}
