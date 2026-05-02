import { Card, Row, Col, Typography, Space } from 'antd';
import {
  GiftOutlined, HeartOutlined, BankOutlined, TeamOutlined, CalendarOutlined,
  HistoryOutlined, UserOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { authStore } from '../../../shared/auth/authStore';

/// Landing tile grid for the member portal. All visual styling (icon-tile colour wash, card
/// border, hover behaviour) lives in the `.jm-tile-*` classes in `app/portal.css`. Tone is a
/// semantic key (primary / success / info / warning / danger / accent / neutral); to add a
/// new tone, define `.jm-tile-icon-<tone>` in portal.css with token-based colours.
type Tone = 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'accent' | 'neutral';

export function MemberHomePage() {
  const user = authStore.getUser();
  return (
    <div>
      <Typography.Title level={3} className="jm-page-title">Salaam, {user?.fullName?.split(' ')[0] ?? 'Member'}</Typography.Title>
      <Typography.Paragraph type="secondary" className="jm-page-intro">
        Welcome to your self-service portal. Manage your contributions, commitments, loans, and event registrations from here.
      </Typography.Paragraph>

      <Row gutter={[16, 16]}>
        <Tile to="/portal/me/profile" tone="primary" icon={<UserOutlined />}
          title="My profile" desc="View and update your contact information, address, family." />
        <Tile to="/portal/me/contributions" tone="success" icon={<GiftOutlined />}
          title="My contributions" desc="Past receipts, donations, and Sabil/Niyaz contributions." />
        <Tile to="/portal/me/commitments" tone="accent" icon={<HeartOutlined />}
          title="My commitments" desc="Active commitments and pending installments. Make a new commitment." />
        <Tile to="/portal/me/qarzan-hasana" tone="info" icon={<BankOutlined />}
          title="Qarzan Hasana" desc="Existing loans, repayment schedule. Request a new loan." />
        <Tile to="/portal/me/guarantor-inbox" tone="warning" icon={<TeamOutlined />}
          title="Guarantor inbox" desc="Guarantor requests addressed to you. Endorse or decline." />
        <Tile to="/portal/me/events" tone="danger" icon={<CalendarOutlined />}
          title="Events" desc="Your upcoming registrations. Register for new events." />
        <Tile to="/portal/me/login-history" tone="neutral" icon={<HistoryOutlined />}
          title="Login history" desc="See where and when your account was used." />
      </Row>
    </div>
  );
}

function Tile({ to, tone, icon, title, desc }: {
  to: string; tone: Tone; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <Col xs={24} sm={12} lg={8}>
      <Link to={to} className="jm-tile-link">
        <Card hoverable className="jm-card jm-tile">
          <Space align="start" size={12}>
            <span className={`jm-tile-icon jm-tile-icon-${tone}`}>{icon}</span>
            <div>
              <div className="jm-tile-title">{title}</div>
              <div className="jm-tile-desc">{desc}</div>
            </div>
          </Space>
        </Card>
      </Link>
    </Col>
  );
}
