import { useState, useEffect } from 'react';
import {
  Card, Tabs, Space, Button, Form, Input, InputNumber, Select, DatePicker, Switch, Tag, Row, Col,
  App as AntdApp, Upload, Spin, Result, Table, Empty, Modal, Alert, QRCode,
} from 'antd';
import type { TableProps } from 'antd';
import {
  SettingOutlined, HighlightOutlined, ScheduleOutlined, TeamOutlined, FormOutlined,
  UploadOutlined, CalendarOutlined, PlusOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, ScanOutlined, LinkOutlined,
  LayoutOutlined, ShareAltOutlined, CopyOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { PageDesigner } from './sections/PageDesigner';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { ImageUploadField } from '../../shared/ui/ImageUploadField';
import { ColorOrGradientPicker } from '../../shared/ui/ColorOrGradientPicker';
import { LocationPickerField } from '../../shared/ui/LocationPickerField';
import {
  eventsApi, eventRegistrationsApi, EventCategoryLabel,
  RegistrationStatusLabel, RegistrationStatusColor, AgeBandLabel,
  type Event, type EventCategory, type EventRegistration, type RegistrationStatus,
} from './eventsApi';
import { useEventCategories, categoryLabelOf } from './useEventCategories';

export function EventDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', id], queryFn: () => eventsApi.get(id), enabled: !!id,
  });
  const categoriesQ = useEventCategories();
  const categoryOptions = (categoriesQ.data ?? []).map((c) => ({ value: c.code, label: c.name }));

  const portalUrl = event ? `${window.location.origin}/portal/events/${event.slug}` : '';

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  if (!event) return <Result status="404" title="Event not found" extra={<Button onClick={() => navigate('/events')}>Back</Button>} />;

  const onSaved = (e: Event) => {
    message.success('Saved.');
    qc.setQueryData(['event', id], e);
    void qc.invalidateQueries({ queryKey: ['events'] });
    // Page Designer's live preview reads through portal-preview, NOT through the admin `event`
    // query - so without this invalidate, the preview would keep showing stale data after
    // agenda / branding / share / overview saves (e.g. an Agenda section would say "Agenda will
    // be posted soon" even after the user just added agenda items in the Agenda tab).
    void qc.invalidateQueries({ queryKey: ['portal-preview', e.slug] });
  };

  return (
    <div>
      <PageHeader
        title={event.name}
        subtitle={`${event.categoryName ?? categoryLabelOf(categoriesQ.data, event.category) ?? EventCategoryLabel[event.category] ?? `Category ${event.category}`} Â· ${formatDate(event.eventDate)}${event.eventDateHijri ? ` Â· ${event.eventDateHijri}` : ''}${event.place ? ` Â· ${event.place}` : ''}`}
        actions={
          <Space>
            <Button icon={<LinkOutlined />}
              onClick={() => { navigator.clipboard.writeText(portalUrl); message.success('Public URL copied.'); }}>
              Copy portal URL
            </Button>
            <Button onClick={() => navigate('/events')}>Back</Button>
          </Space>
        }
      />

      {/* Cover banner preview - uses <img> + onError so a stale/broken URL doesn't leave
         a 180px-tall blank rectangle. Hidden entirely when no cover is set. */}
      {event.coverImageUrl && (
        <img
          src={event.coverImageUrl}
          alt=""
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          style={{ inlineSize: '100%', blockSize: 180, objectFit: 'cover', borderRadius: 12, marginBlockEnd: 16, display: 'block' }}
        />
      )}

      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 16, flexWrap: 'wrap' }}>
        <Statistic label="Registrations" value={event.registrationCount} />
        <Statistic label="Confirmed" value={event.confirmedCount} color="#0E5C40" />
        <Statistic label="Waitlisted" value={event.waitlistedCount} color="#B45309" />
        <Statistic label="Checked-in" value={event.checkedInCount} color="#0369A1" />
        <Statistic label="Scans" value={event.scanCount} />
        {event.capacity != null && <Statistic label="Capacity" value={event.capacity} />}
      </div>

      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Tabs defaultActiveKey="overview"
          tabBarStyle={{ paddingInline: 16, marginBlockEnd: 0 }}
          items={[
            { key: 'overview', label: <span><SettingOutlined /> Overview</span>, children: <OverviewTab event={event} onSaved={onSaved} categoryOptions={categoryOptions} /> },
            { key: 'branding', label: <span><HighlightOutlined /> Branding</span>, children: <BrandingTab event={event} onSaved={onSaved} /> },
            { key: 'share', label: <span><ShareAltOutlined /> Share &amp; SEO</span>, children: <ShareTab event={event} onSaved={onSaved} /> },
            { key: 'registration', label: <span><FormOutlined /> Registration</span>, children: <RegistrationSettingsTab event={event} onSaved={onSaved} /> },
            { key: 'agenda', label: <span><ScheduleOutlined /> Agenda</span>, children: <AgendaTab event={event} onSaved={onSaved} /> },
            { key: 'page', label: <span><LayoutOutlined /> Page designer</span>, children: <PageDesigner eventId={event.id} eventSlug={event.slug} primaryColor={event.primaryColor} accentColor={event.accentColor} /> },
            { key: 'registrations', label: <span><TeamOutlined /> Registrations</span>, children: <RegistrationsTab event={event} /> },
          ]} />
      </Card>
    </div>
  );
}

function Statistic({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card size="small" style={{ minInlineSize: 140, border: '1px solid var(--jm-border)' }}>
      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: color ?? 'var(--jm-gray-900)' }} className="jm-tnum">{value}</div>
    </Card>
  );
}

// ---- Overview --------------------------------------------------------------

function OverviewTab({ event, onSaved, categoryOptions }: {
  event: Event; onSaved: (e: Event) => void;
  categoryOptions: { value: number; label: string }[];
}) {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      const payload = {
        name: v.name as string, nameArabic: (v.nameArabic as string) || null,
        tagline: (v.tagline as string) || null,
        description: (v.description as string) || null,
        category: v.category as EventCategory,
        eventDate: dayjs(v.eventDate as Dayjs).format('YYYY-MM-DD'),
        eventDateHijri: (v.eventDateHijri as string) || null,
        startsAtUtc: v.startsAtUtc ? dayjs(v.startsAtUtc as Dayjs).toISOString() : null,
        endsAtUtc: v.endsAtUtc ? dayjs(v.endsAtUtc as Dayjs).toISOString() : null,
        place: (v.place as string) || null,
        venueAddress: (v.venueAddress as string) || null,
        venueLatitude: (v.venueLatitude as number) ?? null,
        venueLongitude: (v.venueLongitude as number) ?? null,
        contactPhone: (v.contactPhone as string) || null,
        contactEmail: (v.contactEmail as string) || null,
        notes: (v.notes as string) || null,
        isActive: (v.isActive as boolean) ?? true,
      };
      return eventsApi.update(event.id, payload);
    },
    onSuccess: onSaved,
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed'),
  });
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false}
        initialValues={{
          ...event,
          eventDate: dayjs(event.eventDate),
          startsAtUtc: event.startsAtUtc ? dayjs(event.startsAtUtc) : null,
          endsAtUtc: event.endsAtUtc ? dayjs(event.endsAtUtc) : null,
        }}>
        <Row gutter={16}>
          <Col span={16}><Form.Item label="Slug" help={`Public URL path. Read-only - computed from the name.`}><Input value={event.slug} disabled /></Form.Item></Col>
          <Col span={8}><Form.Item label="Category" name="category" help="Manage under Master Data â–¸ Lookups (EventCategory).">
            <Select options={categoryOptions} />
          </Form.Item></Col>
          <Col span={12}><Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Name (Arabic)" name="nameArabic"><Input dir="rtl" /></Form.Item></Col>
          <Col span={24}><Form.Item label="Tagline" name="tagline"><Input placeholder="Short subtitle shown on the event card." /></Form.Item></Col>
          <Col span={24}><Form.Item label="Description" name="description" help="Markdown supported - shown on the public event page.">
            <Input.TextArea rows={6} />
          </Form.Item></Col>
          <Col span={8}><Form.Item label="Event date" name="eventDate" rules={[{ required: true }]}><DatePicker style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={16}><Form.Item label="Hijri date" name="eventDateHijri"><Input placeholder="Auto-generated if blank" /></Form.Item></Col>
          <Col span={12}><Form.Item label="Starts at" name="startsAtUtc"><DatePicker showTime style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={12}><Form.Item label="Ends at" name="endsAtUtc"><DatePicker showTime style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={12}><Form.Item label="Venue name" name="place"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Venue address" name="venueAddress" help="Multi-line. Used on the public portal and in share previews.">
            <Input.TextArea rows={3} />
          </Form.Item></Col>
          <Col span={24}>
            <Form.Item label="Pin venue on map" help="Search by address, click anywhere on the map, or drag the marker. Latitude / longitude below fill in automatically.">
              <VenueMapPicker form={form} />
            </Form.Item>
          </Col>
          <Col span={12}><Form.Item label="Latitude" name="venueLatitude"><InputNumber style={{ inlineSize: '100%' }} step={0.000001} /></Form.Item></Col>
          <Col span={12}><Form.Item label="Longitude" name="venueLongitude"><InputNumber style={{ inlineSize: '100%' }} step={0.000001} /></Form.Item></Col>
          <Col span={12}><Form.Item label="Contact phone" name="contactPhone"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Contact email" name="contactEmail"><Input /></Form.Item></Col>
          <Col span={24}><Form.Item label="Notes (internal)" name="notes"><Input.TextArea rows={2} /></Form.Item></Col>
          <Col span={12}><Form.Item label="Active" name="isActive" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
      </Form>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)' }}>
        <Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save changes</Button>
      </div>
    </div>
  );
}

// Cover preview that handles broken/missing image URLs gracefully and re-mounts whenever the
// URL changes (so a successful re-upload clears any prior "broken" state and the browser
// refetches even when the server URL is the same).
function CoverImagePreview({ src }: { src?: string | null }) {
  const [broken, setBroken] = useState(false);
  // Reset broken whenever the URL changes; React would otherwise keep the prior img element.
  useEffect(() => { setBroken(false); }, [src]);
  if (!src) {
    return <div style={{ blockSize: 160, borderRadius: 8, background: 'var(--jm-surface-muted)', display: 'grid', placeItems: 'center', color: 'var(--jm-gray-400)' }}>No cover</div>;
  }
  if (broken) {
    return <div style={{ blockSize: 160, borderRadius: 8, background: '#FEF2F2', border: '1px dashed #DC2626', display: 'grid', placeItems: 'center', color: '#DC2626', fontSize: 13, padding: 8, textAlign: 'center' }}>Cover image not reachable. Try uploading again.</div>;
  }
  return (
    <img
      key={src}
      src={src}
      alt=""
      onError={() => setBroken(true)}
      style={{ inlineSize: '100%', blockSize: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--jm-border)', display: 'block' }}
    />
  );
}

// Bridges the shared LocationPickerField to the AntD Form's two latitude / longitude fields.
// Uses Form.useWatch so the marker stays in sync if the user edits the numeric inputs by hand.
function VenueMapPicker({ form }: { form: ReturnType<typeof Form.useForm>[0] }) {
  const lat = Form.useWatch('venueLatitude', form) as number | null | undefined;
  const lng = Form.useWatch('venueLongitude', form) as number | null | undefined;
  return (
    <LocationPickerField
      latitude={lat ?? null}
      longitude={lng ?? null}
      onChange={(la, ln) => form.setFieldsValue({ venueLatitude: la, venueLongitude: ln })}
    />
  );
}

// ---- Branding --------------------------------------------------------------

function BrandingTab({ event, onSaved }: { event: Event; onSaved: (e: Event) => void }) {
  const { message } = AntdApp.useApp();
  const [primary, setPrimary] = useState(event.primaryColor ?? '#0E5C40');
  const [accent, setAccent] = useState(event.accentColor ?? '#B45309');
  const [logoUrl, setLogoUrl] = useState(event.logoUrl ?? '');

  const uploadMut = useMutation({
    mutationFn: (file: File) => eventsApi.uploadCover(event.id, file),
    onSuccess: (e) => { message.success('Cover uploaded.'); onSaved(e); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Upload failed'),
  });
  const saveMut = useMutation({
    mutationFn: () => eventsApi.updateBranding(event.id, { coverImageUrl: event.coverImageUrl, logoUrl: logoUrl || null, primaryColor: primary || null, accentColor: accent || null }),
    onSuccess: (e) => { message.success('Branding saved.'); onSaved(e); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed'),
  });

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={24}>
        <Col span={12}>
          <Card size="small" title="Cover image" className="jm-card">
            <CoverImagePreview src={event.coverImageUrl} />
            <Upload maxCount={1} showUploadList={false} accept="image/*" beforeUpload={(file) => { uploadMut.mutate(file); return false; }}>
              <Button icon={<UploadOutlined />} loading={uploadMut.isPending} style={{ marginBlockStart: 12 }}>Upload new cover</Button>
            </Upload>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="Colors + logo" className="jm-card">
            <Form layout="vertical">
              <Form.Item label="Primary color" help="Applied to buttons + accents on the public portal page.">
                <ColorOrGradientPicker value={primary} onChange={(v) => setPrimary(v ?? '#0E5C40')} mode="solid" />
              </Form.Item>
              <Form.Item label="Accent color">
                <ColorOrGradientPicker value={accent} onChange={(v) => setAccent(v ?? '#B45309')} mode="solid" />
              </Form.Item>
              <Form.Item label="Logo (optional)">
                <ImageUploadField
                  value={logoUrl || null}
                  onChange={(url) => setLogoUrl(url ?? '')}
                  upload={(file) => eventsApi.uploadAsset(event.id, file).then((r) => r.url)}
                  previewHeight={80}
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col span={24} style={{ marginBlockStart: 16 }}>
          <Card size="small" title="Live preview" className="jm-card">
            <div style={{
              padding: 24, borderRadius: 12,
              background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
              color: '#fff',
            }}>
              {logoUrl && <img src={logoUrl} alt="Logo" style={{ blockSize: 44, marginBlockEnd: 12 }} />}
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>{event.categoryName ?? EventCategoryLabel[event.category] ?? `Category ${event.category}`}</div>
              <div style={{ fontSize: 28, fontWeight: 600, marginBlockStart: 6 }}>{event.name}</div>
              {event.tagline && <div style={{ fontSize: 14, opacity: 0.9, marginBlockStart: 4 }}>{event.tagline}</div>}
              <div style={{ marginBlockStart: 12, fontSize: 13, opacity: 0.85 }}>
                <CalendarOutlined /> {formatDate(event.eventDate)}{event.place ? ` Â· ${event.place}` : ''}
              </div>
            </div>
          </Card>
        </Col>
      </Row>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)', marginBlockStart: 16 }}>
        <Button type="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>Save colors &amp; logo</Button>
      </div>
    </div>
  );
}

// ---- Registration settings -------------------------------------------------

function RegistrationSettingsTab({ event, onSaved }: { event: Event; onSaved: (e: Event) => void }) {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => eventsApi.updateRegistrationSettings(event.id, {
      registrationsEnabled: (v.registrationsEnabled as boolean) ?? false,
      registrationOpensAtUtc: v.registrationOpensAtUtc ? dayjs(v.registrationOpensAtUtc as Dayjs).toISOString() : null,
      registrationClosesAtUtc: v.registrationClosesAtUtc ? dayjs(v.registrationClosesAtUtc as Dayjs).toISOString() : null,
      capacity: (v.capacity as number) ?? null,
      allowGuests: (v.allowGuests as boolean) ?? false,
      maxGuestsPerRegistration: (v.maxGuestsPerRegistration as number) ?? 0,
      openToNonMembers: (v.openToNonMembers as boolean) ?? false,
      requiresApproval: (v.requiresApproval as boolean) ?? false,
    }),
    onSuccess: (e) => { message.success('Saved.'); onSaved(e); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed'),
  });
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false}
        initialValues={{
          ...event,
          registrationOpensAtUtc: event.registrationOpensAtUtc ? dayjs(event.registrationOpensAtUtc) : null,
          registrationClosesAtUtc: event.registrationClosesAtUtc ? dayjs(event.registrationClosesAtUtc) : null,
        }}>
        <Row gutter={16}>
          <Col span={8}><Form.Item label="Registrations enabled" name="registrationsEnabled" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Open to non-members" name="openToNonMembers" valuePropName="checked" help="If off, only logged-in members can register."><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Requires admin approval" name="requiresApproval" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={12}><Form.Item label="Opens at" name="registrationOpensAtUtc"><DatePicker showTime style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={12}><Form.Item label="Closes at" name="registrationClosesAtUtc"><DatePicker showTime style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Capacity (seats)" name="capacity" help="Blank = unlimited."><InputNumber min={0} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Allow guests" name="allowGuests" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Max guests per registration" name="maxGuestsPerRegistration"><InputNumber min={0} max={20} style={{ inlineSize: '100%' }} /></Form.Item></Col>
        </Row>
      </Form>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)' }}>
        <Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save settings</Button>
      </div>
    </div>
  );
}

// ---- Agenda ---------------------------------------------------------------

type AgendaRow = { title: string; startTime?: string | null; endTime?: string | null; speaker?: string | null; location?: string | null; description?: string | null };

function AgendaTab({ event, onSaved }: { event: Event; onSaved: (e: Event) => void }) {
  const { message } = AntdApp.useApp();
  const [items, setItems] = useState<AgendaRow[]>(() => event.agenda.map((a) => ({
    title: a.title, startTime: a.startTime ?? null, endTime: a.endTime ?? null,
    speaker: a.speaker ?? null, location: a.location ?? null, description: a.description ?? null,
  })));

  const addRow = () => setItems((prev) => [...prev, { title: '', startTime: null, endTime: null }]);
  const removeRow = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i));
  const updateRow = (i: number, patch: Partial<AgendaRow>) =>
    setItems((prev) => prev.map((r, j) => j === i ? { ...r, ...patch } : r));

  const mut = useMutation({
    mutationFn: () => eventsApi.replaceAgenda(event.id, {
      items: items.filter((i) => i.title.trim()).map((i) => ({
        title: i.title, startTime: i.startTime || null, endTime: i.endTime || null,
        speaker: i.speaker || null, location: i.location || null, description: i.description || null,
      }))
    }),
    onSuccess: (e) => { message.success('Agenda saved.'); onSaved(e); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed'),
  });

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={12} style={{ inlineSize: '100%' }}>
        {items.map((r, i) => (
          <Card key={i} size="small" className="jm-card">
            <Row gutter={12}>
              <Col span={10}><Input placeholder="Title (e.g., Opening prayer)" value={r.title} onChange={(e) => updateRow(i, { title: e.target.value })} /></Col>
              <Col span={4}><Input placeholder="Start HH:mm" value={r.startTime ?? ''} onChange={(e) => updateRow(i, { startTime: e.target.value })} /></Col>
              <Col span={4}><Input placeholder="End HH:mm" value={r.endTime ?? ''} onChange={(e) => updateRow(i, { endTime: e.target.value })} /></Col>
              <Col span={4}><Input placeholder="Speaker" value={r.speaker ?? ''} onChange={(e) => updateRow(i, { speaker: e.target.value })} /></Col>
              <Col span={2}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeRow(i)} /></Col>
              <Col span={24}>
                <Input placeholder="Description (optional)" value={r.description ?? ''} onChange={(e) => updateRow(i, { description: e.target.value })} style={{ marginBlockStart: 8 }} />
              </Col>
            </Row>
          </Card>
        ))}
        <Button icon={<PlusOutlined />} onClick={addRow}>Add agenda item</Button>
      </Space>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)', marginBlockStart: 16 }}>
        <Button type="primary" loading={mut.isPending} onClick={() => mut.mutate()}>Save agenda</Button>
      </div>
    </div>
  );
}

// ---- Registrations ---------------------------------------------------------

function RegistrationsTab({ event }: { event: Event }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [status, setStatus] = useState<RegistrationStatus>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['event-regs', event.id, page, status, search],
    queryFn: () => eventsApi.listRegistrations(event.id, { page, pageSize: 25, status, search }),
  });

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['event-regs', event.id] }); void qc.invalidateQueries({ queryKey: ['event', event.id] }); };

  const confirmMut = useMutation({ mutationFn: (id: string) => eventRegistrationsApi.confirm(id), onSuccess: () => { message.success('Confirmed.'); invalidate(); }, onError: (e) => message.error(extractProblem(e).detail ?? 'Failed') });
  const checkInMut = useMutation({ mutationFn: (id: string) => eventRegistrationsApi.checkIn(id), onSuccess: () => { message.success('Checked in.'); invalidate(); }, onError: (e) => message.error(extractProblem(e).detail ?? 'Failed') });
  const cancelMut = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => eventRegistrationsApi.cancel(id, reason), onSuccess: () => { message.success('Cancelled.'); invalidate(); }, onError: (e) => message.error(extractProblem(e).detail ?? 'Failed') });

  const cols: TableProps<EventRegistration>['columns'] = [
    { title: 'Code', dataIndex: 'registrationCode', width: 150, render: (v: string) => <span className="jm-tnum" style={{ fontWeight: 500 }}>{v}</span> },
    {
      title: 'Attendee', dataIndex: 'attendeeName',
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
            {r.attendeeItsNumber ? `ITS ${r.attendeeItsNumber}` : 'Guest'}
            {r.attendeeEmail ? ` Â· ${r.attendeeEmail}` : ''}
            {r.attendeePhone ? ` Â· ${r.attendeePhone}` : ''}
          </div>
        </div>
      ),
    },
    { title: 'Seats', dataIndex: 'seatCount', width: 80 },
    {
      title: 'Guests', dataIndex: 'guests', width: 160,
      render: (g: EventRegistration['guests']) => g.length === 0
        ? <span style={{ color: 'var(--jm-gray-400)' }}>-</span>
        : <span>{g.length} ({g.map((x) => AgeBandLabel[x.ageBand]).join(', ')})</span>,
    },
    { title: 'Status', dataIndex: 'status', width: 130, render: (s: RegistrationStatus) => <Tag color={RegistrationStatusColor[s]}>{RegistrationStatusLabel[s]}</Tag> },
    { title: 'Registered', dataIndex: 'registeredAtUtc', width: 150, render: (v: string) => <span style={{ color: 'var(--jm-gray-600)' }}>{formatDateTime(v)}</span> },
    {
      key: 'actions', align: 'end', width: 240,
      render: (_: unknown, r) => (
        <Space>
          {r.status === 1 && <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />} loading={confirmMut.isPending} onClick={() => confirmMut.mutate(r.id)}>Confirm</Button>}
          {r.status !== 5 && r.status !== 4 && <Button size="small" icon={<ScanOutlined />} loading={checkInMut.isPending} onClick={() => checkInMut.mutate(r.id)}>Check in</Button>}
          {r.status !== 4 && r.status !== 5 && <Button size="small" type="text" danger icon={<CloseCircleOutlined />}
            onClick={() => Modal.confirm({
              title: 'Cancel registration?',
              content: <Input.TextArea placeholder="Reason" id={`cancel-reason-${r.id}`} rows={2} />,
              onOk: () => {
                const el = document.getElementById(`cancel-reason-${r.id}`) as HTMLTextAreaElement | null;
                return cancelMut.mutateAsync({ id: r.id, reason: el?.value ?? '' });
              },
            })}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBlockEnd: 12 }} wrap>
        <Input placeholder="Search code / name / email" allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ inlineSize: 260 }} />
        <Select allowClear placeholder="Status" style={{ inlineSize: 160 }} value={status} onChange={(v) => setStatus(v as RegistrationStatus)}
          options={Object.entries(RegistrationStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
      </Space>
      <Table<EventRegistration>
        rowKey="id" size="middle" loading={isLoading}
        columns={cols} dataSource={data?.items ?? []}
        onChange={(p) => setPage(p.current ?? 1)}
        pagination={{ current: page, pageSize: 25, total: data?.total ?? 0 }}
        locale={{ emptyText: <Empty description="No registrations yet." /> }}
      />
    </div>
  );
}

// AntD Form clones into custom inputs and injects value/onChange - the picker honours
// that shape so the share-image upload integrates with the rest of the form's submit flow.
function ShareImagePicker({ value, onChange, eventId, fallback }: {
  value?: string | null; onChange?: (v: string | null) => void;
  eventId: string; fallback: string | null;
}) {
  const effective = value || fallback;
  return (
    <ImageUploadField
      value={effective}
      onChange={(url) => onChange?.(url)}
      upload={(file) => eventsApi.uploadAsset(eventId, file).then((r) => r.url)}
      previewHeight={140}
    />
  );
}

// ---- Share & SEO ----------------------------------------------------------

function ShareTab({ event, onSaved }: { event: Event; onSaved: (e: Event) => void }) {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => eventsApi.updateShare(event.id, {
      shareTitle: (v.shareTitle as string) || null,
      shareDescription: (v.shareDescription as string) || null,
      shareImageUrl: (v.shareImageUrl as string) || null,
    }),
    onSuccess: (e) => { message.success('Share settings saved.'); onSaved(e); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed'),
  });
  const watchTitle = Form.useWatch('shareTitle', form) as string | undefined;
  const watchDesc = Form.useWatch('shareDescription', form) as string | undefined;
  const watchImg = Form.useWatch('shareImageUrl', form) as string | undefined;
  const preview = {
    title: watchTitle || event.shareTitle || event.name,
    desc: watchDesc || event.shareDescription || event.tagline || '',
    img: watchImg || event.shareImageUrl || event.coverImageUrl || undefined,
  };
  return (
    <div style={{ padding: 24 }}>
      <Row gutter={24}>
        <Col xs={24} md={14}>
          <Form layout="vertical" form={form} requiredMark={false}
            initialValues={{ shareTitle: event.shareTitle ?? '', shareDescription: event.shareDescription ?? '', shareImageUrl: event.shareImageUrl ?? '' }}>
            <Form.Item label="Share title" name="shareTitle" help="Used when this event is shared on WhatsApp, Twitter, etc. Defaults to the event's name.">
              <Input placeholder={event.name} />
            </Form.Item>
            <Form.Item label="Share description" name="shareDescription" help="A short one-liner (up to ~160 chars). Shows under the title in share previews.">
              <Input.TextArea rows={3} maxLength={160} showCount placeholder={event.tagline ?? 'Write something invitingâ€¦'} />
            </Form.Item>
            <Form.Item label="Share image" name="shareImageUrl" help="1200Ã—630 recommended. Defaults to the event's cover image.">
              <ShareImagePicker eventId={event.id} fallback={event.coverImageUrl ?? null} />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)' }}>
              <Button type="primary" loading={mut.isPending} onClick={() => mut.mutate(form.getFieldsValue())}>Save share settings</Button>
            </div>
          </Form>
        </Col>
        <Col xs={24} md={10}>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBlockEnd: 8 }}>Link-preview mock</div>
          <div style={{ border: '1px solid var(--jm-border)', borderRadius: 10, overflow: 'hidden', background: '#FFF', boxShadow: 'var(--jm-shadow-1)' }}>
            {preview.img
              ? <div style={{ blockSize: 180, background: `center/cover no-repeat url(${preview.img})` }} />
              : <div style={{ blockSize: 180, background: 'linear-gradient(135deg, var(--jm-primary-500), var(--jm-accent-500, #B45309))', display: 'grid', placeItems: 'center', color: '#FFF' }}>{preview.title.slice(0, 40)}</div>}
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{typeof window !== 'undefined' ? window.location.host : 'jamaat.app'}</div>
              <div style={{ fontWeight: 600, marginBlockStart: 2 }}>{preview.title}</div>
              {preview.desc && <div style={{ fontSize: 13, color: 'var(--jm-gray-600)', marginBlockStart: 4 }}>{preview.desc}</div>}
            </div>
          </div>
          <Alert type="info" showIcon style={{ marginBlockStart: 12 }}
            message={<span>Public URL: <code>/portal/events/{event.slug}</code></span>}
            description="Social scrapers (WhatsApp, Twitter, LinkedIn) read the meta tags rendered on that URL. If you don't see a preview, clear the scraper's cache (WhatsApp: forget chat; Twitter: Card Validator)." />
          <ShareToolkit slug={event.slug} eventName={event.name} />
        </Col>
      </Row>
    </div>
  );
}

// QR code + embed snippet for the public portal URL. Lives below the link-preview mock so the
// admin can pull a poster-ready QR or paste an iframe into a partner site without leaving Jamaat.
function ShareToolkit({ slug, eventName }: { slug: string; eventName: string }) {
  const { message } = AntdApp.useApp();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${origin}/portal/events/${slug}`;
  const embedSnippet = `<iframe src="${publicUrl}" width="100%" height="720" frameborder="0" loading="lazy" title="${eventName}"></iframe>`;

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text)
      .then(() => message.success(`${label} copied.`))
      .catch(() => message.error(`Couldn't copy ${label}.`));
  };

  // Pulls the SVG QR off the DOM and offers it as a downloadable PNG. AntD renders the QR as
  // a canvas by default, so we read the bitmap directly from the canvas element.
  const downloadQr = () => {
    const canvas = document.querySelector('#jm-share-qr canvas') as HTMLCanvasElement | null;
    if (!canvas) { message.error('QR not ready yet.'); return; }
    const link = document.createElement('a');
    link.download = `${slug}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Card size="small" title="Share toolkit" style={{ marginBlockStart: 12, border: '1px solid var(--jm-border)' }}>
      <Space direction="vertical" size={16} style={{ inlineSize: '100%' }}>
        {/* Public URL with copy button */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBlockEnd: 6 }}>Public URL</div>
          <Space.Compact style={{ inlineSize: '100%' }}>
            <Input readOnly value={publicUrl} style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
            <Button icon={<CopyOutlined />} onClick={() => copy(publicUrl, 'URL')}>Copy</Button>
          </Space.Compact>
        </div>

        {/* QR code + download */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBlockEnd: 6 }}>QR code</div>
          <Space align="start">
            <div id="jm-share-qr" style={{ padding: 8, background: '#FFF', border: '1px solid var(--jm-border)', borderRadius: 8 }}>
              <QRCode value={publicUrl} size={140} bordered={false} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', maxInlineSize: 220 }}>
                Print this on flyers, posters, or display screens. Anyone scanning lands on the public registration page.
              </div>
              <Space style={{ marginBlockStart: 8 }}>
                <Button size="small" icon={<DownloadOutlined />} onClick={downloadQr}>Download PNG</Button>
                <Button size="small" icon={<CopyOutlined />} onClick={() => copy(publicUrl, 'URL')}>Copy URL</Button>
              </Space>
            </div>
          </Space>
        </div>

        {/* Embed code */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBlockEnd: 6 }}>Embed code</div>
          <Input.TextArea readOnly value={embedSnippet} rows={3}
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockStart: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
              Paste this on a partner site to embed the registration page.
            </span>
            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(embedSnippet, 'Embed code')}>Copy</Button>
          </div>
        </div>
      </Space>
    </Card>
  );
}
