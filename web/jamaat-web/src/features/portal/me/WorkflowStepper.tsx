import { Steps, Alert } from 'antd';

/// Generic workflow visualizer for member-portal detail pages. Replaces the verbose stack
/// of Alert banners we used previously - one Steps component shows the whole journey at a
/// glance, with a follow-up note for the current step's "what's happening / what's next".
///
/// Statuses are passed as a tuple list. The "current" index comes from a value→index lookup
/// the caller provides; rejected/cancelled paths short-circuit the list and show a danger
/// banner instead so the rendering stays linear and obvious.
export type StepDef = { key: string; title: string; description?: string };

export function WorkflowStepper({
  title, steps, currentIndex, terminal, note,
}: {
  title: string;
  steps: StepDef[];
  /** Index of the active step. Use steps.length to indicate "all done". */
  currentIndex: number;
  /** Set when the workflow ended on a non-happy-path (rejected, cancelled, defaulted). */
  terminal?: { type: 'error' | 'warning' | 'info' | 'success'; message: string; description?: string };
  /** Sub-line under the stepper that explains the current step in member-friendly language. */
  note?: string;
}) {
  if (terminal) {
    return (
      <Alert type={terminal.type} showIcon className="jm-portal-dashboard-alert"
        message={terminal.message} description={terminal.description} />
    );
  }
  return (
    <div className="jm-portal-stepper-card">
      <div className="jm-portal-stepper-title">{title}</div>
      <Steps
        size="small" responsive
        current={Math.min(currentIndex, steps.length - 1)}
        items={steps.map((s) => ({ title: s.title, description: s.description }))}
      />
      {note && <div className="jm-portal-stepper-note">{note}</div>}
    </div>
  );
}

// ---- Status mappers ------------------------------------------------------

const QH_STEPS: StepDef[] = [
  { key: 'draft',     title: 'Draft' },
  { key: 'l1',        title: 'L1 review' },
  { key: 'l2',        title: 'L2 review' },
  { key: 'approved',  title: 'Approved' },
  { key: 'disbursed', title: 'Disbursed' },
  { key: 'active',    title: 'Repaying' },
  { key: 'completed', title: 'Repaid' },
];

export function qhWorkflow(status: number, rejectionReason: string | null | undefined) {
  switch (status) {
    case 1:  return { steps: QH_STEPS, currentIndex: 0, note: 'Your application has not been submitted yet.' };
    case 2:  return { steps: QH_STEPS, currentIndex: 1, note: 'Awaiting Level-1 approval (a user with the qh.approve_l1 permission will review).' };
    case 3:  return { steps: QH_STEPS, currentIndex: 2, note: 'Cleared at L1, awaiting Level-2 approval (qh.approve_l2 permission).' };
    case 4:  return { steps: QH_STEPS, currentIndex: 3, note: 'Approved by both levels. Awaiting cashier disbursement.' };
    case 5:  return { steps: QH_STEPS, currentIndex: 4, note: 'Funds disbursed. Repay each instalment via the counter.' };
    case 6:  return { steps: QH_STEPS, currentIndex: 5, note: 'Repayment in progress.' };
    case 7:  return { steps: QH_STEPS, currentIndex: 7, note: 'Loan fully repaid. Jazakallah khairan.' };
    case 8:  return { steps: QH_STEPS, currentIndex: 5, terminal: { type: 'error', message: 'Defaulted', description: 'Repayments are overdue. Contact your committee immediately.' } as const };
    case 9:  return { steps: QH_STEPS, currentIndex: 0, terminal: { type: 'warning', message: 'Cancelled', description: 'No further action will be taken on this application.' } as const };
    case 10: return { steps: QH_STEPS, currentIndex: 0, terminal: { type: 'error', message: 'Application rejected', description: rejectionReason ?? 'Please contact your committee for clarification.' } as const };
    default: return { steps: QH_STEPS, currentIndex: 0, note: '' };
  }
}

const COMMITMENT_STEPS: StepDef[] = [
  { key: 'draft',     title: 'Draft' },
  { key: 'agreement', title: 'Agreement' },
  { key: 'active',    title: 'Active' },
  { key: 'completed', title: 'Completed' },
];

export function commitmentWorkflow(status: number, hasAcceptedAgreement: boolean) {
  switch (status) {
    case 1:  return { steps: COMMITMENT_STEPS, currentIndex: hasAcceptedAgreement ? 2 : 1, note: 'Accept the agreement to activate this commitment and lock in the schedule.' };
    case 2:  return { steps: COMMITMENT_STEPS, currentIndex: 2, note: 'Schedule is running. Pay each instalment via the counter or your usual payment channel.' };
    case 3:  return { steps: COMMITMENT_STEPS, currentIndex: 4, note: 'All instalments paid. Jazakallah khairan.' };
    case 4:  return { steps: COMMITMENT_STEPS, currentIndex: 0, terminal: { type: 'warning', message: 'Cancelled', description: 'No further instalments are scheduled.' } as const };
    case 5:  return { steps: COMMITMENT_STEPS, currentIndex: 2, terminal: { type: 'error', message: 'Defaulted', description: 'Repayments are overdue. Contact your committee.' } as const };
    case 6:  return { steps: COMMITMENT_STEPS, currentIndex: 2, terminal: { type: 'info', message: 'Paused', description: 'Pending instalments are on hold. Contact your committee if you need this resumed.' } as const };
    default: return { steps: COMMITMENT_STEPS, currentIndex: 0, note: '' };
  }
}

const PATRONAGE_STEPS: StepDef[] = [
  { key: 'request',  title: 'Submitted' },
  { key: 'review',   title: 'Admin review' },
  { key: 'active',   title: 'Active' },
];

export function patronageWorkflow(status: number) {
  switch (status) {
    case 1:  return { steps: PATRONAGE_STEPS, currentIndex: 1, note: 'An administrator will review and approve your enrollment request. Once approved, every receipt issued to you against this fund is automatically tracked here.' };
    case 2:  return { steps: PATRONAGE_STEPS, currentIndex: 2, note: 'Receipts that mention this fund accrue against your patronage automatically.' };
    case 3:  return { steps: PATRONAGE_STEPS, currentIndex: 2, terminal: { type: 'info', message: 'Paused', description: 'No receipts will accrue until it is resumed.' } as const };
    case 4:  return { steps: PATRONAGE_STEPS, currentIndex: 0, terminal: { type: 'error', message: 'Cancelled' } as const };
    case 5:  return { steps: PATRONAGE_STEPS, currentIndex: 2, terminal: { type: 'info', message: 'Expired', description: 'The end date has passed.' } as const };
    default: return { steps: PATRONAGE_STEPS, currentIndex: 0, note: '' };
  }
}
