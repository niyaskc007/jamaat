import { useState } from 'react';
import { Alert, Button, Modal, Form, Input, DatePicker, App as AntdApp } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { periodsApi } from '../ledger/ledgerApi';
import { extractProblem } from '../../shared/api/client';

/**
 * Guards the rest of the dashboard — if today is not covered by an open financial period,
 * shows a blocking banner with a one-click setup flow.
 */
export function PeriodGuard() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: periods } = useQuery({ queryKey: ['periods'], queryFn: periodsApi.list });

  const today = dayjs().format('YYYY-MM-DD');
  const todayDate = dayjs(today);
  const covering = periods?.find((p) => p.status === 1 && dayjs(p.startDate).isBefore(todayDate.add(1, 'day')) && dayjs(p.endDate).isAfter(todayDate.subtract(1, 'day')));

  const mutation = useMutation({
    mutationFn: async (v: { name: string; range: [Dayjs, Dayjs] }) =>
      periodsApi.create({ name: v.name, startDate: v.range[0].format('YYYY-MM-DD'), endDate: v.range[1].format('YYYY-MM-DD') }),
    onSuccess: () => { message.success('Financial period created. You can now post transactions.'); void qc.invalidateQueries({ queryKey: ['periods'] }); setOpen(false); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  if (!periods) return null;
  if (covering) return null;

  const now = dayjs();
  // Default: Apr–Mar fiscal year covering today
  const suggestedStart = now.month() >= 3 ? dayjs(new Date(now.year(), 3, 1)) : dayjs(new Date(now.year() - 1, 3, 1));
  const suggestedEnd = suggestedStart.add(1, 'year').subtract(1, 'day');
  const suggestedName = `FY ${suggestedStart.year()}-${(suggestedStart.year() + 1) % 100}`;

  return (
    <>
      <Alert
        type="warning"
        showIcon
        icon={<CalendarOutlined />}
        message="No open financial period covers today"
        description={
          <span>
            Receipts and vouchers need a financial period to post into the ledger.
            Create one now — you can always close it later from{' '}
            <a href="/admin/master-data?tab=periods">Master Data → Financial Periods</a>.
          </span>
        }
        action={
          <Button type="primary" onClick={() => setOpen(true)}>
            Set up current period
          </Button>
        }
        style={{ marginBlockEnd: 16 }}
      />
      <Modal title="Create financial period" open={open} onCancel={() => setOpen(false)} destroyOnHidden
        onOk={() => form.submit()} okText="Create" confirmLoading={mutation.isPending}>
        <Form form={form} layout="vertical" requiredMark={false}
          initialValues={{ name: suggestedName, range: [suggestedStart, suggestedEnd] }}
          onFinish={(v) => mutation.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input autoFocus /></Form.Item>
          <Form.Item name="range" label="Dates" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ inlineSize: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
