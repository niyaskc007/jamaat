import { useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Select, Modal, Input, App as AntdApp, Tooltip,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  CheckOutlined, CloseOutlined, ReloadOutlined, FileTextOutlined,
  WarningOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { extractProblem } from '../../../shared/api/client';
import { authStore } from '../../../shared/auth/authStore';
import { transactionDeletionApi, type TransactionDeletionRequest } from './transactionDeletionApi';

dayjs.extend(relativeTime);

const STATUS_COLOR: Record<TransactionDeletionRequest['status'], string> = {
  Pending: 'gold',
  Approved: 'green',
  Rejected: 'red',
  Expired: 'default',
};

/// Inbox of pending (and historical) Receipt/Voucher deletion requests for the second
/// approver. Requester sees their own queue and can withdraw via the Reject button (the
/// server treats a self-reject as a withdrawal). Approver sees other admins' requests
/// and can approve or reject.
///
/// The two-person rule is enforced server-side in TransactionDeletionRequest.Approve:
/// a 422 with code `txn-delete.two_person_rule` comes back if the same user tries to
/// approve their own request. We don't pre-hide the Approve button based on requester
/// identity because role/identity claims can race - rely on the server's authority.
export function TransactionDeletionsPage() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [statusFilter, setStatusFilter] = useState<TransactionDeletionRequest['status'] | undefined>('Pending');
  const [rejectTarget, setRejectTarget] = useState<TransactionDeletionRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const canApprove = authStore.hasPermission('admin.delete.approve');
  const canRequest = authStore.hasPermission('admin.delete.transaction');
  const currentUserId = authStore.getUser()?.id ?? null;

  const listQ = useQuery({
    queryKey: ['txn-deletions', statusFilter ?? 'all'],
    queryFn: () => transactionDeletionApi.list(statusFilter),
  });

  const approve = useMutation({
    mutationFn: (id: string) => transactionDeletionApi.approve(id),
    onSuccess: () => {
      message.success('Deletion approved - document reversed and moved to Trash');
      qc.invalidateQueries({ queryKey: ['txn-deletions'] });
    },
    onError: (err) => message.error(extractProblem(err)?.detail ?? 'Approval failed'),
  });

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => transactionDeletionApi.reject(id, note),
    onSuccess: () => {
      message.success('Rejected');
      setRejectTarget(null);
      setRejectNote('');
      qc.invalidateQueries({ queryKey: ['txn-deletions'] });
    },
    onError: (err) => message.error(extractProblem(err)?.detail ?? 'Reject failed'),
  });

  const cols: TableColumnsType<TransactionDeletionRequest> = [
    {
      title: 'Status', dataIndex: 'status', width: 110,
      render: (s: TransactionDeletionRequest['status']) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: 'Document', dataIndex: 'targetType', width: 200,
      render: (_t, r) => (
        <Space size={6}>
          <FileTextOutlined style={{ color: 'var(--jm-gray-500)' }} />
          <div>
            <div><strong>{r.targetType} {r.targetCode}</strong></div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{r.targetId.slice(0, 8)}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Requested by', dataIndex: 'requesterUserName', width: 180,
      render: (n: string, r) => (
        <div>
          <div>{n}</div>
          <Tooltip title={dayjs(r.requestedAtUtc).format('DD MMM YYYY HH:mm')}>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{dayjs(r.requestedAtUtc).fromNow()}</div>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Reason', dataIndex: 'reason',
      render: (v: string) => <span style={{ color: 'var(--jm-gray-800)' }}>{v}</span>,
    },
    {
      title: 'Expires', dataIndex: 'expiresAtUtc', width: 140,
      render: (v: string, r) => {
        if (r.status !== 'Pending') return <span style={{ color: 'var(--jm-gray-400)' }}>—</span>;
        const until = dayjs(v);
        const daysLeft = until.diff(dayjs(), 'day');
        const overdue = daysLeft < 0;
        return (
          <Tooltip title={until.format('DD MMM YYYY HH:mm')}>
            <Tag color={overdue ? 'red' : daysLeft <= 3 ? 'orange' : 'default'}>
              {overdue ? 'overdue' : daysLeft === 0 ? 'today' : `${daysLeft}d left`}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Decision', dataIndex: 'approverUserName', width: 200,
      render: (_n, r) => {
        if (r.status === 'Pending') return <span style={{ color: 'var(--jm-gray-400)' }}>—</span>;
        return (
          <div>
            <div>{r.approverUserName ?? <em>system</em>}</div>
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
              {r.approvedAtUtc ? dayjs(r.approvedAtUtc).format('DD MMM YYYY HH:mm') : ''}
            </div>
            {r.decisionNote && (
              <div style={{ fontSize: 11, color: 'var(--jm-gray-600)', marginTop: 2 }}>
                "{r.decisionNote}"
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Actions', key: 'actions', width: 220, fixed: 'right',
      render: (_v, r) => {
        if (r.status !== 'Pending') return null;
        // Two-person rule: hide Approve from the requester themselves. The server is the
        // source of truth, but pre-disabling avoids the obvious "why can't I click this"
        // confusion for the original requester.
        const isOwnRequest = currentUserId !== null && r.requesterUserId === currentUserId;
        return (
          <Space>
            <Tooltip title={isOwnRequest ? 'Two-person rule: a different SuperAdmin must approve' : undefined}>
              <Button
                type="primary" size="small" icon={<CheckOutlined />}
                disabled={!canApprove || isOwnRequest}
                loading={approve.isPending && approve.variables === r.id}
                onClick={() => modal.confirm({
                  icon: <ExclamationCircleOutlined style={{ color: '#dc2626' }} />,
                  title: `Approve deletion of ${r.targetType} ${r.targetCode}?`,
                  content: (
                    <div>
                      <p>This will <strong>reverse</strong> the document (writing offsetting ledger entries), then soft-delete it with a 30-day retention window.</p>
                      <p><strong>Reason given:</strong> {r.reason}</p>
                    </div>
                  ),
                  okText: 'Approve and reverse',
                  okButtonProps: { danger: true },
                  onOk: () => approve.mutate(r.id),
                })}
              >
                Approve
              </Button>
            </Tooltip>
            <Button
              size="small" icon={<CloseOutlined />}
              disabled={!canApprove && !(canRequest && isOwnRequest)}
              onClick={() => { setRejectTarget(r); setRejectNote(''); }}
            >
              Reject
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Transaction deletion requests"
        subtitle="Two-person rule for posted Receipt / Voucher deletions. A second SuperAdmin must approve - approval triggers a reversal posting and moves the document to the Trash."
        actions={
          <Space>
            <Select
              allowClear placeholder="Filter status" style={{ minWidth: 160 }}
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as TransactionDeletionRequest['status'] | undefined)}
              options={[
                { value: 'Pending', label: 'Pending' },
                { value: 'Approved', label: 'Approved' },
                { value: 'Rejected', label: 'Rejected' },
                { value: 'Expired', label: 'Expired' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => listQ.refetch()} loading={listQ.isFetching}>
              Refresh
            </Button>
          </Space>
        }
      />

      {listQ.data?.length === 0 && !listQ.isLoading ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--jm-gray-500)' }}>
            <WarningOutlined style={{ fontSize: 28, marginBottom: 8, color: 'var(--jm-gray-400)' }} />
            <div>No {statusFilter ? statusFilter.toLowerCase() : ''} deletion requests.</div>
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <Table<TransactionDeletionRequest>
            rowKey={(r) => r.id}
            dataSource={listQ.data ?? []}
            columns={cols}
            loading={listQ.isLoading}
            pagination={{ pageSize: 25, showSizeChanger: false }}
            size="middle"
            scroll={{ x: 1200 }}
          />
        </Card>
      )}

      <Modal
        title={rejectTarget ? `Reject deletion of ${rejectTarget.targetType} ${rejectTarget.targetCode}?` : ''}
        open={rejectTarget !== null}
        onCancel={() => { setRejectTarget(null); setRejectNote(''); }}
        onOk={() => {
          if (rejectTarget && rejectNote.trim().length >= 10) {
            reject.mutate({ id: rejectTarget.id, note: rejectNote.trim() });
          }
        }}
        okText="Reject request"
        okButtonProps={{ danger: true, disabled: rejectNote.trim().length < 10, loading: reject.isPending }}
      >
        <p style={{ marginBottom: 12, color: 'var(--jm-gray-600)' }}>
          The note is visible to the original requester and appears in the audit log.
          Minimum 10 characters.
        </p>
        <Input.TextArea
          rows={4} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
          placeholder="Why is this deletion being rejected?"
        />
      </Modal>
    </div>
  );
}
