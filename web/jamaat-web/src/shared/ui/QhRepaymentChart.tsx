import { useMemo } from 'react';
import { Card, Empty } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import dayjs from 'dayjs';
import { money } from '../format/format';

/// Shared QH repayment-trajectory chart used by both the operator QarzanHasanaDetailPage
/// and the member-portal QH detail page. Builds two cumulative series (Scheduled + Paid)
/// from the installment list and renders them as a dual-line chart - the gap between the
/// two lines is the "behind by X" deficit at any due-date along the loan's life.
///
/// RULES.md §15: a single implementation reused on both sides instead of two parallel
/// copies. Falls back to a no-data Empty when the loan hasn't generated a schedule yet
/// (Draft / L1 / L2 stages).
export type QhRepaymentChartInstallment = {
  id: string;
  dueDate: string;
  scheduledAmount: number;
  paidAmount: number;
};

export function QhRepaymentChart({
  installments, currency,
}: {
  installments: QhRepaymentChartInstallment[];
  currency: string;
}) {
  const trend = useMemo(() => {
    if (!installments.length) return [];
    const sorted = [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    let cumScheduled = 0;
    let cumPaid = 0;
    return sorted.map((i) => {
      cumScheduled += i.scheduledAmount;
      if (i.paidAmount > 0) cumPaid += i.paidAmount;
      return {
        label: dayjs(i.dueDate).format("MMM 'YY"),
        date: i.dueDate,
        scheduled: cumScheduled,
        paid: cumPaid,
      };
    });
  }, [installments]);

  return (
    <Card size="small" title={<span><LineChartOutlined /> Repayment trajectory</span>}
      className="jm-card jm-qh-trend-card"
      extra={<span className="jm-qh-trend-extra">Cumulative scheduled vs paid</span>}>
      {trend.length === 0 ? (
        <Empty description="No installments yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} interval="preserveStartEnd"
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={80} />
            <RTooltip formatter={(v: number) => money(v, currency)}
              labelFormatter={(_l, p) => p[0]?.payload?.date ? dayjs(p[0].payload.date).format('DD MMM YYYY') : ''}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
            <Line type="monotone" dataKey="scheduled" name="Scheduled" stroke="#94A3B8"
              strokeWidth={2} dot={{ r: 2 }} strokeDasharray="6 3" />
            <Line type="monotone" dataKey="paid" name="Paid" stroke="#0E5C40"
              strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
