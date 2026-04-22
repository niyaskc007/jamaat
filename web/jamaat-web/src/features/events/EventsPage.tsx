import { useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, Empty, Space, App as AntdApp, Drawer, Form, DatePicker, Dropdown, Switch, Modal } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, EditOutlined, DeleteOutlined, StarOutlined, ScanOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { eventsApi, EventCategoryLabel, type Event, type EventCategory, type EventScan } from './eventsApi';

export function EventsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<EventCategory>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Event | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState<Event | null>(null);
  const [scansFor, setScansFor] = useState<Event | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['events', page, search, category],
    queryFn: () => eventsApi.list({ page, pageSize: 25, search, category }),
    placeholderData: keepPreviousData,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => eventsApi.remove(id),
    onSuccess: () => { message.success('Removed.'); void qc.invalidateQueries({ queryKey: ['events'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const cols: TableProps<Event>['columns'] = [
    { title: 'Date', dataIndex: 'eventDate', width: 140, render: (v: string, row) => (
      <div>
        <div>{formatDate(v)}</div>
        {row.eventDateHijri && <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{row.eventDateHijri}</div>}
      </div>
    ) },
    { title: 'Name', dataIndex: 'name', render: (v: string, row) => <div><a style={{ fontWeight: 500, color: 'var(--jm-gray-900)' }} onClick={() => navigate(`/events/${row.id}`)}>{v}</a>{row.nameArabic && <div dir="rtl" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.nameArabic}</div>}</div> },
    { title: 'Category', dataIndex: 'category', width: 140, render: (c: EventCategory) => <Tag color="blue">{EventCategoryLabel[c]}</Tag> },
    { title: 'Place', dataIndex: 'place', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Attendees', dataIndex: 'scanCount', width: 110,
      render: (v: number, row) => <Button type="link" size="small" onClick={() => setScansFor(row)}>{v} scanned</Button> },
    { title: 'Status', dataIndex: 'isActive', width: 100, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Active' : 'Inactive'}</Tag> },
    {
      key: 'actions', width: 60,
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [
          { key: 'manage', icon: <SettingOutlined />, label: 'Manage event', onClick: () => navigate(`/events/${row.id}`) },
          { key: 'scan', icon: <ScanOutlined />, label: 'Scan attendance', onClick: () => setScanOpen(row) },
          { key: 'edit', icon: <EditOutlined />, label: 'Quick edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Delete / deactivate',
            onClick: () => modal.confirm({ title: 'Remove event?', onOk: () => delMut.mutateAsync(row.id) }) },
        ];
        return <Dropdown menu={{ items }} trigger={['click']}><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      }
    },
  ];

  return (
    <div>
      <PageHeader title="Events"
        subtitle="Religious and community events. Scan ITS numbers at an event to record member attendance."
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>New event</Button>} />

      <Card style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBlockEnd: '1px solid var(--jm-border)' }}>
          <Input placeholder="Search" prefix={<SearchOutlined />} allowClear value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setPage(1)} style={{ inlineSize: 240 }} />
          <Select allowClear placeholder="Category" style={{ inlineSize: 180 }} value={category}
            onChange={(v) => setCategory(v as EventCategory | undefined)}
            options={Object.entries(EventCategoryLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        </div>
        <Table rowKey="id" size="middle" loading={isLoading} columns={cols} dataSource={data?.items ?? []}
          onChange={(p) => setPage(p.current ?? 1)}
          pagination={{ current: page, pageSize: 25, total: data?.total ?? 0 }}
          locale={{ emptyText: (data?.total ?? 0) === 0 ? <Empty image={<StarOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />} description="No events yet" /> : undefined }} />
      </Card>

      <EventDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} event={editing} />
      {scanOpen && <ScanModal event={scanOpen} onClose={() => setScanOpen(null)} />}
      {scansFor && <ScansModal event={scansFor} onClose={() => setScansFor(null)} />}
    </div>
  );
}

function EventDrawer({ open, onClose, event }: { open: boolean; onClose: () => void; event: Event | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!event;
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      const date = v.eventDate ? dayjs(v.eventDate as string | Date).format('YYYY-MM-DD') : '';
      return isEdit
        ? eventsApi.update(event!.id, {
            name: v.name as string, nameArabic: (v.nameArabic as string) || null,
            tagline: (v.tagline as string) || null, description: null,
            category: v.category as EventCategory, eventDate: date,
            eventDateHijri: (v.eventDateHijri as string) || null,
            place: (v.place as string) || null, venueAddress: null,
            venueLatitude: null, venueLongitude: null,
            contactPhone: null, contactEmail: null,
            notes: (v.notes as string) || null,
            isActive: (v.isActive as boolean) ?? true,
          })
        : eventsApi.create({
            slug: undefined,
            name: v.name as string, nameArabic: (v.nameArabic as string) || undefined,
            tagline: (v.tagline as string) || undefined,
            category: v.category as EventCategory, eventDate: date,
            eventDateHijri: (v.eventDateHijri as string) || undefined,
            place: (v.place as string) || undefined, notes: (v.notes as string) || undefined,
          });
    },
    onSuccess: () => { message.success('Saved.'); void qc.invalidateQueries({ queryKey: ['events'] }); onClose(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <Drawer open={open} onClose={onClose} width={520} destroyOnHidden title={isEdit ? `Edit · ${event!.name}` : 'New event'}
      footer={<Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save</Button></Space>}>
      <Form layout="vertical" form={form} requiredMark={false}
        initialValues={event
          ? { ...event, eventDate: dayjs(event.eventDate) }
          : { isActive: true, category: 1, eventDate: dayjs() }}>
        <Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="Name (Arabic)" name="nameArabic"><Input dir="rtl" /></Form.Item>
        <Form.Item label="Tagline" name="tagline" help="Short subtitle shown on the event card.">
          <Input placeholder="e.g., Night of Mercy, 1447H" />
        </Form.Item>
        <Form.Item label="Category" name="category">
          <Select options={Object.entries(EventCategoryLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
        </Form.Item>
        <Form.Item label="Event date" name="eventDate" rules={[{ required: true }]}>
          <DatePicker style={{ inlineSize: '100%' }} />
        </Form.Item>
        <Form.Item label="Hijri date" name="eventDateHijri" help="Leave blank to auto-generate from Gregorian.">
          <Input placeholder="e.g., 15 Rabiul Akhar 1447H." />
        </Form.Item>
        <Form.Item label="Place" name="place"><Input /></Form.Item>
        <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        {isEdit && <Form.Item label="Active" name="isActive" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Drawer>
  );
}

function ScanModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [its, setIts] = useState('');
  const [location, setLocation] = useState(event.place ?? '');
  const mut = useMutation({
    mutationFn: () => eventsApi.scan(event.id, its, location || undefined),
    onSuccess: (s) => { message.success(`Scanned: ${s.memberName}.`); setIts(''); void qc.invalidateQueries({ queryKey: ['events'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Scan failed'),
  });
  return (
    <Modal title={`Scan · ${event.name}`} open onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} destroyOnClose>
      <Space direction="vertical" style={{ inlineSize: '100%' }}>
        <Input autoFocus placeholder="ITS number (8 digits)" maxLength={8} value={its}
          onChange={(e) => setIts(e.target.value)} onPressEnter={() => its.length === 8 && mut.mutate()} />
        <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Button type="primary" block icon={<ScanOutlined />} loading={mut.isPending}
          disabled={its.length !== 8} onClick={() => mut.mutate()}>Record attendance</Button>
      </Space>
    </Modal>
  );
}

function ScansModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['event-scans', event.id], queryFn: () => eventsApi.listScans({ eventId: event.id, pageSize: 200 }) });
  return (
    <Modal title={`Attendees · ${event.name}`} open onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={720}>
      <Table<EventScan> rowKey="id" size="small" pagination={false} dataSource={data?.items ?? []}
        columns={[
          { title: 'ITS', dataIndex: 'memberItsNumber', width: 110 },
          { title: 'Name', dataIndex: 'memberName' },
          { title: 'Scanned at', dataIndex: 'scannedAtUtc', render: (v: string) => formatDateTime(v) },
          { title: 'Location', dataIndex: 'location', render: (v: string | null) => v ?? '—' },
        ]}
      />
    </Modal>
  );
}
