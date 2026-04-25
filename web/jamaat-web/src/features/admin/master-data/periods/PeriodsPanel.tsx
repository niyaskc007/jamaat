import { useState } from 'react';
import { Card, Table, Tag, Button, App as AntdApp, Modal, Form, Input, DatePicker } from 'antd';
import { PlusOutlined, LockOutlined, UnlockOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { extractProblem } from '../../../../shared/api/client';
import { formatDate, formatDateTime } from '../../../../shared/format/format';
import { periodsApi, type FinancialPeriod } from '../../../ledger/ledgerApi';

export function PeriodsPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['periods'], queryFn: periodsApi.list });
  const [createOpen, setCreateOpen] = useState(false);

  const close = useMutation({
    mutationFn: (id: string) => periodsApi.close(id),
    onSuccess: () => { message.success('Period closed'); void qc.invalidateQueries({ queryKey: ['periods'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const reopen = useMutation({
    mutationFn: (id: string) => periodsApi.reopen(id),
    onSuccess: () => { message.success('Period reopened'); void qc.invalidateQueries({ queryKey: ['periods'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12 }}>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New period</Button>
      </div>
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <Table<FinancialPeriod>
          rowKey="id" size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'n', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
            { title: 'From', dataIndex: 'startDate', key: 's', render: (v: string) => formatDate(v) },
            { title: 'To', dataIndex: 'endDate', key: 'e', render: (v: string) => formatDate(v) },
            { title: 'Status', dataIndex: 'status', key: 'st', width: 120,
              render: (s: 1 | 2) => s === 1
                ? <Tag style={{ margin: 0, background: '#D1FAE5', color: '#065F46', border: 'none', fontWeight: 500 }}>Open</Tag>
                : <Tag style={{ margin: 0, background: '#E5E9EF', color: '#475569', border: 'none', fontWeight: 500 }}>Closed</Tag> },
            { title: 'Closed at', key: 'c', render: (_, row) => row.closedAtUtc ? <span style={{ fontSize: 12 }}>{formatDateTime(row.closedAtUtc)}{row.closedByUserName ? ` · ${row.closedByUserName}` : ''}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>—</span> },
            { title: '', key: 'a', width: 200, render: (_, row) => row.status === 1 ? (
              <Button icon={<LockOutlined />} danger size="small"
                onClick={() => modal.confirm({
                  title: `Close period "${row.name}"?`,
                  content: (
                    <div style={{ marginBlockStart: 8 }}>
                      <p style={{ margin: 0 }}>
                        Closing locks all ledger postings for <strong>{formatDate(row.startDate)} – {formatDate(row.endDate)}</strong>.
                      </p>
                      <ul style={{ marginBlockStart: 8, paddingInlineStart: 18, color: 'var(--jm-gray-600)', fontSize: 13 }}>
                        <li>New receipts and vouchers cannot post into this window.</li>
                        <li>Draft receipts within the window must be confirmed or cancelled first — the server will refuse to close otherwise.</li>
                        <li>An admin can reopen later, but every reopen is recorded in the audit log.</li>
                      </ul>
                    </div>
                  ),
                  okText: 'Close period', cancelText: 'Cancel',
                  okButtonProps: { danger: true },
                  onOk: () => close.mutateAsync(row.id),
                })}>Close</Button>
            ) : (
              <Button icon={<UnlockOutlined />} size="small"
                onClick={() => modal.confirm({
                  title: `Reopen period "${row.name}"?`,
                  content: 'New postings will be allowed in this window again. The reopen is captured in the audit log.',
                  okText: 'Reopen',
                  onOk: () => reopen.mutateAsync(row.id),
                })}>Reopen</Button>
            ) },
          ]}
          locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><CalendarOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No periods yet</div> }}
        />
      </Card>
      <CreatePeriod open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { refetch(); }} message={message} />
    </>
  );
}

function CreatePeriod({ open, onClose, onSaved, message }: { open: boolean; onClose: () => void; onSaved: () => void; message: ReturnType<typeof AntdApp.useApp>['message'] }) {
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: async (v: { name: string; range: [Dayjs, Dayjs] }) =>
      periodsApi.create({ name: v.name, startDate: v.range[0].format('YYYY-MM-DD'), endDate: v.range[1].format('YYYY-MM-DD') }),
    onSuccess: () => { message.success('Period created'); onSaved(); onClose(); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  return (
    <Modal title="Create financial period" open={open} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} okText="Create" confirmLoading={mutation.isPending}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ range: [dayjs().startOf('year'), dayjs().endOf('year')] }}
        onFinish={(v) => mutation.mutate(v)}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="FY 2026-27" autoFocus /></Form.Item>
        <Form.Item name="range" label="Dates" rules={[{ required: true }]}>
          <DatePicker.RangePicker style={{ inlineSize: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
