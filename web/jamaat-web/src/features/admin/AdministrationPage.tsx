import { Card, Row, Col } from 'antd';
import {
  UserSwitchOutlined, DatabaseOutlined, ApiOutlined, SafetyOutlined,
  BugOutlined, BellOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAuth } from '../../shared/auth/useAuth';

/// Landing page for the Administration section. Card grid index of every admin tool, each
/// gated by the same permissions the actual sub-page uses. Tools the user can't reach are
/// hidden rather than shown disabled - cleaner empty state.
type AdminTool = {
  path: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  permissions: string[];
};

const TOOLS: AdminTool[] = [
  {
    path: '/admin/users',
    title: 'Users & Roles',
    description: 'Invite users, assign roles, and grant fine-grained permissions per fund / module.',
    icon: <UserSwitchOutlined />, color: '#0E5C40',
    permissions: ['admin.users', 'admin.roles'],
  },
  {
    path: '/admin/master-data',
    title: 'Master Data',
    description: 'Configure fund categories, fund types, accounts, banks, currencies, agreement templates, custom fields - the system\'s backbone.',
    icon: <DatabaseOutlined />, color: '#1E40AF',
    permissions: ['admin.masterdata'],
  },
  {
    path: '/admin/integrations',
    title: 'Integrations',
    description: 'External system connections - SMTP, SMS gateways, third-party APIs.',
    icon: <ApiOutlined />, color: '#7C3AED',
    permissions: ['admin.integration'],
  },
  {
    path: '/admin/audit',
    title: 'Audit Log',
    description: 'Every mutation captured with before/after JSON, who did it, from where. Forensic-grade trail.',
    icon: <SafetyOutlined />, color: '#0B6E63',
    permissions: ['admin.audit'],
  },
  {
    path: '/admin/error-logs',
    title: 'Error Logs',
    description: 'Platform exceptions + client-side errors, fingerprinted and triaged. Watch this when investigating user reports.',
    icon: <BugOutlined />, color: '#DC2626',
    permissions: ['admin.errorlogs'],
  },
  {
    path: '/admin/notifications',
    title: 'Notifications',
    description: 'Every email / log-only notification the system fired - subject, body, recipient, delivery outcome.',
    icon: <BellOutlined />, color: '#D97706',
    permissions: ['admin.audit'],
  },
  {
    path: '/admin/reliability',
    title: 'Reliability dashboard',
    description: 'Cross-member behavior overview - grade distribution + top performers + members needing outreach. Advisory only.',
    icon: <ThunderboltOutlined />, color: '#0B6E63',
    permissions: ['admin.reliability'],
  },
];

export function AdministrationPage() {
  const { hasPermission } = useAuth();
  const visible = TOOLS.filter((t) => t.permissions.some(hasPermission));

  return (
    <div>
      <PageHeader title="Administration"
        subtitle="System configuration, audit trails, and user management." />
      <Row gutter={[12, 12]}>
        {visible.map((t) => (
          <Col key={t.path} xs={24} sm={12} lg={8} xl={6}>
            <Link to={t.path} style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ blockSize: '100%', border: '1px solid var(--jm-border)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    inlineSize: 40, blockSize: 40, borderRadius: 8,
                    background: `${t.color}1A`, color: t.color,
                    display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0,
                  }}>{t.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--jm-gray-900, #1F2937)', marginBlockEnd: 4 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', lineHeight: 1.5 }}>{t.description}</div>
                  </div>
                </div>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  );
}
