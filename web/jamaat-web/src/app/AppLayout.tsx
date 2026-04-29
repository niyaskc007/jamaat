import { useMemo, useState } from 'react';
import { Layout, Menu, Dropdown, Button, Avatar, Badge, Input, Tooltip, Breadcrumb } from 'antd';
import { useHotkey } from '../shared/hooks/useHotkey';
import {
  DashboardOutlined,
  TeamOutlined,
  HomeOutlined,
  HeartOutlined,
  FileTextOutlined,
  WalletOutlined,
  BankOutlined,
  GiftOutlined,
  CalendarOutlined,
  BarChartOutlined,
  BookOutlined,
  SafetyOutlined,
  DatabaseOutlined,
  ApiOutlined,
  BugOutlined,
  UserSwitchOutlined,
  BellOutlined,
  SearchOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';
import { useAuth } from '../shared/auth/useAuth';
import { Logo } from '../shared/ui/Logo';
import { LanguageSwitcher } from '../shared/i18n/LanguageSwitcher';

const { Sider, Content } = Layout;

/// Persist the sidebar's collapsed state across sessions. Otherwise a user with a small
/// laptop screen has to collapse the sider every time they reload the app, and a user with
/// a large screen has to expand it after an inadvertent collapse propagates everywhere.
const COLLAPSED_KEY = 'jm:sider-collapsed';

export function AppLayout() {
  const { t } = useTranslation('common');
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  // Global cashier-friendly shortcuts. Alt+N jumps to New Receipt; "/" jumps to
  // the Members search page (global top-bar search isn't wired yet - when it is,
  // this'll refocus the box instead). Both respect permission gates.
  useHotkey({ key: 'n', modifiers: ['alt'] }, () => {
    if (hasPermission('receipt.create')) navigate('/receipts/new');
  });
  useHotkey({ key: '/' }, () => {
    if (hasPermission('member.view')) navigate('/members');
  });

  // Permission-gated nav - every entry lists the permissions that grant access.
  // Dashboard + Help are always visible; everything else requires at least one matching claim.
  const navItems: MenuProps['items'] = useMemo(() => {
    const any = (...perms: string[]) => perms.length === 0 || perms.some(hasPermission);
    const ops: any[] = [{ key: '/dashboard', icon: <DashboardOutlined />, label: t('nav.dashboard') }];
    if (any('member.view')) ops.push({ key: '/members', icon: <TeamOutlined />, label: t('nav.members') });
    if (any('family.view')) ops.push({ key: '/families', icon: <HomeOutlined />, label: 'Families' });
    if (any('event.view', 'event.manage', 'event.scan'))
      ops.push({ key: '/events', icon: <CalendarOutlined />, label: 'Events' });
    if (any('commitment.view')) ops.push({ key: '/commitments', icon: <HeartOutlined />, label: 'Commitments' });
    if (any('enrollment.view')) ops.push({ key: '/fund-enrollments', icon: <GiftOutlined />, label: 'Enrollments' });
    if (any('qh.view')) ops.push({ key: '/qarzan-hasana', icon: <BankOutlined />, label: 'Qarzan Hasana' });
    if (any('receipt.view')) ops.push({ key: '/receipts', icon: <FileTextOutlined />, label: t('nav.receipts') });
    if (any('voucher.view')) ops.push({ key: '/vouchers', icon: <WalletOutlined />, label: t('nav.vouchers') });

    const acc: any[] = [];
    if (any('accounting.view')) acc.push({ key: '/ledger', icon: <BookOutlined />, label: t('nav.ledger') });
    if (any('reports.view')) acc.push({ key: '/reports', icon: <BarChartOutlined />, label: t('nav.reports') });

    const adm: any[] = [];
    if (any('admin.users', 'admin.roles'))
      adm.push({ key: '/admin/users', icon: <UserSwitchOutlined />, label: t('nav.users') });
    if (any('admin.masterdata'))
      adm.push({ key: '/admin/master-data', icon: <DatabaseOutlined />, label: t('nav.masterData') });
    if (any('admin.integration'))
      adm.push({ key: '/admin/integrations', icon: <ApiOutlined />, label: t('nav.integrations') });
    if (any('admin.audit')) adm.push({ key: '/admin/audit', icon: <SafetyOutlined />, label: t('nav.audit') });
    if (any('admin.errorlogs'))
      adm.push({ key: '/admin/error-logs', icon: <BugOutlined />, label: t('nav.errorLogs') });

    const help: any[] = [{ key: '/help', icon: <QuestionCircleOutlined />, label: 'Help & Docs' }];

    const groups: any[] = [
      {
        key: 'operations',
        type: 'group',
        label: collapsed ? '' : <SectionLabel>{t('nav.sectionOperations')}</SectionLabel>,
        children: ops,
      },
    ];
    if (acc.length)
      groups.push({
        key: 'accounting',
        type: 'group',
        label: collapsed ? '' : <SectionLabel>{t('nav.sectionAccounting')}</SectionLabel>,
        children: acc,
      });
    if (adm.length)
      groups.push({
        key: 'admin',
        type: 'group',
        label: collapsed ? '' : <SectionLabel>{t('nav.sectionAdmin')}</SectionLabel>,
        children: adm,
      });
    groups.push({
      key: 'support',
      type: 'group',
      label: collapsed ? '' : <SectionLabel>Support</SectionLabel>,
      children: help,
    });
    return groups;
  }, [collapsed, t, hasPermission, user?.id]);

  const activeKey = resolveActiveKey(location.pathname);
  const breadcrumb = resolveBreadcrumb(location.pathname, t);

  const userMenu: MenuProps['items'] = [
    { key: 'profile', icon: <UserOutlined />, label: t('nav.profile'), onClick: () => navigate('/me') },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('nav.logout'),
      onClick: () => { logout(); navigate('/login'); },
    },
  ];

  const initials = (user?.fullName ?? user?.userName ?? '?')
    .split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');

  return (
    <Layout style={{ minBlockSize: '100dvh' }}>
      {/* Three-row flex layout: pinned logo header, scrollable menu, pinned collapse footer.
          The middle row owns vertical overflow so long nav lists (especially when an admin
          has every section visible) stay reachable without growing the page. */}
      <Sider
        width={240}
        collapsedWidth={72}
        collapsed={collapsed}
        trigger={null}
        theme="dark"
        style={{
          background: 'var(--jm-sider-bg)',
          position: 'sticky',
          insetBlockStart: 0,
          blockSize: '100dvh',
          borderInlineEnd: '1px solid var(--jm-sider-border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            blockSize: 56,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            paddingInline: collapsed ? 0 : 20,
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderBlockEnd: '1px solid var(--jm-sider-border)',
          }}
        >
          <Logo size={28} variant="light" withWord={!collapsed} />
        </div>

        <div className="jm-sider-scroll" style={{
          flex: 1,
          minBlockSize: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px 8px',
        }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[activeKey]}
            items={navItems}
            onClick={(e) => navigate(e.key)}
            style={{ background: 'transparent', borderInlineEnd: 'none' }}
            inlineCollapsed={collapsed}
          />
        </div>

        {/* Pinned footer with the collapse toggle. Always visible regardless of nav length. */}
        <div
          style={{
            flexShrink: 0,
            blockSize: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-end',
            paddingInline: 12,
            borderBlockStart: '1px solid var(--jm-sider-border)',
          }}
        >
          <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <Button
              type="text"
              size="small"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleCollapsed}
              style={{ color: 'var(--jm-sider-fg-muted)' }}
              aria-label="Toggle navigation"
            />
          </Tooltip>
        </div>
      </Sider>

      <Layout>
        {/* TOP BAR */}
        <header
          style={{
            position: 'sticky',
            insetBlockStart: 0,
            zIndex: 10,
            blockSize: 56,
            background: '#FFFFFF',
            borderBlockEnd: '1px solid var(--jm-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            paddingInline: 24,
          }}
        >
          <Breadcrumb items={breadcrumb} style={{ fontSize: 13 }} />
          <div style={{ flex: 1 }} />

          <Input
            size="middle"
            placeholder={`${t('search.placeholder')}  (Press /)`}
            prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />}
            style={{ inlineSize: 320, background: 'var(--jm-surface-muted)', border: '1px solid transparent' }}
            disabled
          />

          {hasPermission('receipt.create') && (
            <Tooltip title="Alt+N">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/receipts/new')}>
                {t('actions.newReceipt')}
              </Button>
            </Tooltip>
          )}

          <Tooltip title="Notifications">
            <Badge count={0} size="small">
              <Button type="text" shape="circle" icon={<BellOutlined />} />
            </Badge>
          </Tooltip>

          <LanguageSwitcher />

          <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={['click']}>
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'transparent', border: 'none', padding: '4px 6px',
                cursor: 'pointer', borderRadius: 8,
              }}
              aria-label="User menu"
            >
              <Avatar size={32} style={{ background: 'var(--jm-primary-500)', fontWeight: 600 }}>{initials}</Avatar>
              <div style={{ textAlign: 'start', lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--jm-gray-800)' }}>
                  {user?.fullName ?? user?.userName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{deriveRoleLabel(user?.permissions ?? [])}</div>
              </div>
            </button>
          </Dropdown>
        </header>

        <Content style={{ padding: 24, maxInlineSize: 1440, inlineSize: '100%', marginInline: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--jm-sider-fg-muted)',
        padding: '10px 16px 6px',
      }}
    >
      {children}
    </div>
  );
}

function resolveActiveKey(path: string): string {
  // Match deepest known prefix
  const known = [
    '/dashboard', '/members', '/families', '/events', '/commitments', '/fund-enrollments', '/qarzan-hasana',
    '/receipts', '/vouchers', '/ledger', '/reports', '/help',
    '/admin/users', '/admin/master-data', '/admin/integrations', '/admin/audit', '/admin/error-logs',
  ];
  return known.find((k) => path === k || path.startsWith(k + '/')) ?? '/dashboard';
}

/// Pick a short role label to show under the user name.
/// Drives off actual permission claims so it matches what the user can actually do,
/// rather than depending on a role string we don't ship to the browser.
function deriveRoleLabel(perms: string[]): string {
  const set = new Set(perms.map((p) => p.toLowerCase()));
  if (set.has('admin.users') && set.has('admin.masterdata')) return 'Administrator';
  if (set.has('voucher.approve') || set.has('accounting.journal')) return 'Accountant';
  if (set.has('qh.approve_l1') || set.has('qh.approve_l2')) return 'QH Approver';
  if (set.has('event.manage')) return 'Events Coordinator';
  if (set.has('receipt.create')) return 'Counter';
  if (set.has('member.verify')) return 'Data Verifier';
  if (set.size === 0) return 'User';
  const viewOnly = perms.every((p) => p.toLowerCase().endsWith('.view'));
  return viewOnly ? 'Auditor (read-only)' : 'User';
}

function resolveBreadcrumb(path: string, t: (k: string) => string): { title: React.ReactNode }[] {
  const parts = path.split('/').filter(Boolean);
  const items: { title: React.ReactNode }[] = [{ title: <Link to="/dashboard">{t('nav.dashboard')}</Link> }];
  if (parts[0] && parts[0] !== 'dashboard') {
    const labelMap: Record<string, string> = {
      members: t('nav.members'),
      families: 'Families',
      commitments: 'Commitments',
      receipts: t('nav.receipts'),
      vouchers: t('nav.vouchers'),
      ledger: t('nav.ledger'),
      reports: t('nav.reports'),
      admin: t('nav.sectionAdmin'),
      help: 'Help & Docs',
      events: 'Events',
      'fund-enrollments': 'Enrollments',
      'qarzan-hasana': 'Qarzan Hasana',
    };
    const top = labelMap[parts[0]] ?? parts[0];
    items.push({ title: top });
    if (parts[1]) items.push({ title: parts[1] });
  }
  return items;
}
