import { Card, Row, Col, Tag, Empty, Alert, Table, Statistic } from 'antd';
import { ThunderboltOutlined, ArrowUpOutlined, ArrowDownOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reliabilityApi, GradeColor, GradeLabel, type MemberRank } from '../../members/reliability/reliabilityApi';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useAuth } from '../../../shared/auth/useAuth';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

/// Cross-member reliability dashboard for admins.
/// Shows grade distribution, top reliable members, and members needing attention.
/// Members not yet snapshot-ed count as Unrated; we display the gap so admins know
/// the dashboard is current vs how many members still need to be touched.
export function ReliabilityDashboard() {
  const { hasPermission } = useAuth();
  const dq = useQuery({
    queryKey: ['admin-reliability-distribution'],
    queryFn: reliabilityApi.distribution,
    enabled: hasPermission('admin.reliability'),
  });

  if (!hasPermission('admin.reliability')) {
    return <Empty description="You don't have admin.reliability permission." />;
  }
  const d = dq.data;
  const order = ['A', 'B', 'C', 'D', 'Unrated'];
  const chartData = order.map((g) => ({ grade: g, count: d?.byGrade[g] ?? 0 }));

  return (
    <div>
      <PageHeader title="Reliability dashboard"
        subtitle="Cross-member behavior overview - advisory only. Use it to spot members who may need outreach, not to penalize anyone." />

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="What this dashboard does NOT do"
        description="No member is auto-flagged, restricted, or denied any service based on these scores. Approvers and counters retain full discretion. Event participation is not yet a scoring factor (we don't track event check-ins yet)."
        style={{ marginBlockEnd: 16 }}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Total members" value={d?.totalMembers ?? 0} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Rated" value={d?.rated ?? 0}
              prefix={<ArrowUpOutlined style={{ color: '#0E5C40' }} />}
              valueStyle={{ color: '#0E5C40' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Unrated" value={d?.unrated ?? 0}
              prefix={<ArrowDownOutlined style={{ color: '#94A3B8' }} />}
              valueStyle={{ color: '#94A3B8' }} />
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
              New members or no activity yet.
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Statistic title="Top performer" value={d?.topReliable?.[0]?.totalScore ?? 0} suffix={d?.topReliable?.[0] ? '/100' : ''} />
            {d?.topReliable?.[0] && (
              <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
                {d.topReliable[0].fullName}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Grade distribution" size="small" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <XAxis dataKey="grade" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--jm-border)' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {chartData.map((row, i) => {
                const color = row.grade === 'A' ? '#0E5C40'
                  : row.grade === 'B' ? '#0B6E63'
                  : row.grade === 'C' ? '#D97706'
                  : row.grade === 'D' ? '#DC2626'
                  : '#94A3B8';
                return <Cell key={i} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Top reliable members" style={{ border: '1px solid var(--jm-border)' }}>
            {(!d || d.topReliable.length === 0) ? <Empty description="No rated members yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : <RankTable rows={d.topReliable} />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Needs attention (C / D)" style={{ border: '1px solid var(--jm-border)' }}
            extra={<Tag color="orange">Reach out, don't restrict</Tag>}>
            {(!d || d.needsAttention.length === 0)
              ? <Empty description="No members in C or D" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : <RankTable rows={d.needsAttention} />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function RankTable({ rows }: { rows: MemberRank[] }) {
  return (
    <Table<MemberRank> rowKey="memberId" size="small" pagination={false}
      dataSource={rows}
      columns={[
        {
          title: 'Member',
          dataIndex: 'fullName',
          render: (v: string, row) => (
            <Link to={`/members/${row.memberId}`}>
              <div style={{ fontWeight: 500 }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }} className="jm-tnum">ITS {row.itsNumber}</div>
            </Link>
          ),
        },
        { title: 'Grade', dataIndex: 'grade', width: 90,
          render: (g: string) => <Tag color={GradeColor[g] ?? 'default'}>{g} - {GradeLabel[g] ?? g}</Tag> },
        { title: 'Score', dataIndex: 'totalScore', width: 80, align: 'end',
          render: (v: number | null) => v !== null ? <span className="jm-tnum">{v.toFixed(0)}</span> : '-' },
      ]}
    />
  );
}
