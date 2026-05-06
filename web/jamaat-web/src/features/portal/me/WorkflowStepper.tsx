import type { ReactNode } from 'react';
import { Steps, Alert, Tag } from 'antd';
import {
  EditOutlined, FileProtectOutlined, PlayCircleOutlined, CheckCircleOutlined,
  AuditOutlined, BankOutlined, ScheduleOutlined,
  TrophyOutlined, ClockCircleOutlined, SendOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

/// Workflow visualizer for member-portal detail pages. Built on top of AntD <Steps> with
/// custom icons, completion timestamps, and a current-step "what's next" note. Replaces
/// the verbose Alert-stack we had previously - one component shows the journey, the
/// current stage, and its action / wait reason at a glance.
///
/// Terminal states (cancelled, rejected, defaulted, expired) short-circuit the stepper
/// and render a single semantic Alert instead, so the rendering stays linear.
export type StepDef = {
  key: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Filled in by the workflow mapper when a step has been completed - shown beneath the title. */
  completedAt?: string | null;
};

export function WorkflowStepper({
  title, steps, currentIndex, terminal, note,
}: {
  title: string;
  steps: StepDef[];
  currentIndex: number;
  terminal?: { type: 'error' | 'warning' | 'info' | 'success'; message: string; description?: string };
  note?: string;
}) {
  if (terminal) {
    return (
      <Alert type={terminal.type} showIcon className="jm-portal-dashboard-alert"
        message={terminal.message} description={terminal.description} />
    );
  }
  // Step descriptions can be enhanced by the caller. Here we add a "completed at" line
  // when one was provided, since the regular AntD description prop is just a string.
  const items = steps.map((s, i) => {
    const completed = i < currentIndex;
    return {
      title: <span className="jm-portal-stepper-step-title">{s.title}</span>,
      description: (
        <span className="jm-portal-stepper-step-desc">
          {s.description}
          {completed && s.completedAt && (
            <span className="jm-portal-stepper-step-completed">
              <CheckCircleOutlined /> {dayjs(s.completedAt).format('DD MMM YYYY')}
            </span>
          )}
        </span>
      ),
      icon: s.icon,
    };
  });

  return (
    <div className="jm-portal-stepper-card">
      <div className="jm-portal-stepper-head">
        <span className="jm-portal-stepper-title">{title}</span>
        <Tag className="jm-portal-stepper-status">{currentIndex >= steps.length - 1 ? steps[steps.length - 1]?.title : `Step ${currentIndex + 1} of ${steps.length}`}</Tag>
      </div>
      <Steps
        size="default" responsive
        current={Math.min(currentIndex, steps.length - 1)}
        items={items}
      />
      {note && (
        <div className="jm-portal-stepper-note">
          <ClockCircleOutlined /> <span>{note}</span>
        </div>
      )}
    </div>
  );
}

// ---- Status mappers ------------------------------------------------------

const QH_STEPS: StepDef[] = [
  { key: 'draft',     title: 'Draft',         icon: <EditOutlined />,             description: 'Application started' },
  { key: 'l1',        title: 'L1 review',     icon: <AuditOutlined />,            description: 'First-line approver' },
  { key: 'l2',        title: 'L2 review',     icon: <SafetyCertificateOutlined />,description: 'Second-line approver' },
  { key: 'approved',  title: 'Approved',      icon: <CheckCircleOutlined />,      description: 'Approved by committee' },
  { key: 'disbursed', title: 'Disbursed',     icon: <BankOutlined />,             description: 'Funds released' },
  { key: 'active',    title: 'Repaying',      icon: <ScheduleOutlined />,         description: 'Schedule running' },
  { key: 'completed', title: 'Repaid',        icon: <TrophyOutlined />,           description: 'Loan fully repaid' },
];

export function qhWorkflow(
  status: number,
  rejectionReason: string | null | undefined,
  audit?: { level1ApprovedAtUtc?: string | null; level2ApprovedAtUtc?: string | null; disbursedOn?: string | null },
) {
  // Layer the audit timestamps on the static step list so a member can see exactly when
  // each milestone happened. If audit is omitted, the steps render without timestamps.
  const steps: StepDef[] = QH_STEPS.map((s) => {
    if (s.key === 'l1'        && audit?.level1ApprovedAtUtc)  return { ...s, completedAt: audit.level1ApprovedAtUtc };
    if (s.key === 'l2'        && audit?.level2ApprovedAtUtc)  return { ...s, completedAt: audit.level2ApprovedAtUtc };
    if (s.key === 'disbursed' && audit?.disbursedOn)          return { ...s, completedAt: audit.disbursedOn };
    return s;
  });
  switch (status) {
    case 1:  return { steps, currentIndex: 0, note: 'Your application has not been submitted yet.' };
    case 2:  return { steps, currentIndex: 1, note: 'Awaiting Level-1 approval (a user with the qh.approve_l1 permission will review).' };
    case 3:  return { steps, currentIndex: 2, note: 'Cleared at L1, awaiting Level-2 approval (qh.approve_l2 permission).' };
    case 4:  return { steps, currentIndex: 3, note: 'Approved by both levels. Awaiting cashier disbursement.' };
    case 5:  return { steps, currentIndex: 4, note: 'Funds disbursed. Repay each instalment via the counter.' };
    case 6:  return { steps, currentIndex: 5, note: 'Repayment in progress.' };
    case 7:  return { steps, currentIndex: 7, note: 'Loan fully repaid. Jazakallah khairan.' };
    case 8:  return { steps, currentIndex: 5, terminal: { type: 'error', message: 'Defaulted', description: 'Repayments are overdue. Contact your committee immediately.' } as const };
    case 9:  return { steps, currentIndex: 0, terminal: { type: 'warning', message: 'Cancelled', description: 'No further action will be taken on this application.' } as const };
    case 10: return { steps, currentIndex: 0, terminal: { type: 'error', message: 'Application rejected', description: rejectionReason ?? 'Please contact your committee for clarification.' } as const };
    default: return { steps, currentIndex: 0, note: '' };
  }
}

const COMMITMENT_STEPS: StepDef[] = [
  { key: 'draft',     title: 'Draft',     icon: <EditOutlined />,        description: 'Pledge submitted' },
  { key: 'agreement', title: 'Agreement', icon: <FileProtectOutlined />, description: 'Terms accepted' },
  { key: 'active',    title: 'Active',    icon: <PlayCircleOutlined />,  description: 'Schedule running' },
  { key: 'completed', title: 'Completed', icon: <TrophyOutlined />,      description: 'Fully paid' },
];

export function commitmentWorkflow(
  status: number,
  hasAcceptedAgreement: boolean,
  audit?: { agreementAcceptedAtUtc?: string | null; createdAtUtc?: string | null },
) {
  // Mark the Draft step as "completed at createdAtUtc" once the commitment moves past it,
  // and the Agreement step at agreementAcceptedAtUtc. Lets members see when each milestone
  // actually happened.
  const steps: StepDef[] = COMMITMENT_STEPS.map((s) => {
    if (s.key === 'draft'     && audit?.createdAtUtc           && status > 1) return { ...s, completedAt: audit.createdAtUtc };
    if (s.key === 'agreement' && audit?.agreementAcceptedAtUtc)               return { ...s, completedAt: audit.agreementAcceptedAtUtc };
    return s;
  });
  switch (status) {
    case 1:  return { steps, currentIndex: hasAcceptedAgreement ? 2 : 1, note: 'Accept the agreement to activate this commitment and lock in the schedule.' };
    case 2:  return { steps, currentIndex: 2, note: 'Schedule is running. Pay each instalment via the counter or your usual payment channel.' };
    case 3:  return { steps, currentIndex: 4, note: 'All instalments paid. Jazakallah khairan.' };
    case 4:  return { steps, currentIndex: 0, terminal: { type: 'warning', message: 'Cancelled', description: 'No further instalments are scheduled.' } as const };
    case 5:  return { steps, currentIndex: 2, terminal: { type: 'error', message: 'Defaulted', description: 'Repayments are overdue. Contact your committee.' } as const };
    case 6:  return { steps, currentIndex: 2, terminal: { type: 'info', message: 'Paused', description: 'Pending instalments are on hold. Contact your committee if you need this resumed.' } as const };
    default: return { steps, currentIndex: 0, note: '' };
  }
}

const PATRONAGE_STEPS: StepDef[] = [
  { key: 'request', title: 'Submitted',    icon: <SendOutlined />,        description: 'Request received' },
  { key: 'review',  title: 'Admin review', icon: <AuditOutlined />,       description: 'Pending approval' },
  { key: 'active',  title: 'Active',       icon: <CheckCircleOutlined />, description: 'Receipts accruing' },
];

export function patronageWorkflow(status: number, audit?: { createdAtUtc?: string | null }) {
  const steps: StepDef[] = PATRONAGE_STEPS.map((s) => {
    if (s.key === 'request' && audit?.createdAtUtc) return { ...s, completedAt: audit.createdAtUtc };
    return s;
  });
  switch (status) {
    case 1:  return { steps, currentIndex: 1, note: 'An administrator will review and approve your enrollment request. Once approved, every receipt issued to you against this fund is automatically tracked here.' };
    case 2:  return { steps, currentIndex: 2, note: 'Receipts that mention this fund accrue against your patronage automatically.' };
    case 3:  return { steps, currentIndex: 2, terminal: { type: 'info', message: 'Paused', description: 'No receipts will accrue until it is resumed.' } as const };
    case 4:  return { steps, currentIndex: 0, terminal: { type: 'error', message: 'Cancelled' } as const };
    case 5:  return { steps, currentIndex: 2, terminal: { type: 'info', message: 'Expired', description: 'The end date has passed.' } as const };
    default: return { steps, currentIndex: 0, note: '' };
  }
}
