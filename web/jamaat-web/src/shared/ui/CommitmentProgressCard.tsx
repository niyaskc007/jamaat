import type { ReactNode } from 'react';
import { Card, Progress } from 'antd';
import { formatDate, money } from '../format/format';

/// Shared progress visualisation for a commitment's repayment health, used by both the
/// operator CommitmentDetailPage and the member-portal commitment detail page. Encapsulates:
///   - Health pill (On track / Behind / Overdue / Completed)
///   - AntD dashboard-style donut with paid % in the center
///   - Three stat rows: Paid / Remaining / Settled-Open-Upcoming counts
///   - Instalment ribbon: one slim cell per instalment, colour-coded by status
///
/// Per RULES.md §15: a single implementation reused in both places, not two parallel copies.
/// The shape is the minimum subset both pages have in their commitment / installment DTOs.
export type CommitmentProgressCardCommitment = {
  currency: string;
  paidAmount: number;
  remainingAmount: number;
  progressPercent: number;
  status: number;
  startDate: string;
  endDate?: string | null;
};

export type CommitmentProgressCardInstallment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  status: number;
};

const InstallmentStatusLabel: Record<number, string> = {
  1: 'Pending', 2: 'Partially paid', 3: 'Paid', 4: 'Overdue', 5: 'Waived',
};

export function CommitmentProgressCard({
  commitment, installments,
}: {
  commitment: CommitmentProgressCardCommitment;
  installments: CommitmentProgressCardInstallment[];
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const dueByToday = installments.filter((i) => i.dueDate <= todayIso).length;
  const settledByToday = installments.filter((i) => i.dueDate <= todayIso && (i.status === 3 || i.status === 5)).length;
  const overdueCount = installments.filter((i) => i.status === 4).length;
  const allSettled = installments.length > 0 && installments.every((i) => i.status === 3 || i.status === 5);

  const health = (() => {
    if (commitment.status === 4 /* Cancelled */) return { label: 'Cancelled',  cls: 'jm-progress-health-default' };
    if (allSettled)                                return { label: 'Completed',  cls: 'jm-progress-health-success' };
    if (overdueCount > 0)                          return { label: `${overdueCount} overdue`, cls: 'jm-progress-health-danger' };
    const deficit = dueByToday - settledByToday;
    if (deficit > 0)                               return { label: `Behind by ${deficit}`,    cls: 'jm-progress-health-warning' };
    const ahead = settledByToday - dueByToday;
    if (ahead > 0)                                 return { label: `Ahead by ${ahead}`,        cls: 'jm-progress-health-success' };
    return                                                { label: 'On track',  cls: 'jm-progress-health-success' };
  })();

  const isCompleted = commitment.status === 3;
  const isFailed = commitment.status === 4 || commitment.status === 5;
  const upcoming = installments.length - dueByToday;
  const open = dueByToday - settledByToday;

  return (
    <Card size="small" className="jm-card jm-progress-card">
      <span className={`jm-progress-health ${health.cls}`}
        title="Computed by comparing instalments paid/waived vs instalments due by today's date.">
        {health.label}
      </span>

      <Progress
        type="dashboard" size={160}
        percent={Math.min(100, Number(commitment.progressPercent.toFixed(1)))}
        strokeColor={isFailed ? '#DC2626' : { '0%': '#10B981', '100%': '#0E5C40' }}
        strokeWidth={10}
        status={isCompleted ? 'success' : isFailed ? 'exception' : 'active'}
        format={(percent) => (
          <div>
            <div className="jm-progress-pct">{percent}%</div>
            <div className="jm-progress-pct-label">paid</div>
          </div>
        )}
      />

      <div className="jm-progress-stats">
        <ProgressRow label="Paid"        value={money(commitment.paidAmount, commitment.currency)} accent />
        <ProgressRow label="Remaining"   value={money(commitment.remainingAmount, commitment.currency)} />
        <ProgressRow label="Instalments" value={`${settledByToday} settled · ${open} open · ${upcoming} upcoming`} muted />
      </div>

      {installments.length > 0 && (
        <div className="jm-progress-ribbon-wrap">
          <div className="jm-progress-ribbon-title">Schedule (oldest to newest)</div>
          <div className="jm-progress-ribbon" data-cells={installments.length}>
            {installments.map((i) => (
              <div key={i.id} className={`jm-progress-cell jm-progress-cell-${ribbonClass(i.status)}`}
                title={`#${i.installmentNo} · due ${i.dueDate} · ${InstallmentStatusLabel[i.status] ?? i.status}`} />
            ))}
          </div>
          <div className="jm-progress-ribbon-foot">
            <span>{formatDate(commitment.startDate)}</span>
            <span>{commitment.endDate ? formatDate(commitment.endDate) : ''}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProgressRow({ label, value, accent, muted }: { label: string; value: ReactNode; accent?: boolean; muted?: boolean }) {
  return (
    <div className="jm-progress-row" data-accent={accent ? 'true' : undefined} data-muted={muted ? 'true' : undefined}>
      <span className="jm-progress-row-label">{label}</span>
      <span className="jm-tnum jm-progress-row-value">{value}</span>
    </div>
  );
}

function ribbonClass(status: number): string {
  switch (status) {
    case 3: return 'paid';
    case 2: return 'partial';
    case 4: return 'overdue';
    case 5: return 'waived';
    default: return 'pending';
  }
}
