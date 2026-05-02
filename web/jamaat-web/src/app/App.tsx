import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { MemberPortalLayout } from '../features/portal/me/MemberPortalLayout';
import { MemberHomePage } from '../features/portal/me/MemberHomePage';
import { MemberLoginHistoryPage } from '../features/portal/me/MemberLoginHistoryPage';
import {
  MemberProfilePage as PortalMemberProfilePage,
  MemberContributionsPage,
  MemberCommitmentsPage,
  MemberQhPage,
  MemberGuarantorInboxPage,
  MemberEventsPage,
} from '../features/portal/me/MemberPortalPages';
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


export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Forced first-login change-password screen + free-form rotation. Uses its own
          layout (no AppLayout chrome) and is accessible without a JWT for the forced flow. */}
      <Route path="/change-password" element={<ChangePasswordPage />} />
      {/* Public Event Portal - no auth, no app chrome */}
      <Route path="/portal/events" element={<PortalEventsListPage />} />
      <Route path="/portal/events/:slug" element={<PortalEventPage />} />
      <Route path="/portal/qh-consent/:token" element={<PortalGuarantorConsentPage />} />
      {/* Member self-service portal - signed-in members with portal.access. Uses its own
          MemberPortalLayout (no admin nav). E1 + E8 + E9 are wired this turn; E2-E7 land
          subsequently and route to placeholder cards until then. */}
      <Route
        path="/portal/me"
        element={
          <RequireAuth>
            <RequirePermission anyOf={['portal.access']}><MemberPortalLayout /></RequirePermission>
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
        <Route path="help" element={<HelpPage />} />
        <Route path="me" element={<MePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
