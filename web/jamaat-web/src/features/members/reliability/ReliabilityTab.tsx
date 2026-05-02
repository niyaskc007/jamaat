import { Card, Row, Col, Tag, Empty, Alert, Button, Space, Typography, Progress, Tooltip } from 'antd';
import { ReloadOutlined, InfoCircleOutlined, ThunderboltOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { reliabilityApi, GradeColor, GradeLabel, type ReliabilityProfile } from './reliabilityApi';
import { useAuth } from '../../../shared/auth/useAuth';
import { extractProblem } from '../../../shared/api/client';

/// "Reliability Profile" tab on the member profile page.
/// Surfaces the member's grade + 4 dimension scores + recent lapses + loan-readiness.
/// Carries a prominent "Advisory only" banner so this score is never confused with a gate.
export function ReliabilityTab({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canRecompute = hasPermission('member.reliability.recompute');

  const profileQ = useQuery({
    queryKey: ['reliability', memberId],
    queryFn: () => reliabilityApi.get(memberId),
    enabled: hasPermission('member.reliability.view'),
  });

  const recomputeMut = useMutation({
    mutationFn: () => reliabilityApi.recompute(memberId),
    onSuccess: (data) => qc.setQueryData(['reliability', memberId], data),
  });

  if (!hasPermission('member.reliability.view')) {
    return <Empty description="You don't have permission to view this member's reliability profile." />;
  }
  if (profileQ.isLoading) return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  if (profileQ.isError) {
    return <Alert type="error" message="Failed to load reliability profile" description={extractProblem(profileQ.error).detail ?? ''} />;
  }
  if (!profileQ.data) return null;

  const p = profileQ.data;

  return (
    <div style={{ padding: 24 }}>
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="Advisory only"
        description="Reliability profiles are guidance for approvers and admins. They do not auto-approve or auto-deny any decision. Always review the underlying facts."
        style={{ marginBlockEnd: 20 }}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <GradeCard p={p} canRecompute={canRecompute} onRecompute={() => recomputeMut.mutate()} recomputing={recomputeMut.isPending} />
        </Col>
        <Col xs={24} md={14}>
          <LoanReadinessCard p={p} />
        </Col>
      </Row>

      <Typography.Title level={5} style={{ marginBlockStart: 24, marginBlockEnd: 12 }}>How the score breaks down</Typography.Title>
      <Row gutter={[12, 12]}>
        {p.dimensions.map((d) => (
          <Col key={d.key} xs={24} md={12}>
            <DimensionCard d={d} />
          </Col>
        ))}
      </Row>

      <Typography.Title level={5} style={{ marginBlockStart: 24, marginBlockEnd: 12 }}>
        Recent lapses {p.lapses.length === 0 && <Tag color="green">None</Tag>}
      </Typography.Title>
      {p.lapses.length === 0 ? (
        <Empty description="No lapses on record - this member has paid commitments and returnables on time." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Card size="small" styles={{ body: { padding: 0 } }}>
          {p.lapses.map((l, i) => (
            <div key={`${l.reference}-${i}`} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBlockEnd: i < p.lapses.length - 1 ? '1px solid var(--jm-border)' : 'none' }}>
              <Tag color={kindColor(l.kind)} style={{ alignSelf: 'flex-start', textTransform: 'capitalize' }}>{l.kind}</Tag>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{l.description}</div>
                <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
                  Ref <span className="jm-tnum">{l.reference}</span> Â· {dayjs(l.occurredOn).format('DD MMM YYYY')}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function GradeCard({ p, canRecompute, onRecompute, recomputing }: {
  p: ReliabilityProfile; canRecompute: boolean; onRecompute: () => void; recomputing: boolean;
}) {
  return (
    <Card style={{ border: '1px solid var(--jm-border)', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBlockEnd: 8 }}>
        Reliability profile
      </div>
      <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, fontFamily: "'Inter Tight', 'Inter', sans-serif" }}>
        <Tag color={GradeColor[p.grade] ?? 'default'} style={{ fontSize: 28, padding: '6px 18px', margin: 0, borderRadius: 12 }}>
          {p.grade}
        </Tag>
      </div>
      <div style={{ fontSize: 14, color: 'var(--jm-gray-700)', marginBlockStart: 8, fontWeight: 500 }}>
        {GradeLabel[p.grade] ?? p.grade}
      </div>
      {p.totalScore !== null && (
        <div className="jm-tnum" style={{ fontSize: 18, color: 'var(--jm-gray-600)', marginBlockStart: 4 }}>
          {p.totalScore.toFixed(1)} / 100
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
        Computed {dayjs(p.computedAtUtc).fromNow()}
      </div>
      {canRecompute && (
        <Button size="small" icon={<ReloadOutlined />} loading={recomputing} onClick={onRecompute} style={{ marginBlockStart: 12 }}>
          Recompute now
        </Button>
      )}
    </Card>
  );
}

function LoanReadinessCard({ p }: { p: ReliabilityProfile }) {
  const ready = p.loanReady;
  return (
    <Card style={{ border: '1px solid var(--jm-border)', blockSize: '100%' }}>
      <Space align="start" size={16}>
        <span style={{
          inlineSize: 48, blockSize: 48, borderRadius: 12,
          display: 'grid', placeItems: 'center', fontSize: 24,
          background: ready ? 'rgba(11,110,99,0.12)' : 'rgba(217,119,6,0.12)',
          color: ready ? 'var(--jm-primary-500)' : '#B45309',
        }}>
          {ready ? <CheckCircleOutlined /> : <WarningOutlined />}
        </span>
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            <ThunderboltOutlined /> Qarzan Hasana readiness
          </Typography.Title>
          <div style={{ marginBlockStart: 6, fontSize: 13 }}>
            {ready ? (
              <Tag color="green" style={{ fontWeight: 600 }}>Recommended</Tag>
            ) : (
              <Tag color="orange" style={{ fontWeight: 600 }}>Needs review</Tag>
            )}
            <span style={{ marginInlineStart: 8 }}>
              {ready
                ? 'No blockers detected. The approver still makes the final call.'
                : (p.loanReadyReason ?? 'Refer to the lapses below.')}
            </span>
          </div>
        </div>
      </Space>
    </Card>
  );
}

function DimensionCard({ d }: { d: ReturnType<() => ReliabilityProfile['dimensions'][number]> }) {
  if (d.excluded) {
    return (
      <Card size="small" style={{ border: '1px solid var(--jm-border)', background: 'var(--jm-surface-muted)' }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{d.name}
          <Tag style={{ marginInlineStart: 8 }}>Not applicable</Tag>
        </div>
        <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>{d.raw}</div>
      </Card>
    );
  }
  const score = d.score ?? 0;
  const color = score >= 85 ? '#0E5C40' : score >= 70 ? '#0B6E63' : score >= 55 ? '#D97706' : '#DC2626';
  return (
    <Card size="small" className="jm-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{d.name}</div>
        <Tooltip title={`${(d.weight * 100).toFixed(0)}% weight`}>
          <span className="jm-tnum" style={{ fontSize: 18, fontWeight: 700, color }}>
            {score.toFixed(0)}
          </span>
        </Tooltip>
      </div>
      <Progress percent={score} showInfo={false} strokeColor={color} size="small" style={{ marginBlock: 4 }} />
      <div style={{ fontSize: 12, color: 'var(--jm-gray-600)' }}>{d.raw}</div>
      {d.tip && (
        <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 6, fontStyle: 'italic' }}>
          Tip: {d.tip}
        </div>
      )}
    </Card>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case 'commitment': return 'blue';
    case 'loan': return 'volcano';
    case 'returnable': return 'gold';
    default: return 'default';
  }
}
