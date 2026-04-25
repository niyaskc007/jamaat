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
        <Route path="members" element={<Gate anyOf={['member.view']}><MembersPage /></Gate>} />
        <Route path="members/:id" element={<Gate anyOf={['member.view']}><MemberProfilePage /></Gate>} />
        <Route path="families" element={<Gate anyOf={['family.view']}><FamiliesPage /></Gate>} />
        <Route path="commitments" element={<Gate anyOf={['commitment.view']}><CommitmentsPage /></Gate>} />
        <Route path="commitments/new" element={<Gate anyOf={['commitment.create']}><NewCommitmentPage /></Gate>} />
        <Route path="commitments/:id" element={<Gate anyOf={['commitment.view']}><CommitmentDetailPage /></Gate>} />
        <Route path="fund-enrollments" element={<Gate anyOf={['enrollment.view']}><FundEnrollmentsPage /></Gate>} />
        <Route path="qarzan-hasana" element={<Gate anyOf={['qh.view']}><QarzanHasanaPage /></Gate>} />
        <Route path="qarzan-hasana/new" element={<Gate anyOf={['qh.create']}><NewQarzanHasanaPage /></Gate>} />
        <Route path="qarzan-hasana/:id" element={<Gate anyOf={['qh.view']}><QarzanHasanaDetailPage /></Gate>} />
        <Route path="events" element={<Gate anyOf={['event.view', 'event.manage', 'event.scan']}><EventsPage /></Gate>} />
        <Route path="events/:id" element={<Gate anyOf={['event.view', 'event.manage', 'event.scan']}><EventDetailPage /></Gate>} />
        <Route path="receipts" element={<Gate anyOf={['receipt.view']}><ReceiptsPage /></Gate>} />
        <Route path="receipts/new" element={<Gate anyOf={['receipt.create']}><NewReceiptPage /></Gate>} />
        <Route path="receipts/:id" element={<Gate anyOf={['receipt.view']}><ReceiptDetailPage /></Gate>} />
        <Route path="vouchers" element={<Gate anyOf={['voucher.view']}><VouchersPage /></Gate>} />
        <Route path="vouchers/new" element={<Gate anyOf={['voucher.create']}><NewVoucherPage /></Gate>} />
        <Route path="vouchers/:id" element={<Gate anyOf={['voucher.view']}><VoucherDetailPage /></Gate>} />
        <Route path="ledger" element={<Gate anyOf={['accounting.view']}><LedgerPage /></Gate>} />
        <Route path="reports" element={<Gate anyOf={['reports.view']}><ReportsPage /></Gate>} />
        <Route path="admin/users" element={<Gate anyOf={['admin.users', 'admin.roles']}><UsersPage /></Gate>} />
        <Route path="admin/master-data" element={<Gate anyOf={['admin.masterdata']}><MasterDataPage /></Gate>} />
        <Route path="admin/integrations" element={<Gate anyOf={['admin.integration']}><IntegrationsPage /></Gate>} />
        <Route path="admin/audit" element={<Gate anyOf={['admin.audit']}><AuditPage /></Gate>} />
        <Route path="admin/error-logs" element={<Gate anyOf={['admin.errorlogs']}><ErrorLogsPage /></Gate>} />
        <Route path="help" element={<HelpPage />} />
        <Route path="me" element={<MePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
