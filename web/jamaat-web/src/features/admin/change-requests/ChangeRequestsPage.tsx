import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Tabs, Modal, Input, App as AntdApp, Empty, Drawer, Descriptions, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, EyeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { UserHoverCard } from '../../../shared/ui/UserHoverCard';
import { useAuth } from '../../../shared/auth/useAuth';
import { extractProblem } from '../../../shared/api/client';
import {
  memberChangeRequestApi, type MemberChangeRequest, MemberChangeRequestStatusLabel,
  MemberChangeRequestStatusColor,
} from '../../members/profile/memberProfileApi';

/// Verification queue for member profile edits. Members with member.self.update submit
/// changes here; admins / data-validators with member.changes.approve review and apply
/// or reject. One row per request (section-level granularity); the diff is shown as a
/// side-by-side card with the proposed payload pretty-printed.
export function ChangeRequestsPage() {
  const { hasPermission } = useAuth();
  const canApprove = hasPermission('member.changes.approve');
  if (!canApprove) {
    return (
      <Empty description="You don't have member.changes.approve permission. Ask an admin to grant it." />
    );
  }
  return (
    <div>
      <PageHeader title="Member change requests"
        subtitle="Edits submitted by members or data editors awaiting verification. Approve to apply; reject with a note." />
      <Card style={{ border: '1px solid var(--jm-border)' }}>
        <Tabs defaultActiveKey="pending"
          items={[
            { key: 'pending', label: 'Pending', children: <RequestList status={1} /> },
            { key: 'approved', label: 'Approved', children: <RequestList status={2} /> },
            { key: 'rejected', label: 'Rejected', children: <RequestList status={3} /> },
          ]}
        />
      </Card>
    </div>
  );
}

function RequestList({ status }: { status: 1 | 2 | 3 }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [page, setPage] = useState(1);
  const [previewing, setPreviewing] = useState<MemberChangeRequest | null>(null);
  const q = useQuery({
    queryKey: ['member-change-requests', status, page],
    queryFn: () => memberChangeRequestApi.list({ status, page, pageSize: 25 }),
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => memberChangeRequestApi.approve(id),
    onSuccess: () => { message.success('Approved + applied.'); void qc.invalidateQueries({ queryKey: ['member-change-requests'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const rejectMut = useMutation({
    mutationFn: (args: { id: string; note: string }) => memberChangeRequestApi.reject(args.id, args.note),
    onSuccess: () => { message.success('Rejected.'); void qc.invalidateQueries({ queryKey: ['member-change-requests'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const promptReject = (id: string) => {
    let note = '';
    modal.confirm({
      title: 'Reject change request',
      content: (
        <div style={{ marginBlockStart: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--jm-gray-600)', marginBlockEnd: 6 }}>Please provide a reason - this is shown to the requester.</div>
          <Input.TextArea rows={3} onChange={(e) => { note = e.target.value; }} autoFocus />
        </div>
      ),
      okText: 'Reject',
      okButtonProps: { danger: true },
      onOk: () => {
        if (!note.trim()) throw new Error('Reason required');
        return rejectMut.mutateAsync({ id, note });
      },
    });
  };

  return (
    <>
      <Table<MemberChangeRequest>
        rowKey="id" size="middle" loading={q.isLoading}
        dataSource={q.data?.items ?? []}
        pagination={{ current: page, pageSize: 25, total: q.data?.total ?? 0, onChange: setPage }}
        locale={{ emptyText: <Empty description={`No ${MemberChangeRequestStatusLabel[status].toLowerCase()} requests`} /> }}
        columns={[
          { title: 'Member', dataIndex: 'memberName',
            render: (v: string, row) => <Link to={`/members/${row.memberId}`}>{v || '-'}</Link> },
          { title: 'Section', dataIndex: 'section', width: 140,
            render: (v: string) => <Tag color="blue">{v}</Tag> },
          { title: 'Requested by', dataIndex: 'requestedByUserName', width: 180,
            render: (v: string, row) => <UserHoverCard userId={row.requestedByUserId ?? null} fallback={v} /> },
          { title: 'When', dataIndex: 'requestedAtUtc', width: 180,
            render: (v: string) => dayjs(v).format('DD MMM YYYY HH:mm') },
          { title: 'Status', dataIndex: 'status', width: 110,
            render: (v: number) => <Tag color={MemberChangeRequestStatusColor[v] ?? 'default'}>{MemberChangeRequestStatusLabel[v] ?? '?'}</Tag> },
          { title: '', width: 220, align: 'end',
            render: (_: unknown, row) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewing(row)}>View</Button>
                {row.status === 1 && (
                  <>
                    <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={approveMut.isPending}
                      onClick={() => approveMut.mutate(row.id)}>Approve</Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />}
                      onClick={() => promptReject(row.id)}>Reject</Button>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />
      {previewing && <PreviewDrawer request={previewing} onClose={() => setPreviewing(null)} />}
    </>
  );
}

function PreviewDrawer({ request, onClose }: { request: MemberChangeRequest; onClose: () => void }) {
  let pretty = request.payloadJson;
  try { pretty = JSON.stringify(JSON.parse(request.payloadJson), null, 2); } catch { /* keep as-is */ }
  return (
    <Drawer open onClose={onClose} title="Change request" width={640}>
      <Descriptions size="small" column={1} bordered style={{ marginBlockEnd: 16 }}
        items={[
          { key: 'm', label: 'Member', children: <Link to={`/members/${request.memberId}`}>{request.memberName}</Link> },
          { key: 's', label: 'Section', children: <Tag color="blue">{request.section}</Tag> },
          { key: 'st', label: 'Status', children: <Tag color={MemberChangeRequestStatusColor[request.status]}>{MemberChangeRequestStatusLabel[request.status]}</Tag> },
          { key: 'req', label: 'Requested by', children: (
            <span>
              <UserHoverCard userId={request.requestedByUserId ?? null} fallback={request.requestedByUserName} />
              {' on '}{dayjs(request.requestedAtUtc).format('DD MMM YYYY HH:mm')}
            </span>
          ) },
          ...(request.reviewedByUserName ? [{ key: 'rv', label: 'Reviewed by', children: (
            <span>
              <UserHoverCard userId={request.reviewedByUserId ?? null} fallback={request.reviewedByUserName} />
              {' on '}{dayjs(request.reviewedAtUtc).format('DD MMM YYYY HH:mm')}
            </span>
          ) }] : []),
          ...(request.reviewerNote ? [{ key: 'note', label: 'Reviewer note', children: <span style={{ whiteSpace: 'pre-wrap' }}>{request.reviewerNote}</span> }] : []),
        ]}
      />
      <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 6 }}>
        Proposed changes (full payload)
      </div>
      <Alert type="info" showIcon style={{ marginBlockEnd: 8 }}
        message="Section-level submission"
        description="The whole tab's DTO is captured. On approval the matching UpdateXxx service applies it; current and proposed live next to each other on the member profile page after approval." />
      <pre style={{ background: 'var(--jm-surface-muted)', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', maxBlockSize: 480 }}>
        {pretty}
      </pre>
    </Drawer>
  );
}
