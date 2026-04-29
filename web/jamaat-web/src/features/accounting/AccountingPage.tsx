import { Card, Row, Col, Statistic, Tag, Empty } from 'antd';
import {
  BookOutlined, BarChartOutlined, CalendarOutlined,
  ArrowUpOutlined, ArrowDownOutlined, BankOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAuth } from '../../shared/auth/useAuth';
import { ledgerApi, periodsApi } from '../ledger/ledgerApi';
import { money } from '../../shared/format/format';
import { useBaseCurrency } from '../../shared/hooks/useBaseCurrency';

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
          {/* Top-line KPIs - the numbers a treasurer wants in their face the moment they land */}
          <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
            <Col xs={12} md={6}>
              <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
                <Statistic title="Assets" value={totalAssets} precision={2}
                  prefix={<ArrowUpOutlined style={{ color: '#0E5C40' }} />}
                  formatter={(v) => money(Number(v), baseCurrency)} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
                <Statistic title="Liabilities" value={totalLiabilities} precision={2}
                  prefix={<ArrowDownOutlined style={{ color: '#B45309' }} />}
                  formatter={(v) => money(Number(v), baseCurrency)} />
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
                  Includes returnable contributions still owed back.
                </div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
                <Statistic title="Income (lifetime)" value={totalIncome} precision={2}
                  formatter={(v) => money(Number(v), baseCurrency)} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
                <Statistic title="Net (income - expenses)" value={net} precision={2}
                  valueStyle={{ color: net >= 0 ? '#0E5C40' : '#DC2626' }}
                  formatter={(v) => money(Number(v), baseCurrency)} />
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
                  Expenses to date: {money(totalExpenses, baseCurrency)}
                </div>
              </Card>
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
                      {openPeriod.startDate} -> {openPeriod.endDate}
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
