import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import { AppLayout } from './AppLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { SetupWizardPage } from '../features/setup/SetupWizardPage';
import { setupApi } from '../features/setup/setupApi';
import { env } from '../shared/config/env';

// Member portal is lazy-loaded so members never download operator JS. Each page is its own
// chunk; the `Suspense` boundary inside the portal route renders a small spinner during the
// initial chunk fetch. Operators who happen to open /portal/me get the same chunk on demand.
const MemberPortalLayout = lazy(() => import('../features/portal/me/MemberPortalLayout').then((m) => ({ default: m.MemberPortalLayout })));
const MemberHomePage = lazy(() => import('../features/portal/me/MemberHomePage').then((m) => ({ default: m.MemberHomePage })));
const MemberLoginHistoryPage = lazy(() => import('../features/portal/me/MemberLoginHistoryPage').then((m) => ({ default: m.MemberLoginHistoryPage })));
const PortalMemberProfilePage = lazy(() => import('../features/portal/me/MemberPortalPages').then((m) => ({ default: m.MemberProfilePage })));
const MemberContributionsPage = lazy(() => import('../features/portal/me/MemberPortalPages').then((m) => ({ default: m.MemberContributionsPage })));
const MemberCommitmentsPage = lazy(() => import('../features/portal/me/MemberPortalPages').then((m) => ({ default: m.MemberCommitmentsPage })));
const MemberQhPage = lazy(() => import('../features/portal/me/MemberPortalPages').then((m) => ({ default: m.MemberQhPage })));
const MemberGuarantorInboxPage = lazy(() => import('../features/portal/me/MemberPortalPages').then((m) => ({ default: m.MemberGuarantorInboxPage })));
const MemberEventsPage = lazy(() => import('../features/portal/me/MemberPortalPages').then((m) => ({ default: m.MemberEventsPage })));
// Phase H: code-split. Operator features lazy-load by route so the initial bundle stays
// small. The auth flow (LoginPage, ChangePasswordPage, SetupWizardPage) and the chrome
// (AppLayout, RequireAuth) stay eagerly imported because they are on the boot path. Public
// portal pages (PortalEventsListPage etc.) also stay eager because they are tiny + reachable
// before any operator JS would otherwise be needed.
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MembersPage = lazy(() => import('../features/members/MembersPage').then((m) => ({ default: m.MembersPage })));
const MemberProfilePage = lazy(() => import('../features/members/profile/MemberProfilePage').then((m) => ({ default: m.MemberProfilePage })));
const FamiliesPage = lazy(() => import('../features/families/FamiliesPage').then((m) => ({ default: m.FamiliesPage })));
const CommitmentsPage = lazy(() => import('../features/commitments/CommitmentsPage').then((m) => ({ default: m.CommitmentsPage })));
const NewCommitmentPage = lazy(() => import('../features/commitments/NewCommitmentPage').then((m) => ({ default: m.NewCommitmentPage })));
const CommitmentDetailPage = lazy(() => import('../features/commitments/CommitmentDetailPage').then((m) => ({ default: m.CommitmentDetailPage })));
const FundEnrollmentsPage = lazy(() => import('../features/fund-enrollments/FundEnrollmentsPage').then((m) => ({ default: m.FundEnrollmentsPage })));
const PatronageDetailPage = lazy(() => import('../features/fund-enrollments/PatronageDetailPage').then((m) => ({ default: m.PatronageDetailPage })));
const QarzanHasanaPage = lazy(() => import('../features/qarzan-hasana/QarzanHasanaPage').then((m) => ({ default: m.QarzanHasanaPage })));
const NewQarzanHasanaPage = lazy(() => import('../features/qarzan-hasana/NewQarzanHasanaPage').then((m) => ({ default: m.NewQarzanHasanaPage })));
const QarzanHasanaDetailPage = lazy(() => import('../features/qarzan-hasana/QarzanHasanaDetailPage').then((m) => ({ default: m.QarzanHasanaDetailPage })));
const EventsPage = lazy(() => import('../features/events/EventsPage').then((m) => ({ default: m.EventsPage })));
const EventDetailPage = lazy(() => import('../features/events/EventDetailPage').then((m) => ({ default: m.EventDetailPage })));
import { PortalEventsListPage } from '../features/portal/PortalEventsListPage';
import { PortalEventPage } from '../features/portal/PortalEventPage';
import { PortalGuarantorConsentPage } from '../features/portal/PortalGuarantorConsentPage';
const ReceiptsPage = lazy(() => import('../features/receipts/ReceiptsPage').then((m) => ({ default: m.ReceiptsPage })));
const NewReceiptPage = lazy(() => import('../features/receipts/NewReceiptPage').then((m) => ({ default: m.NewReceiptPage })));
const ReceiptDetailPage = lazy(() => import('../features/receipts/ReceiptDetailPage').then((m) => ({ default: m.ReceiptDetailPage })));
const VouchersPage = lazy(() => import('../features/vouchers/VouchersPage').then((m) => ({ default: m.VouchersPage })));
const PostDatedChequesPage = lazy(() => import('../features/post-dated-cheques/PostDatedChequesPage').then((m) => ({ default: m.PostDatedChequesPage })));
const NewVoucherPage = lazy(() => import('../features/vouchers/NewVoucherPage').then((m) => ({ default: m.NewVoucherPage })));
const VoucherDetailPage = lazy(() => import('../features/vouchers/VoucherDetailPage').then((m) => ({ default: m.VoucherDetailPage })));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const DashboardsPage = lazy(() => import('../features/dashboards/DashboardsPage').then((m) => ({ default: m.DashboardsPage })));
const EventDetailDashboardPage = lazy(() => import('../features/dashboards/EventDetailDashboard').then((m) => ({ default: m.EventDetailDashboardPage })));
const FundTypeDetailDashboardPage = lazy(() => import('../features/dashboards/FundTypeDetailDashboard').then((m) => ({ default: m.FundTypeDetailDashboardPage })));
const MemberDetailDashboardPage = lazy(() => import('../features/dashboards/MemberDetailDashboard').then((m) => ({ default: m.MemberDetailDashboardPage })));
const CommitmentDetailDashboardPage = lazy(() => import('../features/dashboards/CommitmentDetailDashboard').then((m) => ({ default: m.CommitmentDetailDashboardPage })));
const LedgerPage = lazy(() => import('../features/ledger/LedgerPage').then((m) => ({ default: m.LedgerPage })));
const UsersPage = lazy(() => import('../features/admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const MasterDataPage = lazy(() => import('../features/admin/MasterDataPage').then((m) => ({ default: m.MasterDataPage })));
const IntegrationsPage = lazy(() => import('../features/admin/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));
const AuditPage = lazy(() => import('../features/admin/AuditPage').then((m) => ({ default: m.AuditPage })));
const ErrorLogsPage = lazy(() => import('../features/admin/error-logs/ErrorLogsPage').then((m) => ({ default: m.ErrorLogsPage })));
const NotificationLogPage = lazy(() => import('../features/admin/notifications/NotificationLogPage').then((m) => ({ default: m.NotificationLogPage })));
const AdministrationPage = lazy(() => import('../features/admin/AdministrationPage').then((m) => ({ default: m.AdministrationPage })));
const ReliabilityDashboard = lazy(() => import('../features/admin/reliability/ReliabilityDashboard').then((m) => ({ default: m.ReliabilityDashboard })));
const ChangeRequestsPage = lazy(() => import('../features/admin/change-requests/ChangeRequestsPage').then((m) => ({ default: m.ChangeRequestsPage })));
const CmsAdminPage = lazy(() => import('../features/admin/CmsPage').then((m) => ({ default: m.CmsAdminPage })));
import { CmsPageView } from '../features/cms/CmsPageView';
const ApplicationsPage = lazy(() => import('../features/admin/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })));
import { RegisterPage } from '../features/portal/RegisterPage';
const SystemMonitorPage = lazy(() => import('../features/system/SystemMonitorPage').then((m) => ({ default: m.SystemMonitorPage })));
const SystemAnalyticsPage = lazy(() => import('../features/system/SystemAnalyticsPage').then((m) => ({ default: m.SystemAnalyticsPage })));
import { analyticsApi } from '../features/system/analyticsApi';
const AccountingPage = lazy(() => import('../features/accounting/AccountingPage').then((m) => ({ default: m.AccountingPage })));
const HelpPage = lazy(() => import('../features/help/HelpPage').then((m) => ({ default: m.HelpPage })));
const MePage = lazy(() => import('../features/me/MePage').then((m) => ({ default: m.MePage })));
import { RequireAuth } from '../shared/auth/RequireAuth';
import { RequirePermission } from '../shared/auth/RequirePermission';
import type { ReactNode } from 'react';

/// Wrap a route element with a permission check. `anyOf=[]` means "any signed-in user".
const Gate = ({ anyOf, children }: { anyOf: string[]; children: ReactNode }) => (
  <RequirePermission anyOf={anyOf}>{children}</RequirePermission>
);


/// Boot-time guard: probe /setup/status once. If the backend reports no admin user yet,
/// shove the operator at /setup; if setup is already complete and they somehow landed on
/// /setup, redirect them to /login. The probe runs in the background — children render
/// immediately so the public /setup route can paint without a blocking spinner.
function SetupGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useQuery({
    queryKey: ['setup-status'],
    queryFn: setupApi.status,
    // The status flips at most once per install (no admin -> has admin) so cache aggressively.
    // After completion the SPA never needs to re-probe in this session.
    staleTime: 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (!data) return;
    const onSetup = location.pathname.startsWith('/setup');
    // Public surfaces that should keep working even before the wizard runs (e.g. event
    // portal pages don't need an admin). Anything else redirects to /setup.
    const isPublicSurface = location.pathname.startsWith('/portal/events')
      || location.pathname.startsWith('/portal/qh-consent');
    if (data.requiresSetup && !onSetup && !isPublicSurface) {
      navigate('/setup', { replace: true });
    } else if (!data.requiresSetup && onSetup) {
      navigate('/login', { replace: true });
    }
  }, [data, location.pathname, navigate]);
  return <>{children}</>;
}

/// Fires a /api/v1/usage/page event on every route change. Measures the duration of the
/// previous page from one navigation to the next so the analytics dashboard can rank pages
/// by engagement (long dwells) as well as raw views. Skips public-portal + setup + login
/// (no JWT, nothing to attribute) and skips path-equality re-renders.
function PageTracker() {
  const location = useLocation();
  const lastPathRef = useRef<{ path: string; at: number } | null>(null);
  useEffect(() => {
    const path = location.pathname + location.search;
    // Skip public/anonymous surfaces - the API rejects unauthenticated tracker calls anyway.
    if (path.startsWith('/login') || path.startsWith('/setup') || path.startsWith('/change-password')
        || path.startsWith('/portal/events') || path.startsWith('/portal/qh-consent')) {
      lastPathRef.current = null;
      return;
    }
    // De-duplicate identical paths (some Router changes fire twice in StrictMode).
    if (lastPathRef.current?.path === path) return;
    const now = Date.now();
    const durationMs = lastPathRef.current ? now - lastPathRef.current.at : undefined;
    analyticsApi.trackPage(path, durationMs);
    lastPathRef.current = { path, at: now };
  }, [location.pathname, location.search]);
  return null;
}

export function App() {
  return (
    <SetupGate>
      <PageTracker />
    <Routes>
      <Route path="/setup" element={<SetupWizardPage />} />
      <Route path="/login" element={<LoginPage />} />
      {/* Forced first-login change-password screen + free-form rotation. Uses its own
          layout (no AppLayout chrome) and is accessible without a JWT for the forced flow. */}
      <Route path="/change-password" element={<ChangePasswordPage />} />
      {/* Memorable shortcut for members. /m -> ${portalBase}/me. The portalBase env var
          defaults to '/portal' but can be set to '' for a future subdomain split where
          members.jamaat.com hosts only the portal. */}
      <Route path="/m" element={<Navigate to={`${env.portalBase}/me`} replace />} />
      <Route path="/m/*" element={<Navigate to={`${env.portalBase}/me`} replace />} />
      {/* Public Event Portal - no auth, no app chrome */}
      <Route path="/portal/events" element={<PortalEventsListPage />} />
      <Route path="/portal/events/:slug" element={<PortalEventPage />} />
      <Route path="/portal/qh-consent/:token" element={<PortalGuarantorConsentPage />} />
      {/* Public CMS pages (Terms, Privacy, FAQ, etc.). Anonymous - reachable from the login footer. */}
      <Route path="/legal/:slug" element={<CmsPageView />} />
      <Route path="/help/:slug" element={<CmsPageView />} />
      {/* Phase F - public self-registration. Anonymous; admin moderates each submission. */}
      <Route path="/register" element={<RegisterPage />} />
      {/* Member self-service portal - signed-in members with portal.access. Uses its own
          MemberPortalLayout (no admin nav). E1 + E8 + E9 are wired this turn; E2-E7 land
          subsequently and route to placeholder cards until then. */}
      <Route
        path="/portal/me"
        element={
          <RequireAuth>
            <RequirePermission anyOf={['portal.access']}>
              <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', minBlockSize: '100dvh' }}><Spin size="large" /></div>}>
                <MemberPortalLayout />
              </Suspense>
            </RequirePermission>
          </RequireAuth>
        }
      >
        <Route index element={<MemberHomePage />} />
        <Route path="login-history" element={<MemberLoginHistoryPage />} />
        <Route path="profile" element={<PortalMemberProfilePage />} />
        <Route path="contributions" element={<MemberContributionsPage />} />
        <Route path="commitments" element={<MemberCommitmentsPage />} />
        <Route path="qarzan-hasana" element={<MemberQhPage />} />
        <Route path="guarantor-inbox" element={<MemberGuarantorInboxPage />} />
        <Route path="events" element={<MemberEventsPage />} />
      </Route>
      <Route
        element={
          <RequireAuth>
            <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', minBlockSize: '100dvh' }}><Spin size="large" /></div>}>
              <AppLayout />
            </Suspense>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="members" element={<Gate anyOf={['member.view']}><MembersPage /></Gate>} />
        <Route path="members/:id" element={<Gate anyOf={['member.view']}><MemberProfilePage /></Gate>} />
        <Route path="families" element={<Gate anyOf={['family.view']}><FamiliesPage /></Gate>} />
        <Route path="commitments" element={<Gate anyOf={['commitment.view']}><CommitmentsPage /></Gate>} />
        <Route path="commitments/new" element={<Gate anyOf={['commitment.create']}><NewCommitmentPage /></Gate>} />
        <Route path="commitments/:id" element={<Gate anyOf={['commitment.view']}><CommitmentDetailPage /></Gate>} />
        <Route path="fund-enrollments" element={<Gate anyOf={['enrollment.view']}><FundEnrollmentsPage /></Gate>} />
        <Route path="fund-enrollments/:id" element={<Gate anyOf={['enrollment.view']}><PatronageDetailPage /></Gate>} />
        <Route path="qarzan-hasana" element={<Gate anyOf={['qh.view']}><QarzanHasanaPage /></Gate>} />
        <Route path="qarzan-hasana/new" element={<Gate anyOf={['qh.create']}><NewQarzanHasanaPage /></Gate>} />
        <Route path="qarzan-hasana/:id" element={<Gate anyOf={['qh.view']}><QarzanHasanaDetailPage /></Gate>} />
        <Route path="events" element={<Gate anyOf={['event.view', 'event.manage', 'event.scan']}><EventsPage /></Gate>} />
        <Route path="events/:id" element={<Gate anyOf={['event.view', 'event.manage', 'event.scan']}><EventDetailPage /></Gate>} />
        <Route path="receipts" element={<Gate anyOf={['receipt.view']}><ReceiptsPage /></Gate>} />
        <Route path="receipts/new" element={<Gate anyOf={['receipt.create']}><NewReceiptPage /></Gate>} />
        <Route path="receipts/:id" element={<Gate anyOf={['receipt.view']}><ReceiptDetailPage /></Gate>} />
        <Route path="cheques" element={<Gate anyOf={['commitment.view']}><PostDatedChequesPage /></Gate>} />
        <Route path="vouchers" element={<Gate anyOf={['voucher.view']}><VouchersPage /></Gate>} />
        <Route path="vouchers/new" element={<Gate anyOf={['voucher.create']}><NewVoucherPage /></Gate>} />
        <Route path="vouchers/:id" element={<Gate anyOf={['voucher.view']}><VoucherDetailPage /></Gate>} />
        <Route path="accounting" element={<Gate anyOf={['accounting.view']}><AccountingPage /></Gate>} />
        <Route path="ledger" element={<Gate anyOf={['accounting.view']}><LedgerPage /></Gate>} />
        <Route path="reports" element={<Gate anyOf={['reports.view']}><ReportsPage /></Gate>} />
        <Route path="reports/:reportSlug" element={<Gate anyOf={['reports.view']}><ReportsPage /></Gate>} />
        <Route path="dashboards" element={<Gate anyOf={['reports.view', 'accounting.view', 'admin.audit', 'qh.view', 'member.view', 'event.view', 'family.view', 'enrollment.view']}><DashboardsPage /></Gate>} />
        <Route path="dashboards/:dashSlug" element={<Gate anyOf={['reports.view', 'accounting.view', 'admin.audit', 'qh.view', 'member.view', 'event.view', 'family.view', 'enrollment.view']}><DashboardsPage /></Gate>} />
        <Route path="dashboards/events/:eventId" element={<Gate anyOf={['event.view']}><EventDetailDashboardPage /></Gate>} />
        <Route path="dashboards/fund-types/:fundTypeId" element={<Gate anyOf={['accounting.view']}><FundTypeDetailDashboardPage /></Gate>} />
        <Route path="dashboards/members/:memberId" element={<Gate anyOf={['member.view']}><MemberDetailDashboardPage /></Gate>} />
        <Route path="dashboards/commitments/:commitmentId" element={<Gate anyOf={['reports.view']}><CommitmentDetailDashboardPage /></Gate>} />
        <Route path="admin" element={<Gate anyOf={['admin.users', 'admin.roles', 'admin.masterdata', 'admin.integration', 'admin.audit', 'admin.errorlogs']}><AdministrationPage /></Gate>} />
        <Route path="admin/users" element={<Gate anyOf={['admin.users', 'admin.roles']}><UsersPage /></Gate>} />
        <Route path="admin/master-data" element={<Gate anyOf={['admin.masterdata']}><MasterDataPage /></Gate>} />
        <Route path="admin/integrations" element={<Gate anyOf={['admin.integration']}><IntegrationsPage /></Gate>} />
        <Route path="admin/audit" element={<Gate anyOf={['admin.audit']}><AuditPage /></Gate>} />
        <Route path="admin/error-logs" element={<Gate anyOf={['admin.errorlogs']}><ErrorLogsPage /></Gate>} />
        <Route path="admin/notifications" element={<Gate anyOf={['admin.audit']}><NotificationLogPage /></Gate>} />
        <Route path="admin/reliability" element={<Gate anyOf={['admin.reliability']}><ReliabilityDashboard /></Gate>} />
        <Route path="admin/change-requests" element={<Gate anyOf={['member.changes.approve']}><ChangeRequestsPage /></Gate>} />
        <Route path="admin/cms" element={<Gate anyOf={['cms.manage']}><CmsAdminPage /></Gate>} />
        <Route path="admin/applications" element={<Gate anyOf={['admin.users']}><ApplicationsPage /></Gate>} />
        <Route path="system" element={<Gate anyOf={['system.view']}><SystemMonitorPage /></Gate>} />
        <Route path="system/analytics" element={<Gate anyOf={['system.analytics.view']}><SystemAnalyticsPage /></Gate>} />
        <Route path="help" element={<HelpPage />} />
        <Route path="me" element={<MePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </SetupGate>
  );
}
