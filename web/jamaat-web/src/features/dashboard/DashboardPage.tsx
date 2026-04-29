import { Card, Row, Col, Button, Typography, Tag, Empty, Space, Alert } from 'antd';
import {
  WalletOutlined, FileTextOutlined, TeamOutlined, RiseOutlined,
  PlusOutlined, SearchOutlined, BarChartOutlined, ClockCircleOutlined,
  BugOutlined, CheckCircleOutlined, RocketOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useAuth } from '../../shared/auth/useAuth';
import { KpiCard } from '../../shared/ui/KpiCard';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money } from '../../shared/format/format';
import { dashboardApi } from '../ledger/ledgerApi';
import { PeriodGuard } from './PeriodGuard';
import { useBaseCurrency } from '../../shared/hooks/useBaseCurrency';

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const baseCurrency = useBaseCurrency();

  const statsQuery = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: dashboardApi.stats, refetchInterval: 30_000 });
  const activityQuery = useQuery({ queryKey: ['dashboard', 'recent'], queryFn: () => dashboardApi.recentActivity(10), refetchInterval: 30_000 });
  const from = dayjs().startOf('day').format('YYYY-MM-DD');
  const to = dayjs().endOf('day').format('YYYY-MM-DD');
  const fundQuery = useQuery({ queryKey: ['dashboard', 'fund', from, to], queryFn: () => dashboardApi.fundSlice(from, to), refetchInterval: 60_000 });

  const greeting = getGreeting();
  const firstName = (user?.fullName ?? user?.userName ?? '').split(' ')[0];

  const stats = statsQuery.data;
  const todayDelta = stats && stats.yesterdayCollection
    ? ((stats.todayCollection - stats.yesterdayCollection) / stats.yesterdayCollection) * 100
    : null;

  const totalFund = (fundQuery.data ?? []).reduce((s, f) => s + f.amount, 0);

  // First-run cue: if there are no members and no MTD collection at all, nudge to seed data.
  // This keeps the banner off a working system but welcomes a fresh deployment.
  const isEmptySystem =
    !!stats && (stats.activeMembers ?? 0) === 0 && (stats.mtdCollection ?? 0) === 0
    && (activityQuery.data?.length ?? 0) === 0;

  const canCreateReceipt = hasPermission('receipt.create');
  const canCreateVoucher = hasPermission('voucher.create');

  return (
    <div className="jm-stack" style={{ gap: 24 }}>
      <PeriodGuard />

      {isEmptySystem && (
        <Alert
          type="info"
          showIcon
          icon={<RocketOutlined />}
          message="Welcome - let's get set up"
          description={
            <div>
              <Typography.Paragraph style={{ margin: 0, fontSize: 13 }}>
                Nothing has been recorded yet. Start by importing members or creating one manually, then record your first receipt. The <a onClick={() => navigate('/help')}>Help & Docs</a> page walks through each module.
              </Typography.Paragraph>
              <Space style={{ marginBlockStart: 12 }} wrap>
                {hasPermission('member.view') && (
                  <Button size="small" onClick={() => navigate('/members')}>Add members</Button>
                )}
                {hasPermission('admin.masterdata') && (
                  <Button size="small" onClick={() => navigate('/admin/master-data')}>Review master data</Button>
                )}
                {hasPermission('admin.integration') && (
                  <Button size="small" onClick={() => navigate('/admin/integrations')}>Import from Excel</Button>
                )}
                <Button size="small" type="link" icon={<QuestionCircleOutlined />} onClick={() => navigate('/help')}>
                  Open Help
                </Button>
              </Space>
            </div>
          }
          style={{ marginBlockEnd: 0 }}
        />
      )}
      <div>
        <Typography.Paragraph style={{ margin: 0, fontSize: 13, color: 'var(--jm-gray-500)', fontWeight: 500 }}>
          {dayjs().format('dddd, DD MMMM YYYY')}
        </Typography.Paragraph>
        <PageHeader
          title={`${greeting}${firstName ? ', ' + firstName : ''}`}
          subtitle={`Base currency: ${baseCurrency}. All ledger values shown in ${baseCurrency}.`}
          actions={
            <Space>
              {hasPermission('member.view') && (
                <Button icon={<SearchOutlined />} onClick={() => navigate('/members')}>Find member</Button>
              )}
              {canCreateReceipt && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/receipts/new')}>New Receipt</Button>
              )}
            </Space>
          }
        />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<WalletOutlined />} label="Today's Collection" value={stats?.todayCollection ?? null} format="money" deltaPercent={todayDelta} accent="var(--jm-primary-500)" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<FileTextOutlined />} label="Receipts Today" value={stats?.receiptsToday ?? null} format="number"
            deltaPercent={stats?.receiptsYesterday ? ((stats.receiptsToday - stats.receiptsYesterday) / Math.max(stats.receiptsYesterday, 1)) * 100 : null} accent="#C9A34B" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<TeamOutlined />} label="Active Members" value={stats?.activeMembers ?? null} format="number" deltaPercent={null} accent="#2563EB" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard icon={<RiseOutlined />} label="MTD Collection" value={stats?.mtdCollection ?? null} format="money" deltaPercent={null} accent="#0A8754" />
        </Col>
      </Row>

      <Card title="Quick actions" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }}>
        <Row gutter={[16, 16]}>
          {canCreateReceipt && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <QuickAction icon={<FileTextOutlined />} title="New Receipt" description="Record a donation or fund receipt" onClick={() => navigate('/receipts/new')} accent="var(--jm-primary-500)" />
            </Col>
          )}
          {canCreateVoucher && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <QuickAction icon={<WalletOutlined />} title="New Voucher" description="Record an outgoing payment" onClick={() => navigate('/vouchers/new')} accent="#C9A34B" />
            </Col>
          )}
          {hasPermission('member.view') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <QuickAction icon={<SearchOutlined />} title="Find member" description="Look up by ITS or name" onClick={() => navigate('/members')} accent="#2563EB" />
            </Col>
          )}
          {hasPermission('reports.view') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <QuickAction icon={<BarChartOutlined />} title="Daily Collection" description="Today's receipts by fund" onClick={() => navigate('/reports')} accent="#0A8754" />
            </Col>
          )}
          <Col xs={24} sm={12} md={8} lg={6}>
            <QuickAction icon={<QuestionCircleOutlined />} title="Help & Docs" description="Module-by-module quick reference" onClick={() => navigate('/help')} accent="#6366F1" />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="Recent activity"
            extra={<Button type="link" size="small" onClick={() => navigate('/receipts')}>View all</Button>}
            style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', minBlockSize: 320 }}
            styles={{ body: { padding: 0 } }}
          >
            {activityQuery.data && activityQuery.data.length > 0 ? (
              <div>
                {activityQuery.data.map((a, idx) => (
                  <div key={`${a.kind}-${a.reference}-${idx}`}
                    onClick={() => navigate(a.kind === 'Receipt' ? '/receipts' : '/vouchers')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderBlockEnd: '1px solid var(--jm-border)',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--jm-surface-muted)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <span style={{ inlineSize: 32, blockSize: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
                      background: a.kind === 'Receipt' ? 'rgba(11,110,99,0.12)' : 'rgba(201,163,75,0.14)',
                      color: a.kind === 'Receipt' ? 'var(--jm-primary-500)' : '#A7873A', fontSize: 14 }}>
                      {a.kind === 'Receipt' ? <FileTextOutlined /> : <WalletOutlined />}
                    </span>
                    <div style={{ flex: 1, minInlineSize: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600, fontSize: 13 }}>{a.reference}</span>
                        <span style={{ fontSize: 13, color: 'var(--jm-gray-700)' }}>{a.title}</span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{dayjs(a.atUtc).fromNow()}</span>
                    </div>
                    {a.amount !== null && (
                      <span className="jm-tnum" style={{ fontWeight: 600, fontSize: 14 }}>{money(a.amount, a.currency)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={<ClockCircleOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />} styles={{ image: { blockSize: 56 } }}
                description={<div style={{ paddingBlock: 16 }}>
                  <div style={{ fontWeight: 500, color: 'var(--jm-gray-700)', marginBlockEnd: 4 }}>No activity yet</div>
                  <div style={{ fontSize: 13, color: 'var(--jm-gray-500)' }}>Confirmed receipts and vouchers appear here in real time.</div>
                </div>} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Fund-wise collection (today)" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', minBlockSize: 320 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(fundQuery.data && fundQuery.data.length > 0) ? fundQuery.data.map((f) => (
                <div key={f.fundTypeId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBlockEnd: 4 }}>
                    <span style={{ color: 'var(--jm-gray-700)', fontWeight: 500 }}>{f.name}</span>
                    <span className="jm-tnum">{money(f.amount, baseCurrency)}</span>
                  </div>
                  <div style={{ blockSize: 6, background: 'var(--jm-surface-sunken)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ blockSize: '100%', inlineSize: `${totalFund ? (f.amount / totalFund) * 100 : 0}%`, background: 'var(--jm-primary-400)', transition: 'inline-size 0.2s' }} />
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--jm-gray-500)', fontSize: 13 }}>
                  No collections yet today.
                </div>
              )}
            </div>
          </Card>
          <Row gutter={[12, 12]} style={{ marginBlockStart: 16 }}>
            <Col xs={12}>
              <Card size="small"
                style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', cursor: hasPermission('voucher.approve') ? 'pointer' : 'default' }}
                onClick={() => hasPermission('voucher.approve') && navigate('/vouchers?status=2')}
                title={hasPermission('voucher.approve') ? 'Open vouchers awaiting approval' : 'You do not have voucher.approve'}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ inlineSize: 32, blockSize: 32, borderRadius: 8, background: 'rgba(217, 119, 6, 0.12)', color: '#D97706', display: 'grid', placeItems: 'center' }}>
                    <CheckCircleOutlined />
                  </span>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending approvals</div>
                    <div className="jm-tnum" style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Inter Tight', 'Inter', sans-serif" }}>{stats?.pendingApprovals ?? '-'}</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={12}>
              <Card size="small" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', cursor: 'pointer' }} onClick={() => navigate('/admin/error-logs')}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ inlineSize: 32, blockSize: 32, borderRadius: 8, background: 'rgba(220, 38, 38, 0.12)', color: '#DC2626', display: 'grid', placeItems: 'center' }}>
                    <BugOutlined />
                  </span>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open errors</div>
                    <div className="jm-tnum" style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Inter Tight', 'Inter', sans-serif" }}>{stats?.syncErrors ?? '-'}</div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      {user && (
        <Card size="small" title="Session" style={{ border: '1px dashed var(--jm-border-strong)', background: 'var(--jm-surface-muted)' }}>
          <Space orientation="vertical" size={4} style={{ inlineSize: '100%' }}>
            <Typography.Text style={{ fontSize: 13 }}>Signed in as <strong>{user.fullName}</strong> ({user.userName})</Typography.Text>
            <Space size={4} wrap>
              {user.permissions.slice(0, 10).map((p) => <Tag key={p} style={{ margin: 0 }}>{p}</Tag>)}
              {user.permissions.length > 10 && <Tag style={{ margin: 0 }}>+{user.permissions.length - 10}</Tag>}
            </Space>
          </Space>
        </Card>
      )}
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function QuickAction({ icon, title, description, onClick, accent }: { icon: React.ReactNode; title: string; description: string; onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        inlineSize: '100%', textAlign: 'start', padding: 16,
        background: '#FFFFFF', border: '1px solid var(--jm-border)', borderRadius: 10,
        cursor: 'pointer', transition: 'all 0.12s ease', display: 'flex', gap: 12, alignItems: 'flex-start',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = 'var(--jm-shadow-2)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--jm-border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <span style={{ inlineSize: 36, blockSize: 36, borderRadius: 8, display: 'grid', placeItems: 'center',
        background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent, fontSize: 16, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: 'var(--jm-gray-900)', fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{description}</span>
      </span>
    </button>
  );
}
