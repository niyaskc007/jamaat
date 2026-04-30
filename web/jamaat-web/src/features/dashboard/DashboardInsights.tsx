import { Card, Row, Col, Empty, Tag, List } from 'antd';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../ledger/ledgerApi';
import { money } from '../../shared/format/format';
import { useBaseCurrency } from '../../shared/hooks/useBaseCurrency';

/// BI panel that drops into the dashboard. One backend call (insights) returns:
///   - 30-day collection trend (line + area)
///   - 4 pending-obligations tiles (outstanding loans / returnable / pending commitments / overdue returns)
///   - cheque-pipeline status distribution (horizontal bar)
/// Plus reuses the existing fund-slice query for a today/MTD donut.
export function DashboardInsights() {
  const baseCurrency = useBaseCurrency();
  const navigate = useNavigate();
  const insightsQ = useQuery({ queryKey: ['dashboard', 'insights'], queryFn: dashboardApi.insights, refetchInterval: 60_000 });
  // Last-30-days fund slice for the donut. Separate query so it can refresh independently
  // and the existing today-only fund slice on the rest of the page keeps working.
  const sliceFrom = dayjs().subtract(29, 'day').format('YYYY-MM-DD');
  const sliceTo = dayjs().format('YYYY-MM-DD');
  const sliceQ = useQuery({
    queryKey: ['dashboard', 'fund-slice-30d', sliceFrom, sliceTo],
    queryFn: () => dashboardApi.fundSlice(sliceFrom, sliceTo),
    refetchInterval: 60_000,
  });
  const topQ = useQuery({
    queryKey: ['dashboard', 'top-contributors', 30],
    queryFn: () => dashboardApi.topContributors(30, 5),
    refetchInterval: 5 * 60_000,
  });
  const outflowQ = useQuery({
    queryKey: ['dashboard', 'outflow-by-cat', 30],
    queryFn: () => dashboardApi.outflowByCategory(30, 5),
    refetchInterval: 5 * 60_000,
  });
  const upcomingQ = useQuery({
    queryKey: ['dashboard', 'upcoming-cheques', 30],
    queryFn: () => dashboardApi.upcomingCheques(30),
    refetchInterval: 60_000,
  });

  const insights = insightsQ.data;
  const trend = (insights?.collectionTrend ?? []).map((p) => ({
    ...p, label: dayjs(p.date).format('DD MMM'),
  }));
  const slice = (sliceQ.data ?? []).slice(0, 8); // top 8 funds, rest collapse into Other below if needed
  const trendTotal = trend.reduce((s, p) => s + p.amount, 0);
  const trendAvg = trend.length > 0 ? trendTotal / trend.length : 0;

  // Status palette - same colours as the cheque-status tags in the PDC workbench, kept here
  // by-index because recharts doesn't accept dynamic per-bar fills as cleanly as a function would.
  const PIPELINE_COLOR: Record<number, string> = {
    1: '#D97706', 2: '#1E40AF', 3: '#0E5C40', 4: '#DC2626', 5: '#94A3B8',
  };
  const FUND_COLORS = ['#0B6E63', '#1E40AF', '#7C3AED', '#D97706', '#0E7490', '#DC2626', '#0E5C40', '#9333EA'];

  return (
    <div className="jm-stack" style={{ gap: 16 }}>
      {/* Pending obligations strip - 4 KPI tiles. Each clicks through to the relevant report. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card hoverable size="small" style={{ border: '1px solid var(--jm-border)' }}
            onClick={() => navigate('/reports/outstanding-loans')}>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6 }}>QH loans outstanding</div>
            <div className="jm-tnum" style={{ fontSize: 22, fontWeight: 700 }}>
              {insights ? money(insights.outstandingLoanBalance, insights.currency) : '-'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>Asset on the books</div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card hoverable size="small" style={{ border: '1px solid var(--jm-border)' }}
            onClick={() => navigate('/reports/returnable')}>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6 }}>Returnable owed</div>
            <div className="jm-tnum" style={{ fontSize: 22, fontWeight: 700, color: '#92400E' }}>
              {insights ? money(insights.outstandingReturnableBalance, insights.currency) : '-'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              {insights ? <>Liability {insights.overdueReturnsCount > 0 ? <Tag color="red" style={{ marginInlineStart: 6, fontSize: 10 }}>{insights.overdueReturnsCount} overdue</Tag> : null}</> : ' '}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card hoverable size="small" style={{ border: '1px solid var(--jm-border)' }}
            onClick={() => navigate('/reports/pending-commitments')}>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6 }}>Pending commitments</div>
            <div className="jm-tnum" style={{ fontSize: 22, fontWeight: 700 }}>
              {insights ? money(insights.pendingCommitmentBalance, insights.currency) : '-'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>Yet to be collected</div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card hoverable size="small" style={{ border: '1px solid var(--jm-border)' }}
            onClick={() => navigate('/cheques')}>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6 }}>Cheques in pipeline</div>
            <div className="jm-tnum" style={{ fontSize: 22, fontWeight: 700 }}>
              {insights
                ? insights.chequePipeline.filter((p) => p.status === 1 || p.status === 2).reduce((s, p) => s + p.count, 0)
                : '-'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>Pledged + Deposited</div>
          </Card>
        </Col>
      </Row>

      {/* Collection trend (last 30 days) - the single most useful chart for spotting */}
      {/* spikes / drops in incoming money. Area + line so the daily shape stands out. */}
      <Card size="small" title="Collections - last 30 days" style={{ border: '1px solid var(--jm-border)' }}
        extra={<span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>Daily avg <span className="jm-tnum">{money(trendAvg, insights?.currency ?? baseCurrency)}</span> · Total <span className="jm-tnum">{money(trendTotal, insights?.currency ?? baseCurrency)}</span></span>}>
        {trend.length === 0 ? <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0B6E63" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0B6E63" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip
                formatter={(v: number) => money(v, insights?.currency ?? baseCurrency)}
                labelFormatter={(l, p) => p[0]?.payload?.date ? dayjs(p[0].payload.date).format('DD MMM YYYY') : l}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
              <Area type="monotone" dataKey="amount" stroke="none" fill="url(#trendFill)" />
              <Line type="monotone" dataKey="amount" stroke="#0B6E63" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Row gutter={[12, 12]}>
        {/* Fund share (last 30 days) - donut showing where the money came from. */}
        <Col xs={24} md={12}>
          <Card size="small" title="Fund share - last 30 days" style={{ border: '1px solid var(--jm-border)' }}>
            {slice.length === 0 ? <Empty description="No fund-attributed receipts in the window" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={slice} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {slice.map((_, i) => <Cell key={i} fill={FUND_COLORS[i % FUND_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v, insights?.currency ?? baseCurrency)} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        {/* Cheque pipeline - count of cheques in each lifecycle bucket. Helps the cashier */}
        {/* see "60 cheques sitting in Pledged" at a glance. */}
        <Col xs={24} md={12}>
          <Card size="small" title="Cheque pipeline" style={{ border: '1px solid var(--jm-border)' }}
            extra={<a onClick={() => navigate('/cheques')} style={{ fontSize: 12 }}>Open workbench</a>}>
            {(insights?.chequePipeline.length ?? 0) === 0 ? <Empty description="No post-dated cheques on file" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={insights?.chequePipeline ?? []} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="statusLabel" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip
                    formatter={(v: number, _name, p) => [v + ' cheques', p.payload?.statusLabel]}
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {(insights?.chequePipeline ?? []).map((p, i) => <Cell key={i} fill={PIPELINE_COLOR[p.status] ?? '#94A3B8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Phase 7 additions: top contributors / voucher outflow / upcoming cheques.
          These are read-mostly summaries the dashboard previously didn't surface; each
          tile clicks through to the appropriate page so the cashier / accountant can drill in. */}
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <Card size="small" title="Top contributors (30d)" style={{ border: '1px solid var(--jm-border)' }}>
            {(topQ.data?.length ?? 0) === 0 ? <Empty description="No contributors in window" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <List size="small" dataSource={topQ.data ?? []}
                renderItem={(c, i) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <List.Item.Meta
                      avatar={<span style={{ inlineSize: 24, blockSize: 24, borderRadius: 6, background: 'var(--jm-surface-muted)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>{i + 1}</span>}
                      title={<Link to={`/members/${c.memberId}`} style={{ fontSize: 13 }}>{c.fullName}</Link>}
                      description={<span className="jm-tnum" style={{ fontSize: 11 }}>ITS {c.itsNumber} · {c.receiptCount} receipts</span>}
                    />
                    <span className="jm-tnum" style={{ fontWeight: 600, fontSize: 13 }}>{money(c.amount, c.currency)}</span>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card size="small" title="Voucher outflow (30d)" style={{ border: '1px solid var(--jm-border)' }}>
            {(outflowQ.data?.length ?? 0) === 0 ? <Empty description="No vouchers in window" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={outflowQ.data ?? []} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E5E9EF" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    formatter={(v: number) => money(v, outflowQ.data?.[0]?.currency ?? baseCurrency)}
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
                  <Bar dataKey="amount" fill="#D97706" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card size="small" title="Cheques due in next 30 days" style={{ border: '1px solid var(--jm-border)' }}
            extra={<Link to="/cheques" style={{ fontSize: 12 }}>Workbench</Link>}>
            {(upcomingQ.data?.length ?? 0) === 0 ? <Empty description="No cheques in window" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <List size="small" dataSource={(upcomingQ.data ?? []).slice(0, 8)}
                renderItem={(c) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <div style={{ flex: 1, minInlineSize: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span className="jm-tnum">{dayjs(c.chequeDate).format('DD MMM')}</span>
                        <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(c.amount, c.currency)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.memberName} · #{c.chequeNumber}
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
