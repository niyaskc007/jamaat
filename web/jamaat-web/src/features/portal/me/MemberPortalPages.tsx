import { Card, Table, Tag, Typography, Empty, Alert, Space, Button, Descriptions } from 'antd';
import { GiftOutlined, HeartOutlined, BankOutlined, TeamOutlined, CalendarOutlined, UserOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { portalMeApi, type ContributionRow, type CommitmentRow, type QhLoanRow, type GuarantorRequestRow, type EventRegistrationRow } from './portalMeApi';
import { authStore } from '../../../shared/auth/authStore';

// All five "list" portal pages share identical layout (header + intro + table card),
// captured by the SectionHeader / SectionLayout helpers below + the `.jm-card`/`.jm-page-*`
// classes in app/portal.css. No inline colour/spacing in this file.

// --- Phase E2: Profile ----------------------------------------------------

export function MemberProfilePage() {
  const { data, isLoading } = useQuery({ queryKey: ['portal-me'], queryFn: portalMeApi.me });
  const user = authStore.getUser();

  return (
    <SectionLayout title="My profile"
      intro="Read-only view of your record. To update your phone, address, or family info, file a change request below — your committee reviews and approves it before the change goes live.">
      <Card loading={isLoading} className="jm-card">
        <Descriptions column={1} bordered size="middle">
          <Descriptions.Item label="Full name">{data?.fullName ?? user?.fullName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="ITS number"><span className="jm-tnum">{data?.itsNumber ?? '-'}</span></Descriptions.Item>
          <Descriptions.Item label="Email">{data?.email ?? <em className="jm-muted-em">not on file</em>}</Descriptions.Item>
          <Descriptions.Item label="Phone">{data?.phoneE164 ?? <em className="jm-muted-em">not on file</em>}</Descriptions.Item>
          <Descriptions.Item label="Member id">{data?.memberId ?? '-'}</Descriptions.Item>
        </Descriptions>
        <Alert
          type="info" showIcon className="jm-alert-after-card"
          message="Self-edit form coming next"
          description="The change-request form (with photo upload + family-tree edits) lands in the next portal release. For urgent changes, please contact your committee."
        />
      </Card>
    </SectionLayout>
  );
}

// --- Phase E3: Contributions ----------------------------------------------

const RECEIPT_STATUS: Record<number, string> = { 1: 'Draft', 2: 'Confirmed', 3: 'Cancelled', 4: 'Reversed' };

export function MemberContributionsPage() {
  const q = useQuery({ queryKey: ['portal-me-contributions'], queryFn: portalMeApi.contributions });
  return (
    <SectionLayout
      icon={<GiftOutlined />} title="My contributions"
      intro="Receipts issued in your name. Sorted newest first."
    >
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<ContributionRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No contributions on record." /> }}
          columns={[
            { title: 'Date', dataIndex: 'receiptDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Receipt #', dataIndex: 'receiptNumber', width: 140, render: (v: string | null) => <span className="jm-tnum">{v ?? <em className="jm-muted-em">pending</em>}</span> },
            { title: 'Amount', key: 'amt', align: 'end', width: 160,
              render: (_, r: ContributionRow) => <span className="jm-tnum jm-num-strong">{r.amount.toLocaleString()} {r.currency}</span> },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => <Tag color={s === 2 ? 'green' : s === 1 ? 'gold' : 'default'}>{RECEIPT_STATUS[s] ?? s}</Tag> },
            { title: 'Notes', dataIndex: 'notes', render: (v: string | null) => v ?? '-' },
          ]}
        />
      </Card>
    </SectionLayout>
  );
}

// --- Phase E4: Commitments ------------------------------------------------

const COMMIT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Draft', color: 'default' },
  2: { label: 'Active', color: 'green' },
  3: { label: 'Completed', color: 'blue' },
  4: { label: 'Cancelled', color: 'red' },
  5: { label: 'Waived', color: 'purple' },
};

export function MemberCommitmentsPage() {
  const q = useQuery({ queryKey: ['portal-me-commitments'], queryFn: portalMeApi.commitments });
  const user = authStore.getUser();
  const canCreate = user?.permissions.includes('portal.commitments.create.own');

  return (
    <SectionLayout
      icon={<HeartOutlined />} title="My commitments"
      intro={'Active and historical pledges. The "New commitment" button opens the standard commitment form scoped to your record.'}
      action={canCreate ? <Link to="/commitments/new"><Button type="primary" icon={<PlusOutlined />}>New commitment</Button></Link> : undefined}
    >
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<CommitmentRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No commitments yet." /> }}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 140, render: (v: string) => <span className="jm-tnum">{v}</span> },
            { title: 'Fund', dataIndex: 'fundNameSnapshot' },
            { title: 'Total', key: 'total', align: 'end', width: 140,
              render: (_, r: CommitmentRow) => <span className="jm-tnum">{r.totalAmount.toLocaleString()} {r.currency}</span> },
            { title: 'Paid', key: 'paid', align: 'end', width: 140,
              render: (_, r: CommitmentRow) => <span className="jm-tnum">{r.paidAmount.toLocaleString()} {r.currency}</span> },
            { title: 'Installments', dataIndex: 'installmentCount', width: 120 },
            { title: 'Started', dataIndex: 'startDate', width: 130, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => <Tag color={COMMIT_STATUS[s]?.color}>{COMMIT_STATUS[s]?.label ?? s}</Tag> },
          ]}
        />
      </Card>
    </SectionLayout>
  );
}

// --- Phase E5: Qarzan Hasana ----------------------------------------------

const QH_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Requested', color: 'gold' },
  2: { label: 'L1 Pending', color: 'gold' },
  3: { label: 'L2 Pending', color: 'gold' },
  4: { label: 'Approved', color: 'green' },
  5: { label: 'Disbursed', color: 'blue' },
  6: { label: 'Active', color: 'cyan' },
  7: { label: 'Repaid', color: 'green' },
  8: { label: 'Cancelled', color: 'red' },
  9: { label: 'Defaulted', color: 'red' },
  10: { label: 'Waived', color: 'purple' },
};

export function MemberQhPage() {
  const q = useQuery({ queryKey: ['portal-me-qh'], queryFn: portalMeApi.qarzanHasana });
  const user = authStore.getUser();
  const canRequest = user?.permissions.includes('portal.qh.request');

  return (
    <SectionLayout
      icon={<BankOutlined />} title="Qarzan Hasana"
      intro="Your existing Qarzan Hasana applications and loans. New requests go through the standard L1 + L2 approval workflow."
      action={canRequest ? <Link to="/qarzan-hasana/new"><Button type="primary" icon={<PlusOutlined />}>Request a loan</Button></Link> : undefined}
    >
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<QhLoanRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No QH applications yet." /> }}
          columns={[
            { title: 'Loan #', dataIndex: 'code', width: 140, render: (v: string) => <span className="jm-tnum">{v}</span> },
            { title: 'Started', dataIndex: 'startDate', width: 130, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Requested', key: 'req', align: 'end', width: 140,
              render: (_, r: QhLoanRow) => <span className="jm-tnum">{r.amountRequested.toLocaleString()} {r.currency}</span> },
            { title: 'Approved', key: 'app', align: 'end', width: 140,
              render: (_, r: QhLoanRow) => <span className="jm-tnum">{r.amountApproved.toLocaleString()} {r.currency}</span> },
            { title: 'Repaid', key: 'rep', align: 'end', width: 140,
              render: (_, r: QhLoanRow) => <span className="jm-tnum">{r.amountRepaid.toLocaleString()} {r.currency}</span> },
            { title: 'Installments', dataIndex: 'installmentCount', width: 120 },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => <Tag color={QH_STATUS[s]?.color}>{QH_STATUS[s]?.label ?? s}</Tag> },
          ]}
        />
      </Card>
    </SectionLayout>
  );
}

// --- Phase E6: Guarantor inbox --------------------------------------------

const GUARANTOR_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending response', color: 'gold' },
  2: { label: 'Endorsed', color: 'green' },
  3: { label: 'Declined', color: 'red' },
  4: { label: 'Expired', color: 'default' },
};

export function MemberGuarantorInboxPage() {
  const q = useQuery({ queryKey: ['portal-me-guarantor-inbox'], queryFn: portalMeApi.guarantorInbox });
  return (
    <SectionLayout
      icon={<TeamOutlined />} title="Guarantor inbox"
      intro={"Qarzan Hasana applications where you've been listed as a guarantor. Click Endorse / Decline on any pending row to advance the workflow — your decision is recorded against the loan and unlocks the next approval step once all guarantors have responded."}
    >
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<GuarantorRequestRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No guarantor requests addressed to you." /> }}
          columns={[
            { title: 'Requested', dataIndex: 'requestedAtUtc', width: 200, render: (v: string) => dayjs(v).format('DD MMM YYYY HH:mm') },
            { title: 'Loan id', dataIndex: 'loanId', width: 240, render: (v: string) => <span className="jm-tnum jm-loc-ip">{v}</span> },
            { title: 'Status', dataIndex: 'status', width: 160,
              render: (s: number) => <Tag color={GUARANTOR_STATUS[s]?.color}>{GUARANTOR_STATUS[s]?.label ?? s}</Tag> },
            { title: 'Action', key: 'a', width: 200,
              render: (_, r: GuarantorRequestRow) => r.status === 1
                ? <Space>
                    <Link to={`/portal/qh-consent/${r.token}`}><Button type="primary" size="small">Endorse / Decline</Button></Link>
                  </Space>
                : <span className="jm-muted">—</span>
            },
          ]}
        />
      </Card>
    </SectionLayout>
  );
}

// --- Phase E7: Events -----------------------------------------------------

const REG_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending', color: 'gold' },
  2: { label: 'Confirmed', color: 'green' },
  3: { label: 'Waitlisted', color: 'blue' },
  4: { label: 'Cancelled', color: 'default' },
  5: { label: 'Checked-in', color: 'cyan' },
  6: { label: 'No-show', color: 'red' },
};

export function MemberEventsPage() {
  const q = useQuery({ queryKey: ['portal-me-events'], queryFn: portalMeApi.events });
  return (
    <SectionLayout
      icon={<CalendarOutlined />} title="Events"
      intro="Your event registrations. The Browse button opens the public event portal where you can register for new ones."
      action={<Link to="/portal/events"><Button type="primary" icon={<PlusOutlined />}>Browse upcoming events</Button></Link>}
    >
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<EventRegistrationRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No event registrations yet." /> }}
          columns={[
            { title: 'Registered', dataIndex: 'registeredAtUtc', width: 200, render: (v: string) => dayjs(v).format('DD MMM YYYY HH:mm') },
            { title: 'Code', dataIndex: 'registrationCode', width: 160, render: (v: string) => <span className="jm-tnum jm-num-strong">{v}</span> },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => <Tag color={REG_STATUS[s]?.color}>{REG_STATUS[s]?.label ?? s}</Tag> },
            { title: 'Confirmed', dataIndex: 'confirmedAtUtc', width: 200,
              render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—' },
            { title: 'Checked in', dataIndex: 'checkedInAtUtc', width: 200,
              render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—' },
          ]}
        />
      </Card>
    </SectionLayout>
  );
}

// --- Shared layout helpers ------------------------------------------------

function SectionLayout({ icon, title, intro, action, children }: {
  icon?: React.ReactNode;
  title: string;
  intro: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="jm-section-head">
        <Typography.Title level={4} className="jm-section-title">
          {icon}{icon ? ' ' : ''}{title}
        </Typography.Title>
        {action}
      </div>
      <Typography.Paragraph type="secondary" className="jm-page-intro">{intro}</Typography.Paragraph>
      {children}
    </div>
  );
}

// Unused export retained to preserve a public surface for older callers.
export const _icon = UserOutlined;
