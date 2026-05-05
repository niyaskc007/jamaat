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
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { MembersPage } from '../features/members/MembersPage';
import { MemberProfilePage } from '../features/members/profile/MemberProfilePage';
import { FamiliesPage } from '../features/families/FamiliesPage';
import { CommitmentsPage } from '../features/commitments/CommitmentsPage';
import { NewCommitmentPage } from '../features/commitments/NewCommitmentPage';
import { CommitmentDetailPage } from '../features/commitments/CommitmentDetailPage';
import { FundEnrollmentsPage } from '../features/fund-enrollments/FundEnrollmentsPage';
import { PatronageDetailPage } from '../features/fund-enrollments/PatronageDetailPage';
import { QarzanHasanaPage } from '../features/qarzan-hasana/QarzanHasanaPage';
import { NewQarzanHasanaPage } from '../features/qarzan-hasana/NewQarzanHasanaPage';
import { QarzanHasanaDetailPage } from '../features/qarzan-hasana/QarzanHasanaDetailPage';
import { EventsPage } from '../features/events/EventsPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { PortalEventsListPage } from '../features/portal/PortalEventsListPage';
import { PortalEventPage } from '../features/portal/PortalEventPage';
import { PortalGuarantorConsentPage } from '../features/portal/PortalGuarantorConsentPage';
import { ReceiptsPage } from '../features/receipts/ReceiptsPage';
import { NewReceiptPage } from '../features/receipts/NewReceiptPage';
import { ReceiptDetailPage } from '../features/receipts/ReceiptDetailPage';
import { VouchersPage } from '../features/vouchers/VouchersPage';
import { PostDatedChequesPage } from '../features/post-dated-cheques/PostDatedChequesPage';
import { NewVoucherPage } from '../features/vouchers/NewVoucherPage';
import { VoucherDetailPage } from '../features/vouchers/VoucherDetailPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { DashboardsPage } from '../features/dashboards/DashboardsPage';
import { EventDetailDashboardPage } from '../features/dashboards/EventDetailDashboard';
import { FundTypeDetailDashboardPage } from '../features/dashboards/FundTypeDetailDashboard';
import { MemberDetailDashboardPage } from '../features/dashboards/MemberDetailDashboard';
import { CommitmentDetailDashboardPage } from '../features/dashboards/CommitmentDetailDashboard';
import { LedgerPage } from '../features/ledger/LedgerPage';
import { UsersPage } from '../features/admin/UsersPage';
import { MasterDataPage } from '../features/admin/MasterDataPage';
import { IntegrationsPage } from '../features/admin/IntegrationsPage';
import { AuditPage } from '../features/admin/AuditPage';
import { ErrorLogsPage } from '../features/admin/error-logs/ErrorLogsPage';
import { NotificationLogPage } from '../features/admin/notifications/NotificationLogPage';
import { AdministrationPage } from '../features/admin/AdministrationPage';
import { ReliabilityDashboard } from '../features/admin/reliability/ReliabilityDashboard';
import { ChangeRequestsPage } from '../features/admin/change-requests/ChangeRequestsPage';
import { CmsAdminPage } from '../features/admin/CmsPage';
import { CmsPageView } from '../features/cms/CmsPageView';
import { ApplicationsPage } from '../features/admin/ApplicationsPage';
import { RegisterPage } from '../features/portal/RegisterPage';
import { SystemMonitorPage } from '../features/system/SystemMonitorPage';
import { SystemAnalyticsPage } from '../features/system/SystemAnalyticsPage';
import { analyticsApi } from '../features/system/analyticsApi';
import { AccountingPage } from '../features/accounting/AccountingPage';
import { HelpPage } from '../features/help/HelpPage';
import { MePage } from '../features/me/MePage';
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
            <AppLayout />
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
