import { Card, Table, Tag, Typography, Empty, Alert, Space, Button, Descriptions, Modal, Skeleton, App as AntdApp, Input, Select } from 'antd';
import { GiftOutlined, HeartOutlined, BankOutlined, TeamOutlined, CalendarOutlined, UserOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { portalMeApi, type ContributionRow, type CommitmentRow, type QhLoanRow, type GuarantorInboxRow, type EventRegistrationRow } from './portalMeApi';
import { authStore } from '../../../shared/auth/authStore';
import { ProfileEditForm } from './ProfileEditForm';
import { PageHeader } from '../../../shared/ui/PageHeader';

// Every portal list page reuses three things: the shared <PageHeader>, the StatusTag /
// PortalListCard helpers below, and the .jm-portal-toolbar / .jm-portal-list-card classes
// from portal.css. No inline colour / spacing - per RULES.md §10 those live in the app-level
// stylesheet so the visual language stays consistent and centrally controlled.

type Tone = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple';

/// Status pill that uses portal.css tone tokens instead of AntD's per-call colour string.
function StatusTag({ label, tone }: { label: string; tone: Tone }) {
  return <Tag className="jm-portal-status" data-tone={tone}>{label}</Tag>;
}

/// Card that hosts a list page's filter toolbar + table. Body padding is removed so the
/// table reaches the card edge; the toolbar gets its own border-bottom.
function PortalListCard({ children }: { children: React.ReactNode }) {
  return <Card className="jm-card jm-portal-list-card">{children}</Card>;
}

/// Two-tone "no data" empty state for list cards. Same visual weight as the operator
/// ReceiptsPage empty state so the experience is consistent across the app.
function ListEmpty({ title, sub }: { title: string; sub?: string }) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div className="jm-portal-list-empty">
          <div className="jm-portal-list-empty-title">{title}</div>
          {sub && <div className="jm-portal-list-empty-sub">{sub}</div>}
        </div>
      } />
  );
}

// --- Phase B: Self-edit profile -------------------------------------------

export function MemberProfilePage() {
  return (
    <div>
      <PageHeader title="My profile"
        subtitle="Update your contact and address details. Submitted changes go through committee review before they go live. Name and identity changes are admin-only." />
      <ProfileEditForm />
    </div>
  );
}

// --- Phase E3: Contributions ----------------------------------------------

const RECEIPT_STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Draft',     tone: 'warning' },
  2: { label: 'Confirmed', tone: 'success' },
  3: { label: 'Cancelled', tone: 'default' },
  4: { label: 'Reversed',  tone: 'danger'  },
  5: { label: 'Pending clearance', tone: 'warning' },
};

export function MemberContributionsPage() {
  const q = useQuery({ queryKey: ['portal-me-contributions'], queryFn: portalMeApi.contributions });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (statusFilter !== undefined) r = r.filter((x) => x.status === statusFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter((x) => (x.receiptNumber ?? '').toLowerCase().includes(s)
        || (x.notes ?? '').toLowerCase().includes(s));
    }
    return r;
  }, [q.data, search, statusFilter]);

  return (
    <div>
      <PageHeader title="Contributions"
        subtitle="Receipts issued in your name. Click any row to view + download a duplicate copy." />
      <PortalListCard>
        <div className="jm-portal-toolbar">
          <Input prefix={<SearchOutlined />} allowClear placeholder="Search receipt # or notes"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select allowClear placeholder="Status" value={statusFilter}
            onChange={(v) => setStatusFilter(v as number | undefined)}
            options={Object.entries(RECEIPT_STATUS).map(([v, m]) => ({ value: Number(v), label: m.label }))} />
          <span className="jm-portal-toolbar-spacer" />
          <Button icon={<ReloadOutlined />} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading} />
        </div>
        <Table<ContributionRow>
          rowKey="id" size="middle" loading={q.isLoading} dataSource={rows}
          pagination={{ pageSize: 20, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          locale={{ emptyText: <ListEmpty title="No contributions on record" sub="Receipts issued in your name will appear here." /> }}
          onRow={(r) => ({ onClick: () => { window.location.href = `/portal/me/contributions/${r.id}`; } })}
          columns={[
            { title: 'Date', dataIndex: 'receiptDate', width: 140, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Receipt #', dataIndex: 'receiptNumber', width: 160,
              render: (v: string | null, r: ContributionRow) => v
                ? <Link to={`/portal/me/contributions/${r.id}`} className="jm-portal-mono-link">{v}</Link>
                : <em className="jm-muted-em">pending</em> },
            { title: 'Amount', key: 'amt', align: 'end', width: 160,
              render: (_, r: ContributionRow) => <span className="jm-tnum jm-num-strong">{r.amount.toLocaleString()} {r.currency}</span> },
            { title: 'Status', dataIndex: 'status', width: 140,
              render: (s: number) => {
                const m = RECEIPT_STATUS[s] ?? { label: String(s), tone: 'default' as Tone };
                return <StatusTag label={m.label} tone={m.tone} />;
              } },
            { title: 'Notes', dataIndex: 'notes', render: (v: string | null) => v ?? '—' },
          ]}
        />
      </PortalListCard>
    </div>
  );
}

// --- Phase E4: Commitments ------------------------------------------------

const COMMIT_STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Draft',      tone: 'warning' },
  2: { label: 'Active',     tone: 'success' },
  3: { label: 'Completed',  tone: 'info' },
  4: { label: 'Cancelled',  tone: 'danger' },
  5: { label: 'Defaulted',  tone: 'danger' },
  6: { label: 'Paused',     tone: 'warning' },
};

export function MemberCommitmentsPage() {
  const q = useQuery({ queryKey: ['portal-me-commitments'], queryFn: portalMeApi.commitments });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);
  const user = authStore.getUser();
  const canCreate = user?.permissions.includes('portal.commitments.create.own');

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (statusFilter !== undefined) r = r.filter((x) => x.status === statusFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter((x) => x.code.toLowerCase().includes(s) || x.fundNameSnapshot.toLowerCase().includes(s));
    }
    return r;
  }, [q.data, search, statusFilter]);

  return (
    <div>
      <PageHeader title="Commitments"
        subtitle="Active and historical pledges. Click any row to see the schedule, payment history, and agreement."
        actions={canCreate
          ? <Link to="/portal/me/commitments/new">
              <Button type="primary" icon={<PlusOutlined />}>New commitment</Button>
            </Link>
          : null} />
      <PortalListCard>
        <div className="jm-portal-toolbar">
          <Input prefix={<SearchOutlined />} allowClear placeholder="Search code or fund"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select allowClear placeholder="Status" value={statusFilter}
            onChange={(v) => setStatusFilter(v as number | undefined)}
            options={Object.entries(COMMIT_STATUS).map(([v, m]) => ({ value: Number(v), label: m.label }))} />
          <span className="jm-portal-toolbar-spacer" />
          <Button icon={<ReloadOutlined />} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading} />
        </div>
        <Table<CommitmentRow>
          rowKey="id" size="middle" loading={q.isLoading} dataSource={rows}
          pagination={{ pageSize: 20, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          locale={{ emptyText: <ListEmpty title="No commitments yet" sub="Use the New commitment button to make a pledge." /> }}
          onRow={(r) => ({ onClick: () => { window.location.href = `/portal/me/commitments/${r.id}`; } })}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 140,
              render: (v: string, r: CommitmentRow) => <Link to={`/portal/me/commitments/${r.id}`} className="jm-portal-mono-link">{v}</Link> },
            { title: 'Fund', dataIndex: 'fundNameSnapshot' },
            { title: 'Total', key: 'total', align: 'end', width: 140,
              render: (_, r: CommitmentRow) => <span className="jm-tnum">{r.totalAmount.toLocaleString()} {r.currency}</span> },
            { title: 'Paid', key: 'paid', align: 'end', width: 140,
              render: (_, r: CommitmentRow) => <span className="jm-tnum">{r.paidAmount.toLocaleString()} {r.currency}</span> },
            { title: 'Instalments', dataIndex: 'installmentCount', width: 120, align: 'end' },
            { title: 'Started', dataIndex: 'startDate', width: 130, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Status', dataIndex: 'status', width: 140,
              render: (s: number) => {
                const m = COMMIT_STATUS[s] ?? { label: String(s), tone: 'default' as Tone };
                return <StatusTag label={m.label} tone={m.tone} />;
              } },
          ]}
        />
      </PortalListCard>
    </div>
  );
}

// --- Phase E5: Qarzan Hasana ----------------------------------------------

const QH_STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Draft',         tone: 'default' },
  2: { label: 'L1 review',     tone: 'warning' },
  3: { label: 'L2 review',     tone: 'warning' },
  4: { label: 'Approved',      tone: 'success' },
  5: { label: 'Disbursed',     tone: 'info'    },
  6: { label: 'Active',        tone: 'info'    },
  7: { label: 'Completed',     tone: 'success' },
  8: { label: 'Defaulted',     tone: 'danger'  },
  9: { label: 'Cancelled',     tone: 'default' },
  10:{ label: 'Rejected',      tone: 'danger'  },
};

export function MemberQhPage() {
  const q = useQuery({ queryKey: ['portal-me-qh'], queryFn: portalMeApi.qarzanHasana });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);
  const user = authStore.getUser();
  const canRequest = user?.permissions.includes('portal.qh.request');

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (statusFilter !== undefined) r = r.filter((x) => x.status === statusFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter((x) => x.code.toLowerCase().includes(s));
    }
    return r;
  }, [q.data, search, statusFilter]);

  return (
    <div>
      <PageHeader title="Qarzan Hasana"
        subtitle="Your benevolent loan applications + active loans. New requests go through L1 + L2 approval."
        actions={canRequest
          ? <Link to="/portal/me/qarzan-hasana/new">
              <Button type="primary" icon={<PlusOutlined />}>Request a loan</Button>
            </Link>
          : null} />
      <PortalListCard>
        <div className="jm-portal-toolbar">
          <Input prefix={<SearchOutlined />} allowClear placeholder="Search loan code"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select allowClear placeholder="Status" value={statusFilter}
            onChange={(v) => setStatusFilter(v as number | undefined)}
            options={Object.entries(QH_STATUS).map(([v, m]) => ({ value: Number(v), label: m.label }))} />
          <span className="jm-portal-toolbar-spacer" />
          <Button icon={<ReloadOutlined />} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading} />
        </div>
        <Table<QhLoanRow>
          rowKey="id" size="middle" loading={q.isLoading} dataSource={rows}
          pagination={{ pageSize: 20, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          locale={{ emptyText: <ListEmpty title="No QH applications yet" sub="Use the Request a loan button to start one." /> }}
          onRow={(r) => ({ onClick: () => { window.location.href = `/portal/me/qarzan-hasana/${r.id}`; } })}
          columns={[
            { title: 'Loan #', dataIndex: 'code', width: 140,
              render: (v: string, r: QhLoanRow) => <Link to={`/portal/me/qarzan-hasana/${r.id}`} className="jm-portal-mono-link">{v}</Link> },
            { title: 'Started', dataIndex: 'startDate', width: 130, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
            { title: 'Requested', key: 'req', align: 'end', width: 140,
              render: (_, r: QhLoanRow) => <span className="jm-tnum">{r.amountRequested.toLocaleString()} {r.currency}</span> },
            { title: 'Approved', key: 'app', align: 'end', width: 140,
              render: (_, r: QhLoanRow) => <span className="jm-tnum">{r.amountApproved.toLocaleString()} {r.currency}</span> },
            { title: 'Repaid', key: 'rep', align: 'end', width: 140,
              render: (_, r: QhLoanRow) => <span className="jm-tnum">{r.amountRepaid.toLocaleString()} {r.currency}</span> },
            { title: 'Instalments', dataIndex: 'installmentCount', width: 120, align: 'end' },
            { title: 'Status', dataIndex: 'status', width: 140,
              render: (s: number) => {
                const m = QH_STATUS[s] ?? { label: String(s), tone: 'default' as Tone };
                return <StatusTag label={m.label} tone={m.tone} />;
              } },
          ]}
        />
      </PortalListCard>
    </div>
  );
}

// --- Phase E6: Guarantor inbox --------------------------------------------

const GUARANTOR_STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Pending response', tone: 'warning' },
  2: { label: 'Endorsed', tone: 'success' },
  3: { label: 'Declined', tone: 'danger'  },
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
      <PageHeader title="Guarantor inbox"
        subtitle="Qarzan Hasana applications where you've been listed as a kafil (guarantor). Review the borrower's case and endorse or decline." />
      <div>
        {q.isLoading ? <Skeleton active /> : data.length === 0 ? (
          <Card className="jm-card">
            <ListEmpty title="No guarantor requests addressed to you" sub="When a fellow member nominates you as kafil for a Qarzan Hasana application, it lands here." />
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
                        <StatusTag label="Pending your response" tone="warning" />
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
                <PortalListCard>
                  <Table<GuarantorInboxRow>
                    rowKey="id" dataSource={past} pagination={{ pageSize: 20 }} size="middle"
                    columns={[
                      { title: 'Requested', dataIndex: 'requestedAtUtc', width: 200, render: (v: string) => dayjs(v).format('DD MMM YYYY HH:mm') },
                      { title: 'Borrower', key: 'b', render: (_, r) => `${r.loan.borrowerName} · ${r.loan.borrowerItsNumber}` },
                      { title: 'Loan', key: 'l', width: 140, render: (_, r) => <span className="jm-portal-mono-link">{r.loan.code}</span> },
                      { title: 'Amount', key: 'a', align: 'end', width: 160,
                        render: (_, r) => <span className="jm-tnum">{r.loan.amountRequested.toLocaleString()} {r.loan.currency}</span> },
                      { title: 'My decision', dataIndex: 'status', width: 160,
                        render: (s: number) => {
                          const m = GUARANTOR_STATUS[s] ?? { label: String(s), tone: 'default' as Tone };
                          return <StatusTag label={m.label} tone={m.tone} />;
                        } },
                      { title: 'On', dataIndex: 'respondedAtUtc', width: 200,
                        render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—' },
                    ]}
                  />
                </PortalListCard>
              </div>
            )}
          </>
        )}
      </div>

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

const REG_STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Pending',     tone: 'warning' },
  2: { label: 'Confirmed',   tone: 'success' },
  3: { label: 'Waitlisted',  tone: 'info'    },
  4: { label: 'Cancelled',   tone: 'default' },
  5: { label: 'Checked-in',  tone: 'success' },
  6: { label: 'No-show',     tone: 'danger'  },
};

export function MemberEventsPage() {
  const q = useQuery({ queryKey: ['portal-me-events'], queryFn: portalMeApi.events });
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (statusFilter !== undefined) r = r.filter((x) => x.status === statusFilter);
    return r;
  }, [q.data, statusFilter]);

  return (
    <div>
      <PageHeader title="Events"
        subtitle="Your event registrations. Browse upcoming events to register for new ones (opens in a new tab so you keep this page)."
        actions={
          // /portal/events is the public anonymous event portal - opens in new tab to keep the
          // member-portal sidebar context.
          <a href="/portal/events" target="_blank" rel="noopener noreferrer">
            <Button type="primary" icon={<PlusOutlined />}>Browse upcoming events</Button>
          </a>
        } />
      <PortalListCard>
        <div className="jm-portal-toolbar">
          <Select allowClear placeholder="Status" value={statusFilter}
            onChange={(v) => setStatusFilter(v as number | undefined)}
            options={Object.entries(REG_STATUS).map(([v, m]) => ({ value: Number(v), label: m.label }))} />
          <span className="jm-portal-toolbar-spacer" />
          <Button icon={<ReloadOutlined />} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading} />
        </div>
        <Table<EventRegistrationRow>
          rowKey="id" size="middle" loading={q.isLoading} dataSource={rows}
          pagination={{ pageSize: 20, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
          locale={{ emptyText: <ListEmpty title="No event registrations yet" sub="Use Browse upcoming events to register." /> }}
          columns={[
            { title: 'Registered', dataIndex: 'registeredAtUtc', width: 200, render: (v: string) => dayjs(v).format('DD MMM YYYY HH:mm') },
            { title: 'Code', dataIndex: 'registrationCode', width: 160,
              render: (v: string) => <span className="jm-portal-mono-link">{v}</span> },
            { title: 'Status', dataIndex: 'status', width: 140,
              render: (s: number) => {
                const m = REG_STATUS[s] ?? { label: String(s), tone: 'default' as Tone };
                return <StatusTag label={m.label} tone={m.tone} />;
              } },
            { title: 'Confirmed', dataIndex: 'confirmedAtUtc', width: 200,
              render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—' },
            { title: 'Checked in', dataIndex: 'checkedInAtUtc', width: 200,
              render: (v: string | null) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—' },
          ]}
        />
      </PortalListCard>
    </div>
  );
}

// Unused export retained to preserve a public surface for older callers.
export const _icon = UserOutlined;
