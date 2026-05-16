import { useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Select, Tooltip, App as AntdApp, Modal,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined, UndoOutlined, ReloadOutlined, WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { extractProblem } from '../../../shared/api/client';
import { deletionApi, type TrashRow } from './deletionApi';

dayjs.extend(relativeTime);

/// The "Danger Zone" view: lists every soft-deleted row across all 12 supported
/// entity types, sorted by retention deadline ascending (closest to auto-purge first).
/// SuperAdmin can Restore a row (puts it back live) or Purge-now (skips the 30-day
/// timer and hard-deletes immediately). Both actions require an extra confirmation
/// step because both are essentially irreversible from the user's perspective -
/// Restore brings it back live but any cascade children that had their FK relationships
/// rebuilt elsewhere will be in an unexpected state; Purge is well-and-truly gone.
export function TrashPage() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [filterType, setFilterType] = useState<string | undefined>(undefined);

  const typesQ = useQuery({
    queryKey: ['trash', 'supported-types'],
    queryFn: deletionApi.supportedTypes,
    staleTime: 5 * 60 * 1000, // rarely changes
  });

  const trashQ = useQuery({
    queryKey: ['trash', 'list', filterType ?? 'all'],
    queryFn: () => deletionApi.trash(filterType),
  });

  const restore = useMutation({
    mutationFn: ({ entityType, id }: { entityType: string; id: string }) =>
      deletionApi.restore(entityType, id),
    onSuccess: () => {
      message.success('Restored');
      qc.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: (err) => message.error(extractProblem(err)?.detail ?? 'Restore failed'),
  });

  const purge = useMutation({
    mutationFn: ({ entityType, id }: { entityType: string; id: string }) =>
      deletionApi.purge(entityType, id),
    onSuccess: () => {
      message.success('Purged permanently');
      qc.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: (err) => message.error(extractProblem(err)?.detail ?? 'Purge failed'),
  });

  const cols: TableColumnsType<TrashRow> = [
    {
      title: 'Type', dataIndex: 'entityType', width: 160,
      render: (v: string) => <Tag color="default">{v}</Tag>,
    },
    {
      title: 'Item', dataIndex: 'label',
      render: (v: string, r) => (
        <div>
          <div><strong>{v}</strong></div>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{r.id}</div>
        </div>
      ),
    },
    {
      title: 'Deleted', dataIndex: 'deletedAtUtc', width: 180,
      render: (v: string, r) => (
        <div>
          <div>{dayjs(v).format('DD MMM YYYY HH:mm')}</div>
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
            {r.deletedByUserName ?? <em>actor unknown</em>}
          </div>
        </div>
      ),
    },
    {
      title: 'Reason', dataIndex: 'deletionReason', width: 240,
      render: (v: string | null) => v ?? <em style={{ color: 'var(--jm-gray-400)' }}>(none)</em>,
    },
    {
      title: 'Auto-purge', dataIndex: 'retentionUntilUtc', width: 180,
      render: (v: string | null) => {
        if (!v) return <Tag color="default">never (legacy)</Tag>;
        const now = dayjs();
        const until = dayjs(v);
        const daysLeft = until.diff(now, 'day');
        const overdue = daysLeft < 0;
        const soon = !overdue && daysLeft <= 7;
        return (
          <Tooltip title={until.format('DD MMM YYYY HH:mm')}>
            <Tag color={overdue ? 'red' : soon ? 'orange' : 'green'}>
              {overdue ? 'overdue' : daysLeft === 0 ? 'today' : `${daysLeft}d left`}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Actions', key: 'actions', width: 220,
      render: (_: unknown, r) => (
        <Space>
          <Button
            icon={<UndoOutlined />} size="small"
            loading={restore.isPending && restore.variables?.id === r.id}
            onClick={() => restore.mutate({ entityType: r.entityType, id: r.id })}
          >
            Restore
          </Button>
          <Button
            danger size="small" icon={<DeleteOutlined />}
            loading={purge.isPending && purge.variables?.id === r.id}
            onClick={() => modal.confirm({
              icon: <ExclamationCircleOutlined style={{ color: '#dc2626' }} />,
              title: 'Purge permanently?',
              content: (
                <div>
                  <p>This will <strong>hard-delete</strong> <code>{r.label}</code> right now, bypassing the 30-day retention window. The row cannot be restored after this.</p>
                  <p>If you only want to delete and keep the option to restore later, click Restore (no), close this dialog, and use the 30-day window as designed.</p>
                </div>
              ),
              okText: 'Yes, purge now',
              okButtonProps: { danger: true },
              cancelText: 'Cancel',
              onOk: () => purge.mutate({ entityType: r.entityType, id: r.id }),
            })}
          >
            Purge now
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Trash"
        subtitle="Soft-deleted master-data rows. Restore brings a row back live; Purge skips the 30-day retention timer and hard-deletes it immediately."
        actions={
          <Space>
            <Select
              allowClear placeholder="Filter by type" style={{ minWidth: 200 }}
              value={filterType}
              onChange={(v) => setFilterType(v ?? undefined)}
              options={(typesQ.data ?? []).map((t) => ({ value: t, label: t }))}
            />
            <Button icon={<ReloadOutlined />} onClick={() => trashQ.refetch()} loading={trashQ.isFetching}>
              Refresh
            </Button>
          </Space>
        }
      />

      {trashQ.data?.length === 0 && !trashQ.isLoading ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--jm-gray-500)' }}>
            <WarningOutlined style={{ fontSize: 28, marginBottom: 8, color: 'var(--jm-gray-400)' }} />
            <div>Trash is empty. Soft-deleted items will appear here.</div>
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <Table<TrashRow>
            rowKey={(r) => `${r.entityType}:${r.id}`}
            dataSource={trashQ.data ?? []}
            columns={cols}
            loading={trashQ.isLoading}
            pagination={{ pageSize: 25, showSizeChanger: false }}
            size="middle"
          />
        </Card>
      )}
    </div>
  );
}
