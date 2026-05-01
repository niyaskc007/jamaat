import { Card, Row, Col, Tag, Empty, Alert } from 'antd';
import {
  BookOutlined, BarChartOutlined, CalendarOutlined,
  BankOutlined, LineChartOutlined, PieChartOutlined,
  WalletOutlined, RiseOutlined, FallOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { KpiCard } from '../../shared/ui/KpiCard';
import { useAuth } from '../../shared/auth/useAuth';
import { ledgerApi, periodsApi, dashboardApi } from '../ledger/ledgerApi';
import { money } from '../../shared/format/format';
import { useBaseCurrency } from '../../shared/hooks/useBaseCurrency';
import dayjs from 'dayjs';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';

/// Accounting overview / landing. Pulls aggregate balances from the existing
/// /api/v1/ledger/balances endpoint and displays:
///   - Top-line KPIs: total assets / liabilities / income / expenses / net
///   - Open financial period
///   - Liability + asset rollups (so the user immediately sees outstanding QH receivable
///     and returnable obligations - the spec's section-13 concern in numeric form)
///   - Cards to drill into Ledger and Reports
export function AccountingPage() {
  const { hasPermission } = useAuth();
  const baseCurrency = useBaseCurrency();
  const balancesQ = useQuery({
    queryKey: ['ledger-balances', 'today'],
    queryFn: () => ledgerApi.balances(),
    enabled: hasPermission('accounting.view'),
  });
  const periodsQ = useQuery({
    queryKey: ['periods', 'all'],
    queryFn: () => periodsApi.list(),
    enabled: hasPermission('accounting.view'),
  });
  const trendQ = useQuery({
    queryKey: ['accounting', 'income-expense', 12],
    queryFn: () => dashboardApi.incomeExpense(12),
    enabled: hasPermission('accounting.view'),
  });
  const outflowQ = useQuery({
    queryKey: ['accounting', 'outflow-by-category', 30],
    queryFn: () => dashboardApi.outflowByCategory(30, 5),
    enabled: hasPermission('accounting.view'),
  });

  const balances = balancesQ.data ?? [];
  const openPeriod = periodsQ.data?.find((p) => p.status === 1);
  // AccountType: 1=Asset, 2=Liability, 3=Equity, 4=Income, 5=Expense, 6=Fund.
  // The /balances endpoint already flips signs for Liability/Income/Equity/Fund so
  // positive balance = "money in this bucket" regardless of debit-credit nature.
  const sumByCode = (prefix: string) =>
    balances.filter((b) => b.accountCode.startsWith(prefix)).reduce((s, b) => s + b.balance, 0);
  const totalAssets = sumByCode('1');
  const totalLiabilities = sumByCode('3'); // 3xxx liability accounts
  const totalIncome = sumByCode('4');
  const totalExpenses = sumByCode('5');
  const net = totalIncome - totalExpenses;

  return (
    <div>
      <PageHeader title="Accounting"
        subtitle="Financial position, ledger, period management, and reports." />

      {!hasPermission('accounting.view') ? (
        <Empty description="You don't have accounting access. Ask an admin for the accounting.view permission." />
      ) : (
        <>
          {balances.length === 0 && !balancesQ.isLoading && (
            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined />}
              message="No ledger activity yet"
              description="Asset / liability / income / expense rollups appear once receipts and vouchers post to the ledger. Issue your first receipt or voucher to start populating accounting."
              style={{ marginBlockEnd: 16 }}
            />
          )}

          {/* Top-line KPIs - the numbers a treasurer wants in their face the moment they land */}
          <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
            <Col xs={12} md={6}>
              <KpiCard icon={<WalletOutlined />} label="Assets" value={totalAssets} currency={baseCurrency} accent="#0E5C40" />
            </Col>
            <Col xs={12} md={6}>
              <KpiCard icon={<BankOutlined />} label="Liabilities" value={totalLiabilities} currency={baseCurrency}
                caption="Includes returnable contributions still owed back."
                accent="#B45309" />
            </Col>
            <Col xs={12} md={6}>
              <KpiCard icon={<RiseOutlined />} label="Income (lifetime)" value={totalIncome} currency={baseCurrency} accent="#0E5C40" />
            </Col>
            <Col xs={12} md={6}>
              <KpiCard icon={net >= 0 ? <RiseOutlined /> : <FallOutlined />}
                label="Net (income - expenses)"
                value={net}
                currency={baseCurrency}
                caption={`Expenses to date: ${money(totalExpenses, baseCurrency)}`}
                accent={net >= 0 ? '#0E5C40' : '#DC2626'} />
            </Col>
          </Row>

          <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
            <Col xs={24} md={12}>
              <Card size="small" title={<span><CalendarOutlined /> Current period</span>}
                style={{ border: '1px solid var(--jm-border)' }}>
                {openPeriod ? (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBlockEnd: 4 }}>{openPeriod.name}</div>
                    <div style={{ color: 'var(--jm-gray-600)', fontSize: 13 }}>
                      {openPeriod.startDate} {'->'} {openPeriod.endDate}
                      <Tag color="green" style={{ marginInlineStart: 8 }}>Open</Tag>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--jm-warning, #B45309)' }}>
                    No open period. Receipts and vouchers will be rejected until a period is opened.
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              {/* Liability breakdown - this is what the spec audit flagged: 3500 (returnable
                  contributions) and any per-fund liability accounts admins have configured.
                  Visible at a glance so a treasurer knows how much they owe back. */}
              <Card size="small" title={<span><BankOutlined /> Liability breakdown</span>}
                style={{ border: '1px solid var(--jm-border)' }}>
                {balances.filter((b) => b.accountCode.startsWith('3')).length === 0 ? (
                  <Empty description="No liability balances yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <div>
                    {balances.filter((b) => b.accountCode.startsWith('3'))
                      .sort((a, b) => b.balance - a.balance)
                      .slice(0, 5)
                      .map((b) => (
                        <div key={b.accountId} style={{ display: 'flex', justifyContent: 'space-between', marginBlockEnd: 6, fontSize: 13 }}>
                          <span><span className="jm-tnum" style={{ color: 'var(--jm-gray-500)', marginInlineEnd: 6 }}>{b.accountCode}</span>{b.accountName}</span>
                          <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(b.balance, baseCurrency)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* Income vs Expense (last 12 months) - the headline trend a treasurer wants. Both
              series on the same Y-axis so the cashflow gap is visually obvious. */}
          <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
            <Col xs={24} md={16}>
              <Card size="small" title={<span><LineChartOutlined /> Income vs Expense (last 12 months)</span>}
                style={{ border: '1px solid var(--jm-border)' }}>
                {(trendQ.data?.length ?? 0) === 0 ? <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={(trendQ.data ?? []).map((p) => ({
                      ...p,
                      label: dayjs(`${p.year}-${String(p.month).padStart(2, '0')}-01`).format("MMM 'YY"),
                    }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={70} />
                      <RTooltip formatter={(v: number) => money(v, baseCurrency)} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                      <Line type="monotone" dataKey="income" name="Income" stroke="#0E5C40" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="expense" name="Expense" stroke="#DC2626" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            {/* Top expense categories - bar chart of voucher purposes (last 30 days). Free-text
                "purpose" gets bucketed in the backend; chart truncates at 5 + Other so it stays readable. */}
            <Col xs={24} md={8}>
              <Card size="small" title={<span><PieChartOutlined /> Top expense categories (30d)</span>}
                style={{ border: '1px solid var(--jm-border)' }}>
                {(outflowQ.data?.length ?? 0) === 0 ? <Empty description="No vouchers in window" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={outflowQ.data ?? []} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={90} />
                      <RTooltip formatter={(v: number) => money(v, baseCurrency)} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                      <Bar dataKey="amount" fill="#D97706" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* Asset composition - pie of balances grouped by accountCode prefix. Cash (1100), bank
              (1200-1299), receivable (1300-1499), other (everything else under 1xxx). Gives a
              treasurer a "where is the money sitting" snapshot at a glance. */}
          <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
            <Col xs={24} md={12}>
              <Card size="small" title={<span><PieChartOutlined /> Asset composition</span>}
                style={{ border: '1px solid var(--jm-border)' }}>
                <AssetCompositionPie balances={balances} currency={baseCurrency} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title="What you'll see here next" style={{ border: '1px dashed var(--jm-border)', background: 'var(--jm-surface-muted)' }}>
                <ul style={{ fontSize: 13, color: 'var(--jm-gray-700)', paddingInlineStart: 18, marginBlockStart: 4, marginBlockEnd: 0, lineHeight: 1.7 }}>
                  <li>Cash position by bank account (Phase 7)</li>
                  <li>Period-by-period closing balances</li>
                  <li>Returnable obligations aging buckets</li>
                </ul>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 6 }}>
                  We surface gaps here rather than silently omit them, so you know what's coming.
                </div>
              </Card>
            </Col>
          </Row>

          {/* Drill-in cards */}
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12}>
              <Link to="/ledger" style={{ textDecoration: 'none' }}>
                <Card hoverable style={{ border: '1px solid var(--jm-border)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      inlineSize: 40, blockSize: 40, borderRadius: 8,
                      background: '#0E5C401A', color: '#0E5C40',
                      display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0,
                    }}><BookOutlined /></span>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--jm-gray-900, #1F2937)', marginBlockEnd: 4 }}>Ledger</div>
                      <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', lineHeight: 1.5 }}>
                        Every posted journal entry across receipts, vouchers, and reversals.
                        Filter by account, source type, fund, or date range.
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            </Col>
            <Col xs={24} sm={12}>
              <Link to="/reports" style={{ textDecoration: 'none' }}>
                <Card hoverable style={{ border: '1px solid var(--jm-border)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      inlineSize: 40, blockSize: 40, borderRadius: 8,
                      background: '#1E40AF1A', color: '#1E40AF',
                      display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0,
                    }}><BarChartOutlined /></span>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--jm-gray-900, #1F2937)', marginBlockEnd: 4 }}>Reports</div>
                      <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', lineHeight: 1.5 }}>
                        Eleven operational reports: daily collection, fund-wise, cash book, member
                        contribution, returnable contributions, outstanding loans, and more.
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

/// Asset composition pie. Buckets balances under 1xxx (assets) into Cash / Bank / Receivable /
/// Other based on the accountCode prefix. Loan-receivable typically lives at 1500-1999 in our
/// chart of accounts, so we lean on a wider Receivable bucket.
function AssetCompositionPie({ balances, currency }: { balances: { accountId: string; accountCode: string; accountName: string; balance: number }[]; currency: string }) {
  const buckets = balances
    .filter((b) => b.accountCode.startsWith('1') && b.balance > 0)
    .reduce<Record<string, number>>((acc, b) => {
      const code = b.accountCode;
      const key = code.startsWith('11') ? 'Cash'
        : code.startsWith('12') ? 'Bank'
        : (code.startsWith('13') || code.startsWith('14') || code.startsWith('15') || code.startsWith('16') || code.startsWith('17') || code.startsWith('18')) ? 'Receivable'
        : 'Other';
      acc[key] = (acc[key] ?? 0) + b.balance;
      return acc;
    }, {});
  const data = Object.entries(buckets).map(([name, value]) => ({ name, value }));
  if (data.length === 0) {
    return <Empty description="No asset balances yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  const colors: Record<string, string> = {
    Cash: '#0E5C40', Bank: '#1E40AF', Receivable: '#7C3AED', Other: '#94A3B8',
  };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={88} paddingAngle={2}>
          {data.map((entry, i) => <Cell key={i} fill={colors[entry.name] ?? '#94A3B8'} />)}
        </Pie>
        <RTooltip formatter={(v: number) => money(v, currency)} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}
