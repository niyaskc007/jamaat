import { useState } from 'react';
import { Tabs, Table, Tag, Button, Space, Drawer, Typography, Input, Modal, App as AntdApp, Popconfirm, Descriptions, Alert } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { memberApplicationsApi, type MemberApplication } from '../portal/registerApi';
import { extractProblem } from '../../shared/api/client';

const STATUS_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending',  color: 'gold' },
  2: { label: 'Approved', color: 'green' },
  3: { label: 'Rejected', color: 'red' },
};

/// Admin moderation queue for member self-registration applications. Mirrors the
/// existing change-requests page structure (tabbed by status, list with preview drawer
/// and inline actions). Approving an application provisions the login + member record
/// via the existing IMemberLoginProvisioningService - identical flow to the bulk
/// allow-login button on the Users page, so the welcome-email behaviour is consistent.
export function ApplicationsPage() {
  const [status, setStatus] = useState<number>(1);
  return (
    <div>
      <PageHeader
        title="Member applications"
        subtitle="Self-registration submissions awaiting committee review. Approving creates a login and emails the applicant a temporary password."
      />
      <Tabs
        activeKey={String(status)}
        onChange={(k) => setStatus(Number(k))}
        items={[
          { key: '1', label: <span>Pending <PendingBadge /></span>, children: <ApplicationsList status={1} /> },
          { key: '2', label: 'Approved', children: <ApplicationsList status={2} /> },
          { key: '3', label: 'Rejected', children: <ApplicationsList status={3} /> },
        ]}
      />
    </div>
  );
}

function PendingBadge() {
  const q = useQuery({
    queryKey: ['member-applications-pending-count'],
    queryFn: () => memberApplicationsApi.pendingCount(),
    refetchInterval: 30_000,
  });
  if (!q.data) return null;
  return <Tag color="gold" style={{ marginInlineStart: 8 }}>{q.data}</Tag>;
}

function ApplicationsList({ status }: { status: number }) {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [previewing, setPreviewing] = useState<MemberApplication | null>(null);

  const listQ = useQuery({
    queryKey: ['member-applications', status, page, search],
    queryFn: () => memberApplicationsApi.list({ status, page, pageSize: 25, search: search || undefined }),
    placeholderData: (prev) => prev,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => memberApplicationsApi.approve(id),
    onSuccess: (_data, _id) => {
      message.success('Application approved. Welcome email queued.');
      void qc.invalidateQueries({ queryKey: ['member-applications'] });
      void qc.invalidateQueries({ queryKey: ['member-applications-pending-count'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Approve failed.'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => memberApplicationsApi.reject(id, note),
    onSuccess: () => {
      message.success('Application rejected.');
      void qc.invalidateQueries({ queryKey: ['member-applications'] });
      void qc.invalidateQueries({ queryKey: ['member-applications-pending-count'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Reject failed.'),
  });

  const askReject = (row: MemberApplication) => {
    let note = '';
    Modal.confirm({
      title: 'Reject application',
      content: (
        <div>
          <Typography.Paragraph>
            Reject application from <b>{row.fullName}</b> (ITS {row.itsNumber}). The applicant
            will not be notified automatically; share the reason via email or phone.
          </Typography.Paragraph>
          <Input.TextArea
            rows={3}
            placeholder="Reason (required) — visible to admins reviewing the audit trail."
            onChange={(e) => { note = e.target.value; }}
          />
        </div>
      ),
      okText: 'Reject',
      okType: 'danger',
      onOk: () => {
        if (!note.trim()) {
          message.error('A reason is required.');
          return Promise.reject();
        }
        rejectMut.mutate({ id: row.id, note: note.trim() });
        return Promise.resolve();
      },
    });
  };

  return (
    <div>
      <Space style={{ marginBlockEnd: 12 }}>
        <Input.Search
          placeholder="Search by name, ITS, or email"
          allowClear
          onSearch={(v) => { setPage(1); setSearch(v); }}
          style={{ inlineSize: 320 }}
        />
      </Space>
      <Table<MemberApplication>
        loading={listQ.isLoading}
        dataSource={listQ.data?.items ?? []}
        rowKey="id"
        size="middle"
        pagination={{
          current: page, pageSize: 25, total: listQ.data?.total ?? 0,
          showSizeChanger: false, onChange: (p) => setPage(p),
        }}
        columns={[
          { title: 'Submitted', dataIndex: 'createdAtUtc', width: 160,
            render: (v: string) => new Date(v).toLocaleString() },
          { title: 'Name', dataIndex: 'fullName' },
          { title: 'ITS', dataIndex: 'itsNumber', width: 120,
            render: (v: string) => <span className="jm-tnum">{v}</span> },
          { title: 'Contact', key: 'contact', render: (_, r) => (
            <Space direction="vertical" size={0}>
              {r.email && <span style={{ fontSize: 12 }}>{r.email}</span>}
              {r.phoneE164 && <span style={{ fontSize: 12 }} className="jm-tnum">{r.phoneE164}</span>}
            </Space>
          ) },
          { title: 'Status', dataIndex: 'status', width: 120,
            render: (s: number) => <Tag color={STATUS_LABEL[s]?.color ?? 'default'}>{STATUS_LABEL[s]?.label ?? s}</Tag> },
          {
            title: 'Actions', key: 'actions', width: 280, align: 'end',
            render: (_, row) => (
              <Space size="small">
                <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewing(row)}>View</Button>
                {row.status === 1 && (
                  <>
                    <Popconfirm
                      title="Approve this application?"
                      description="A member login will be provisioned and the applicant emailed a temporary password."
                      okText="Approve"
                      onConfirm={() => approveMut.mutate(row.id)}
                    >
                      <Button size="small" type="primary" icon={<CheckOutlined />} loading={approveMut.isPending}>
                        Approve
                      </Button>
                    </Popconfirm>
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => askReject(row)}>
                      Reject
                    </Button>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />

      {previewing && (
        <Drawer
          open
          title={previewing.fullName}
          onClose={() => setPreviewing(null)}
          width={520}
        >
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ITS"><span className="jm-tnum">{previewing.itsNumber}</span></Descriptions.Item>
            <Descriptions.Item label="Email">{previewing.email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{previewing.phoneE164 ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Submitted">{new Date(previewing.createdAtUtc).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="IP">{previewing.ipAddress ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_LABEL[previewing.status]?.color}>{STATUS_LABEL[previewing.status]?.label}</Tag>
            </Descriptions.Item>
            {previewing.notes && (
              <Descriptions.Item label="Applicant note">{previewing.notes}</Descriptions.Item>
            )}
            {previewing.reviewerNote && (
              <Descriptions.Item label="Reviewer note">{previewing.reviewerNote}</Descriptions.Item>
            )}
            {previewing.reviewedAtUtc && (
              <Descriptions.Item label="Reviewed at">{new Date(previewing.reviewedAtUtc).toLocaleString()}</Descriptions.Item>
            )}
            {previewing.reviewedByUserName && (
              <Descriptions.Item label="Reviewed by">{previewing.reviewedByUserName}</Descriptions.Item>
            )}
            {previewing.linkedMemberId && (
              <Descriptions.Item label="Linked member">{previewing.linkedMemberId}</Descriptions.Item>
            )}
          </Descriptions>
          {previewing.status === 1 && (
            <Alert
              type="info" showIcon style={{ marginBlockStart: 16 }}
              message="Approval flow"
              description="Approving creates an ApplicationUser linked to a Member record (creating a new Member if the ITS is unknown), sends a welcome email with a temporary password, and leaves IsLoginAllowed=false until you flip it on from the Users page."
            />
          )}
        </Drawer>
      )}
    </div>
  );
}
