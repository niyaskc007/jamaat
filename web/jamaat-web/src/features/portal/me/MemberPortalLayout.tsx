import { useMemo, useState } from 'react';
import { Layout, Menu, Avatar, Space, Typography, Dropdown, Button, Grid } from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined, UserOutlined, GiftOutlined, HeartOutlined, BankOutlined,
  TeamOutlined, CalendarOutlined, HistoryOutlined, LockOutlined, LogoutOutlined,
  AppstoreOutlined, ProfileOutlined, MenuOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authStore } from '../../../shared/auth/authStore';
import { resolveUserType } from '../../../shared/auth/routing';
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
  // Below the `lg` breakpoint (992px) the sidebar collapses to width 0 and
  // overlays the content as a slide-in drawer when toggled - so on a phone the
  // member sees full-width content by default and can tap the hamburger to nav.
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(true);
  const user = authStore.getUser();
  const { t } = useTranslation('portal');

  // Gate: members + hybrids + operators with portal.access (e.g. an accountant who
  // also needs to inspect a member's portal view) get to render here. A pure operator
  // with NO portal.access has no business on /portal/me - send them back to /dashboard
  // so they don't see an empty shell. The previous version kicked anyone with
  // userType === 'Operator', which made it impossible for an operator who happened to
  // hold portal.access (because the perm was granted to them in the admin UI) to view
  // the portal at all.
  const userType = user ? resolveUserType(user) : null;
  const hasPortalAccess = (user?.permissions ?? []).some((p) => p.toLowerCase() === 'portal.access');
  if (userType === 'Operator' && !hasPortalAccess) {
    return <Navigate to="/dashboard" replace />;
  }

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
        { key: '/portal/me/family', icon: <HomeOutlined />, label: 'My family' },
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
    <Layout className={`jm-portal-shell ${isMobile ? 'jm-portal-shell--mobile' : ''}`}>
      <Layout.Sider
        collapsible
        collapsed={isMobile ? collapsed : false}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={isMobile ? 0 : 80}
        trigger={null}
        theme="dark" width={232}
        className={`jm-portal-sider ${isMobile ? 'jm-portal-sider--overlay' : ''}`}
      >
        <div className={`jm-portal-sider-brand ${(isMobile && collapsed) ? 'jm-portal-sider-brand--collapsed' : ''}`}>
          <Logo size={28} variant="light" />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          // Force inline-expanded layout regardless of Sider's collapse state.
          // Without this, AntD auto-passes the Sider's collapsed=true (which we
          // use on mobile to hide the drawer at width 0) into the Menu as
          // inlineCollapsed=true, which then renders all defaultOpenKeys as
          // floating Portal popovers stacked on top of the page - the bug the
          // user saw where the nav menu auto-appeared on first page load.
          inlineCollapsed={false}
          defaultOpenKeys={['activity', 'engagement', 'account']}
          selectedKeys={[matchKey(flatKeys, location.pathname)]}
          items={items}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              navigate(key);
              if (isMobile) setCollapsed(true); // close drawer after picking a destination
            }
          }}
        />
      </Layout.Sider>

      {/* Backdrop tap-to-close when the drawer is open on mobile */}
      {isMobile && !collapsed && (
        <div className="jm-portal-sider-backdrop" onClick={() => setCollapsed(true)} />
      )}

      <Layout>
        <Layout.Header className="jm-portal-header">
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              className="jm-portal-header-hamburger"
              aria-label="Open navigation menu"
              onClick={() => setCollapsed((c) => !c)}
            />
          )}
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
                  // Show the "Switch to operator dashboard" entry to anyone who has
                  // operator-side perms: Hybrid users always do, and so does an Operator
                  // who got into the portal via portal.access (the relaxed redirect gate
                  // above). Pure Members have no operator perms so they never see it.
                  // Gate uses member.view as the canonical operator-presence indicator -
                  // every operator persona in the seed (Counter / Accountant / Approver /
                  // EventCoordinator / Auditor) holds it.
                  ...((userType !== 'Member'
                       && (user?.permissions ?? []).some((p) => p.toLowerCase() === 'member.view')) ? [
                    { type: 'divider' as const },
                    {
                      key: 'switch-operator',
                      icon: <AppstoreOutlined />,
                      label: 'Switch to operator dashboard',
                      onClick: () => navigate('/dashboard'),
                    },
                  ] : []),
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
