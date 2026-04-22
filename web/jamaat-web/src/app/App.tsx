import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { MembersPage } from '../features/members/MembersPage';
import { MemberProfilePage } from '../features/members/profile/MemberProfilePage';
import { FamiliesPage } from '../features/families/FamiliesPage';
import { CommitmentsPage } from '../features/commitments/CommitmentsPage';
import { NewCommitmentPage } from '../features/commitments/NewCommitmentPage';
import { CommitmentDetailPage } from '../features/commitments/CommitmentDetailPage';
import { FundEnrollmentsPage } from '../features/fund-enrollments/FundEnrollmentsPage';
import { QarzanHasanaPage } from '../features/qarzan-hasana/QarzanHasanaPage';
import { NewQarzanHasanaPage } from '../features/qarzan-hasana/NewQarzanHasanaPage';
import { QarzanHasanaDetailPage } from '../features/qarzan-hasana/QarzanHasanaDetailPage';
import { EventsPage } from '../features/events/EventsPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { PortalEventsListPage } from '../features/portal/PortalEventsListPage';
import { PortalEventPage } from '../features/portal/PortalEventPage';
import { ReceiptsPage } from '../features/receipts/ReceiptsPage';
import { NewReceiptPage } from '../features/receipts/NewReceiptPage';
import { ReceiptDetailPage } from '../features/receipts/ReceiptDetailPage';
import { VouchersPage } from '../features/vouchers/VouchersPage';
import { NewVoucherPage } from '../features/vouchers/NewVoucherPage';
import { VoucherDetailPage } from '../features/vouchers/VoucherDetailPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { LedgerPage } from '../features/ledger/LedgerPage';
import { UsersPage } from '../features/admin/UsersPage';
import { MasterDataPage } from '../features/admin/MasterDataPage';
import { IntegrationsPage } from '../features/admin/IntegrationsPage';
import { AuditPage } from '../features/admin/AuditPage';
import { ErrorLogsPage } from '../features/admin/error-logs/ErrorLogsPage';
import { HelpPage } from '../features/help/HelpPage';
import { RequireAuth } from '../shared/auth/RequireAuth';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Public Event Portal — no auth, no app chrome */}
      <Route path="/portal/events" element={<PortalEventsListPage />} />
      <Route path="/portal/events/:slug" element={<PortalEventPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="members/:id" element={<MemberProfilePage />} />
        <Route path="families" element={<FamiliesPage />} />
        <Route path="commitments" element={<CommitmentsPage />} />
        <Route path="commitments/new" element={<NewCommitmentPage />} />
        <Route path="commitments/:id" element={<CommitmentDetailPage />} />
        <Route path="fund-enrollments" element={<FundEnrollmentsPage />} />
        <Route path="qarzan-hasana" element={<QarzanHasanaPage />} />
        <Route path="qarzan-hasana/new" element={<NewQarzanHasanaPage />} />
        <Route path="qarzan-hasana/:id" element={<QarzanHasanaDetailPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="receipts" element={<ReceiptsPage />} />
        <Route path="receipts/new" element={<NewReceiptPage />} />
        <Route path="receipts/:id" element={<ReceiptDetailPage />} />
        <Route path="vouchers" element={<VouchersPage />} />
        <Route path="vouchers/new" element={<NewVoucherPage />} />
        <Route path="vouchers/:id" element={<VoucherDetailPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="admin/users" element={<UsersPage />} />
        <Route path="admin/master-data" element={<MasterDataPage />} />
        <Route path="admin/integrations" element={<IntegrationsPage />} />
        <Route path="admin/audit" element={<AuditPage />} />
        <Route path="admin/error-logs" element={<ErrorLogsPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
