import { Card, Tag, Empty, Alert, Tooltip, Progress, Statistic, Row, Col } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined, WarningOutlined, BankOutlined, GiftOutlined, HistoryOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { qarzanHasanaApi, type LoanDecisionSupport as DS, type GuarantorTrackRecord } from './qarzanHasanaApi';
import { GradeColor, GradeLabel } from '../members/reliability/reliabilityApi';
import { money } from '../../shared/format/format';

/// Decision-support panel rendered on the QH loan detail page for approvers.
/// One round-trip backs the whole panel so it doesn't slow the page.
/// Includes a clear "advisory only" disclaimer; nothing here auto-approves anything.
export function LoanDecisionSupport({ loanId }: { loanId: string }) {
  const dsQ = useQuery({
    queryKey: ['qh', 'decision-support', loanId],
    queryFn: () => qarzanHasanaApi.decisionSupport(loanId),
  });

  if (dsQ.isLoading) return <Card size="small" style={{ border: '1px dashed var(--jm-border)' }} loading />;
  if (dsQ.isError || !dsQ.data) return <Empty description="Decision-support data not available" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const d = dsQ.data;
  return (
    <div className="jm-stack" style={{ gap: 12 }}>
      <Alert
        type="info"
        showIcon
        message="Decision support - advisory only"
        description="The numbers below are pulled live from the borrower's history. They help you decide; they do not auto-approve or auto-deny."
      />

      <ReliabilityCard r={d.reliability} />
      <FundPositionCard f={d.fundPosition} />
      <GuarantorTrackRecordsCard guarantors={d.guarantors ?? []} />
      <CommitmentsCard c={d.commitments} currency={d.fundPosition.currency} />
      <DonationsCard donations={d.donations} currency={d.fundPosition.currency} />
      <PastLoansCard p={d.pastLoans} currency={d.fundPosition.currency} />
    </div>
  );
}

function GuarantorTrackRecordsCard({ guarantors }: { guarantors: GuarantorTrackRecord[] }) {
  if (guarantors.length === 0) return null;
  return (
    <Card size="small" title={<span><SafetyCertificateOutlined /> Guarantor track records</span>}
      extra={<span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Per kafil</span>}
      style={{ border: '1px solid var(--jm-border)' }}>
      {guarantors.map((g, idx) => (
        <div key={g.memberId} style={{
          paddingBlock: 10,
          borderBlockEnd: idx < guarantors.length - 1 ? '1px solid var(--jm-border)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBlockEnd: 6 }}>
            <Link to={`/members/${g.memberId}`} style={{ fontWeight: 600, fontSize: 13 }}>{g.fullName}</Link>
            <span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }} className="jm-tnum">ITS {g.itsNumber}</span>
            <Tag color={GradeColor[g.grade] ?? 'default'} style={{ marginInlineStart: 'auto', fontWeight: 600 }}>
              {g.grade} - {GradeLabel[g.grade] ?? g.grade}
            </Tag>
          </div>
          <Row gutter={[8, 4]} style={{ fontSize: 12 }}>
            <Col xs={8}>
              <div style={{ color: 'var(--jm-gray-500)' }}>Active guarantees</div>
              <div className="jm-tnum" style={{ fontWeight: 600 }}>{g.activeGuaranteesCount}</div>
            </Col>
            <Col xs={8}>
              <div style={{ color: 'var(--jm-gray-500)' }}>Past loans (own)</div>
              <div className="jm-tnum" style={{ fontWeight: 600 }}>{g.pastLoansCount}</div>
            </Col>
            <Col xs={8}>
              <div style={{ color: 'var(--jm-gray-500)' }}>Defaulted (own)</div>
              <div className="jm-tnum" style={{ fontWeight: 600, color: g.defaultedCount > 0 ? '#DC2626' : 'inherit' }}>
                {g.defaultedCount}
              </div>
            </Col>
          </Row>
          <div style={{ marginBlockStart: 6 }}>
            {g.currentlyEligible
              ? <Tag color="green"><CheckCircleOutlined /> Currently eligible</Tag>
              : <Tag color="red" icon={<WarningOutlined />}>{g.ineligibilityReason ?? 'Not eligible'}</Tag>}
          </div>
        </div>
      ))}
    </Card>
  );
}

function ReliabilityCard({ r }: { r: DS['reliability'] }) {
  return (
    <Card size="small" title={<span><ThunderboltOutlined /> Reliability</span>}
      extra={<Tag color={GradeColor[r.grade] ?? 'default'} style={{ fontWeight: 600 }}>{r.grade} - {GradeLabel[r.grade] ?? r.grade}</Tag>}
      style={{ border: '1px solid var(--jm-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBlockEnd: 12 }}>
        <span style={{
          inlineSize: 40, blockSize: 40, borderRadius: 10,
          display: 'grid', placeItems: 'center', fontSize: 20,
          background: r.loanReady ? 'rgba(11,110,99,0.12)' : 'rgba(217,119,6,0.12)',
          color: r.loanReady ? 'var(--jm-primary-500)' : '#B45309',
        }}>{r.loanReady ? <CheckCircleOutlined /> : <WarningOutlined />}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {r.loanReady ? 'Recommended for disbursal' : 'Approver should review carefully'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-600)' }}>
            {r.loanReady ? 'No automatic blockers.' : (r.loanReadyReason ?? 'See factors below.')}
          </div>
        </div>
        {r.totalScore !== null && (
          <div style={{ marginInlineStart: 'auto' }} className="jm-tnum">
            <span style={{ fontSize: 22, fontWeight: 700 }}>{r.totalScore.toFixed(0)}</span>
            <span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>/100</span>
          </div>
        )}
      </div>
      {r.factors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {r.factors.map((f) => (
            <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--jm-gray-700)' }}>
              <span>{f.name}</span>
              <Tooltip title={f.raw}>
                {f.excluded ? <Tag>n/a</Tag>
                  : f.score !== null ? <span className="jm-tnum">{f.score.toFixed(0)}</span>
                  : <Tag>?</Tag>}
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FundPositionCard({ f }: { f: DS['fundPosition'] }) {
  const tight = f.percentRemainingAfter < 10;
  return (
    <Card size="small" title={<span><BankOutlined /> Fund position</span>}
      style={{ border: '1px solid var(--jm-border)' }}>
      <Row gutter={[12, 12]}>
        <Col xs={12}>
          <Statistic title="Current QH pool" value={f.currentNetBalance} precision={2}
            formatter={(v) => money(Number(v), f.currency)} valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col xs={12}>
          <Statistic title="This loan needs" value={f.requestedAmount} precision={2}
            formatter={(v) => money(Number(v), f.currency)} valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col xs={24}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 4 }}>
            After disbursement
          </div>
          <div className="jm-tnum" style={{ fontSize: 18, fontWeight: 700, color: tight ? '#DC2626' : 'var(--jm-gray-800)' }}>
            {money(f.projectedAfterDisbursement, f.currency)}
            <Tag style={{ marginInlineStart: 8, fontSize: 11 }} color={tight ? 'red' : 'green'}>
              {f.percentRemainingAfter.toFixed(1)}% of pool remains
            </Tag>
          </div>
          <Progress
            percent={Math.max(0, Math.min(100, f.percentRemainingAfter))}
            showInfo={false}
            strokeColor={tight ? '#DC2626' : '#0E5C40'}
            size="small" style={{ marginBlockStart: 6 }}
          />
          {tight && (
            <div style={{ fontSize: 12, color: '#B91C1C', marginBlockStart: 6 }}>
              Less than 10% would remain in the pool. Consider phasing or deferring.
            </div>
          )}
        </Col>
      </Row>
    </Card>
  );
}

function CommitmentsCard({ c, currency }: { c: DS['commitments']; currency: string }) {
  if (c.activeCount === 0) {
    return (
      <Card size="small" title={<span><GiftOutlined /> Active commitments</span>} style={{ border: '1px solid var(--jm-border)' }}>
        <Empty description="No active commitments" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }
  return (
    <Card size="small" title={<span><GiftOutlined /> Active commitments</span>}
      extra={<span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{c.activeCount} active</span>}
      style={{ border: '1px solid var(--jm-border)' }}>
      <Row gutter={[8, 8]} style={{ marginBlockEnd: 10 }}>
        <Col xs={8}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Committed</div>
          <div className="jm-tnum" style={{ fontWeight: 600, fontSize: 13 }}>{money(c.totalAmount, currency)}</div>
        </Col>
        <Col xs={8}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Paid</div>
          <div className="jm-tnum" style={{ fontWeight: 600, fontSize: 13, color: '#0E5C40' }}>{money(c.paidAmount, currency)}</div>
        </Col>
        <Col xs={8}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Outstanding</div>
          <div className="jm-tnum" style={{ fontWeight: 600, fontSize: 13, color: c.outstandingAmount > 0 ? '#B45309' : 'inherit' }}>
            {money(c.outstandingAmount, currency)}
          </div>
        </Col>
      </Row>
      {c.top.map((line) => (
        <div key={line.code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingBlock: 4, borderBlockStart: '1px solid var(--jm-border)' }}>
          <span><span className="jm-tnum" style={{ color: 'var(--jm-gray-500)' }}>{line.code}</span> {line.fundName}</span>
          <span className="jm-tnum">{money(line.outstandingAmount, currency)} owed</span>
        </div>
      ))}
    </Card>
  );
}

function DonationsCard({ donations, currency }: { donations: DS['donations']; currency: string }) {
  return (
    <Card size="small" title={<span><HistoryOutlined /> Donation history (last {donations.months} months)</span>}
      extra={<span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{donations.receiptCount} receipts</span>}
      style={{ border: '1px solid var(--jm-border)' }}>
      <div style={{ marginBlockEnd: 10 }}>
        <span className="jm-tnum" style={{ fontSize: 18, fontWeight: 700 }}>{money(donations.totalAmount, currency)}</span>
        <span style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginInlineStart: 6 }}>contributed in window</span>
      </div>
      {donations.byFund.length === 0 ? (
        <Empty description="No donations in window" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        donations.byFund.map((f, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingBlock: 4, borderBlockStart: i > 0 ? '1px solid var(--jm-border)' : 'none' }}>
            <span>{f.fundName}</span>
            <span className="jm-tnum">{money(f.amount, currency)} <span style={{ color: 'var(--jm-gray-500)', marginInlineStart: 4 }}>({f.receiptCount})</span></span>
          </div>
        ))
      )}
    </Card>
  );
}

function PastLoansCard({ p, currency }: { p: DS['pastLoans']; currency: string }) {
  if (p.loanCount === 0) {
    return (
      <Card size="small" title={<span><HistoryOutlined /> Past loans</span>} style={{ border: '1px solid var(--jm-border)' }}>
        <div style={{ fontSize: 13, color: 'var(--jm-gray-600)' }}>This is the borrower's first Qarzan Hasana loan.</div>
      </Card>
    );
  }
  return (
    <Card size="small" title={<span><HistoryOutlined /> Past loans</span>}
      extra={<span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{p.loanCount} on record</span>}
      style={{ border: '1px solid var(--jm-border)' }}>
      <Row gutter={[8, 8]}>
        <Col xs={8}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Completed</div>
          <div className="jm-tnum" style={{ fontWeight: 600, color: '#0E5C40' }}>{p.completedCount}</div>
        </Col>
        <Col xs={8}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Defaulted</div>
          <div className="jm-tnum" style={{ fontWeight: 600, color: p.defaultedCount > 0 ? '#DC2626' : 'inherit' }}>{p.defaultedCount}</div>
        </Col>
        <Col xs={8}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>On-time rate</div>
          <div className="jm-tnum" style={{ fontWeight: 600 }}>{p.onTimeRepaymentPercent.toFixed(0)}%</div>
        </Col>
        <Col xs={12}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Total disbursed</div>
          <div className="jm-tnum">{money(p.totalDisbursed, currency)}</div>
        </Col>
        <Col xs={12}>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Total repaid</div>
          <div className="jm-tnum">{money(p.totalRepaid, currency)}</div>
        </Col>
      </Row>
    </Card>
  );
}
