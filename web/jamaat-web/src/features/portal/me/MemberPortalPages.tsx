import { Card, Table, Tag, Typography, Empty, Alert, Space, Button, Descriptions, Modal, Skeleton, App as AntdApp } from 'antd';
import { GiftOutlined, HeartOutlined, BankOutlined, TeamOutlined, CalendarOutlined, UserOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { useState } from 'react';
import { portalMeApi, type ContributionRow, type CommitmentRow, type QhLoanRow, type GuarantorInboxRow, type EventRegistrationRow } from './portalMeApi';
import { authStore } from '../../../shared/auth/authStore';
import { ProfileEditForm } from './ProfileEditForm';

// All five "list" portal pages share identical layout (header + intro + table card),
// captured by the SectionHeader / SectionLayout helpers below + the `.jm-card`/`.jm-page-*`
// classes in app/portal.css. No inline colour/spacing in this file.

// --- Phase B: Self-edit profile -------------------------------------------

export function MemberProfilePage() {
  return (
    <SectionLayout
      title="My profile"
      intro="Update your contact and address details. Submitted changes go through committee review before they go live. Name and identity changes are admin-only."
    >
      <ProfileEditForm />
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
            { title: 'Receipt #', dataIndex: 'receiptNumber', width: 140,
              render: (v: string | null, r: ContributionRow) => v
                ? <Link to={`/portal/me/contributions/${r.id}`} className="jm-tnum">{v}</Link>
                : <em className="jm-muted-em">pending</em> },
            { title: 'Amount', key: 'amt', align: 'end', width: 160,
              render: (_, r: ContributionRow) => <span className="jm-tnum jm-num-strong">{r.amount.toLocaleString()} {r.currency}</span> },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => <Tag color={s === 2 ? 'green' : s === 1 ? 'gold' : 'default'}>{RECEIPT_STATUS[s] ?? s}</Tag> },
            { title: 'Notes', dataIndex: 'notes', render: (v: string | null) => v ?? '-' },
            { title: '', key: 'a', width: 60,
              render: (_, r: ContributionRow) => <Link to={`/portal/me/contributions/${r.id}`}>Open</Link> },
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
      action={canCreate ? <Link to="/portal/me/commitments/new"><Button type="primary" icon={<PlusOutlined />}>New commitment</Button></Link> : undefined}
    >
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<CommitmentRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No commitments yet." /> }}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 140,
              render: (v: string, r: CommitmentRow) => <Link to={`/portal/me/commitments/${r.id}`} className="jm-tnum">{v}</Link> },
            { title: 'Fund', dataIndex: 'fundNameSnapshot' },
            { title: 'Total', key: 'total', align: 'end', width: 140,
              render: (_, r: CommitmentRow) => <span className="jm-tnum">{r.totalAmount.toLocaleString()} {r.currency}</span> },
            { title: 'Paid', key: 'paid', align: 'end', width: 140,
              render: (_, r: CommitmentRow) => <span className="jm-tnum">{r.paidAmount.toLocaleString()} {r.currency}</span> },
            { title: 'Installments', dataIndex: 'installmentCount', width: 120 },
            { title: 'Started', dataIndex: 'startDate', width: 130, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (s: number) => <Tag color={COMMIT_STATUS[s]?.color}>{COMMIT_STATUS[s]?.label ?? s}</Tag> },
            { title: '', key: 'a', width: 60,
              render: (_, r: CommitmentRow) => <Link to={`/portal/me/commitments/${r.id}`}>Open</Link> },
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
      action={canRequest ? <Link to="/portal/me/qarzan-hasana/new"><Button type="primary" icon={<PlusOutlined />}>Request a loan</Button></Link> : undefined}
    >
      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<QhLoanRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No QH applications yet." /> }}
          columns={[
            { title: 'Loan #', dataIndex: 'code', width: 140,
              render: (v: string, r: QhLoanRow) => <Link to={`/portal/me/qarzan-hasana/${r.id}`} className="jm-tnum">{v}</Link> },
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
            { title: '', key: 'a', width: 60,
              render: (_, r: QhLoanRow) => <Link to={`/portal/me/qarzan-hasana/${r.id}`}>Open</Link> },
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
};

const QH_SCHEME_LABEL: Record<number, string> = {
  0: 'Other',
  1: 'Mohammadi (against gold)',
  2: 'Hussain (against kafil)',
};

export function MemberGuarantorInboxPage() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const q = useQuery({ queryKey: ['portal-me-guarantor-inbox'], queryFn: portalMeApi.guarantorInbox });
  const [active, setActive] = useState<GuarantorInboxRow | null>(null);

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accept' | 'decline' }) =>
      portalMeApi.guarantorAct(id, decision),
    onSuccess: (_data, vars) => {
      message.success(vars.decision === 'accept' ? 'You endorsed the loan. Jazakallah khairan.' : 'Decision recorded.');
      qc.invalidateQueries({ queryKey: ['portal-me-guarantor-inbox'] });
      qc.invalidateQueries({ queryKey: ['portal-me-dashboard'] });
      setActive(null);
    },
    onError: (err: Error) => message.error(err.message || 'Could not record your decision.'),
  });

  function confirmDecide(row: GuarantorInboxRow, decision: 'accept' | 'decline') {
    modal.confirm({
      title: decision === 'accept'
        ? `Endorse ${row.loan.borrowerName}'s loan?`
        : `Decline guarantor request from ${row.loan.borrowerName}?`,
      content: decision === 'accept'
        ? `By endorsing, you agree to act as kafil for ${row.loan.amountRequested.toLocaleString()} ${row.loan.currency} over ${row.loan.instalmentsRequested} instalments. If the borrower defaults, the committee may seek the balance from you.`
        : `The borrower will be notified that you are unable to act as kafil. They will need to find another guarantor.`,
      okText: decision === 'accept' ? 'Yes, endorse' : 'Yes, decline',
      okType: decision === 'accept' ? 'primary' : 'danger',
      onOk: () => decide.mutateAsync({ id: row.id, decision }),
    });
  }

  const data = q.data ?? [];
  const pending = data.filter((r) => r.status === 1);
  const past = data.filter((r) => r.status !== 1);

  return (
    <div>
      <SectionLayout
        icon={<TeamOutlined />} title="Guarantor inbox"
        intro="Qarzan Hasana applications where you've been listed as a kafil (guarantor). Review the borrower's case below and either endorse or decline — your decision is recorded against the loan and unlocks the next approval step once all guarantors have responded."
      >
        {q.isLoading ? <Skeleton active /> : data.length === 0 ? (
          <Card className="jm-card">
            <Empty description="No guarantor requests addressed to you." />
          </Card>
        ) : (
          <>
            {pending.length > 0 && (
              <div>
                <Typography.Title level={5} className="jm-portal-section-title">Pending your decision ({pending.length})</Typography.Title>
                <Space direction="vertical" size={16} className="jm-full-width">
                  {pending.map((row) => (
                    <Card key={row.id} className="jm-card jm-portal-inbox-card">
                      <div className="jm-portal-inbox-head">
                        <div>
                          <div className="jm-portal-inbox-title">
                            {row.loan.borrowerName} <span className="jm-muted">·</span>{' '}
                            <span className="jm-tnum">{row.loan.borrowerItsNumber}</span>
                          </div>
                          <div className="jm-portal-inbox-sub">
                            Loan {row.loan.code} · {QH_SCHEME_LABEL[row.loan.scheme] ?? 'Scheme'} · requested {dayjs(row.requestedAtUtc).fromNow()}
                          </div>
                        </div>
                        <Tag color="gold">Pending your response</Tag>
                      </div>

                      <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" className="jm-portal-section-spaced">
                        <Descriptions.Item label="Requested">
                          <span className="jm-tnum jm-num-strong">{row.loan.amountRequested.toLocaleString()} {row.loan.currency}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label="Instalments">{row.loan.instalmentsRequested}</Descriptions.Item>
                        <Descriptions.Item label="Start date">{dayjs(row.loan.startDate).format('DD MMM YYYY')}</Descriptions.Item>
                        {row.loan.monthlyIncome !== null && (
                          <Descriptions.Item label="Monthly income">
                            <span className="jm-tnum">{row.loan.monthlyIncome.toLocaleString()}</span>
                          </Descriptions.Item>
                        )}
                        {row.loan.monthlyExpenses !== null && (
                          <Descriptions.Item label="Monthly expenses">
                            <span className="jm-tnum">{row.loan.monthlyExpenses.toLocaleString()}</span>
                          </Descriptions.Item>
                        )}
                        {row.loan.monthlyExistingEmis !== null && (
                          <Descriptions.Item label="Other EMIs">
                            <span className="jm-tnum">{row.loan.monthlyExistingEmis.toLocaleString()}</span>
                          </Descriptions.Item>
                        )}
                        {row.loan.purpose && (
                          <Descriptions.Item label="Purpose" span={3}>{row.loan.purpose}</Descriptions.Item>
                        )}
                        {row.loan.repaymentPlan && (
                          <Descriptions.Item label="Repayment plan" span={3}>{row.loan.repaymentPlan}</Descriptions.Item>
                        )}
                        {row.loan.sourceOfIncome && (
                          <Descriptions.Item label="Source of income" span={3}>{row.loan.sourceOfIncome}</Descriptions.Item>
                        )}
                      </Descriptions>

                      <Alert type="info" showIcon className="jm-portal-section-spaced"
                        message="Acting as kafil is a serious responsibility."
                        description="If the borrower defaults, the committee may seek the outstanding amount from you. Endorse only if you trust the borrower and can absorb the risk." />

                      <div className="jm-portal-inbox-actions">
                        <Button type="primary" icon={<CheckCircleOutlined />}
                          loading={decide.isPending && decide.variables?.id === row.id && decide.variables?.decision === 'accept'}
                          onClick={() => confirmDecide(row, 'accept')}>Endorse</Button>
                        <Button danger icon={<CloseCircleOutlined />}
                          loading={decide.isPending && decide.variables?.id === row.id && decide.variables?.decision === 'decline'}
                          onClick={() => confirmDecide(row, 'decline')}>Decline</Button>
                        <Button type="link" onClick={() => setActive(row)}>View full details</Button>
                      </div>
                    </Card>
                  ))}
                </Space>
              </div>
            )}

            {past.length > 0 && (
              <div className="jm-portal-section-spaced">
                <Typography.Title level={5} className="jm-portal-section-title">History</Typography.Title>
                <Card className="jm-card" styles={{ body: { padding: 0 } }}>
                  <Table<GuarantorInboxRow>
                    rowKey="id" dataSource={past} pagination={{ pageSize: 20 }} size="small"
                    columns={[
                      { title: 'Requested', dataIndex: 'requestedAtUtc', width: 200, render: (v: string) => dayjs(v).format('DD MMM YYYY HH:mm') },
                      { title: 'Borrower', key: 'b', render: (_, r) => `${r.loan.borrowerName} · ${r.loan.borrowerItsNumber}` },
                      { title: 'Loan', key: 'l', width: 140, render: (_, r) => <span className="jm-tnum">{r.loan.code}</span> },
                      { title: 'Amount', key: 'a', align: 'end', width: 160,
                        render: (_, r) => <span className="jm-tnum">{r.loan.amountRequested.toLocaleString()} {r.loan.currency}</span> },
                      { title: 'My decision', dataIndex: 'status', width: 160,
                        render: (s: number) => <Tag color={GUARANTOR_STATUS[s]?.color}>{GUARANTOR_STATUS[s]?.label ?? s}</Tag> },
                      { title: 'On', dataIndex: 'respondedAtUtc', width: 200,
                        render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—' },
                    ]}
                  />
                </Card>
              </div>
            )}
          </>
        )}
      </SectionLayout>

      <Modal title={active ? `Loan ${active.loan.code}` : ''} open={!!active}
        onCancel={() => setActive(null)} width={720}
        footer={active && active.status === 1 ? [
          <Button key="cancel" onClick={() => setActive(null)}>Close</Button>,
          <Button key="decline" danger icon={<CloseCircleOutlined />}
            onClick={() => confirmDecide(active, 'decline')}>Decline</Button>,
          <Button key="accept" type="primary" icon={<CheckCircleOutlined />}
            onClick={() => confirmDecide(active, 'accept')}>Endorse</Button>,
        ] : null}>
        {active && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Borrower">{active.loan.borrowerName} · <span className="jm-tnum">{active.loan.borrowerItsNumber}</span></Descriptions.Item>
            <Descriptions.Item label="Scheme">{QH_SCHEME_LABEL[active.loan.scheme] ?? active.loan.scheme}</Descriptions.Item>
            <Descriptions.Item label="Amount requested">
              <span className="jm-tnum jm-num-strong">{active.loan.amountRequested.toLocaleString()} {active.loan.currency}</span>
              {' over '}{active.loan.instalmentsRequested} instalments
            </Descriptions.Item>
            <Descriptions.Item label="Start date">{dayjs(active.loan.startDate).format('DD MMM YYYY')}</Descriptions.Item>
            {active.loan.purpose && <Descriptions.Item label="Purpose">{active.loan.purpose}</Descriptions.Item>}
            {active.loan.repaymentPlan && <Descriptions.Item label="Repayment plan">{active.loan.repaymentPlan}</Descriptions.Item>}
            {active.loan.sourceOfIncome && <Descriptions.Item label="Source of income">{active.loan.sourceOfIncome}</Descriptions.Item>}
            {active.loan.monthlyIncome !== null && (
              <Descriptions.Item label="Monthly income">
                <span className="jm-tnum">{active.loan.monthlyIncome.toLocaleString()} {active.loan.currency}</span>
              </Descriptions.Item>
            )}
            {active.loan.monthlyExpenses !== null && (
              <Descriptions.Item label="Monthly expenses">
                <span className="jm-tnum">{active.loan.monthlyExpenses.toLocaleString()} {active.loan.currency}</span>
              </Descriptions.Item>
            )}
            {active.loan.monthlyExistingEmis !== null && (
              <Descriptions.Item label="Other EMIs">
                <span className="jm-tnum">{active.loan.monthlyExistingEmis.toLocaleString()} {active.loan.currency}</span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Requested at">{dayjs(active.requestedAtUtc).format('DD MMM YYYY HH:mm')}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
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
      action={
        // /portal/events is the public anonymous event portal - it has its own minimal chrome
        // and NO member-portal sidebar. Open it in a new tab so the member doesn't lose their
        // /portal/me navigation context when they go browsing.
        <a href="/portal/events" target="_blank" rel="noopener noreferrer">
          <Button type="primary" icon={<PlusOutlined />}>Browse upcoming events</Button>
        </a>
      }
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
