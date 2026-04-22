import { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Drawer, Space, Tag, Alert, Modal, App as AntdApp, Popover, Row, Col, Switch, Typography, Dropdown,
} from 'antd';
import {
  PlusOutlined, DragOutlined, EyeOutlined, EyeInvisibleOutlined, EditOutlined, DeleteOutlined,
  ArrowUpOutlined, ArrowDownOutlined, LayoutOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pageDesignerApi, portalApi, type PageSection, type PortalEventDetail } from '../eventsApi';
import {
  type EventPageSectionType, type SectionContent,
  EventPageSectionTypeLabel, EventPageSectionTypeDescription, EventPageSectionTypeIcon,
  parseSection, stringifyContent,
} from './types';
import { SectionEditor } from './SectionEditor';
import { SectionRenderer } from './SectionRenderer';
import { extractProblem } from '../../../shared/api/client';

type Props = {
  eventId: string;
  eventSlug: string;
  primaryColor?: string | null;
  accentColor?: string | null;
};

/**
 * Full page designer — left rail lists sections with drag/up-down ordering + visibility toggle + edit/delete;
 * main canvas shows a live preview using the same renderers the public portal uses.
 */
export function PageDesigner({ eventId, eventSlug, primaryColor, accentColor }: Props) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['event-sections', eventId],
    queryFn: () => pageDesignerApi.list(eventId),
  });

  // A read-only snapshot of the full portal detail drives the preview so sections can
  // use real data (agenda, venue, cover image) as they will in production.
  const { data: preview } = useQuery({
    queryKey: ['portal-preview', eventSlug],
    queryFn: () => portalApi.getBySlug(eventSlug),
    enabled: !!eventSlug,
  });

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editing, setEditing] = useState<PageSection | null>(null);

  const addMut = useMutation({
    mutationFn: (type: EventPageSectionType) => pageDesignerApi.add(eventId, { type, contentJson: null, sortOrder: null }),
    onSuccess: (s) => {
      message.success('Section added.');
      setPaletteOpen(false);
      void qc.invalidateQueries({ queryKey: ['event-sections', eventId] });
      void qc.invalidateQueries({ queryKey: ['portal-preview', eventSlug] });
      setEditing(s);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to add section'),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => pageDesignerApi.remove(eventId, id),
    onSuccess: () => {
      message.success('Section removed.');
      void qc.invalidateQueries({ queryKey: ['event-sections', eventId] });
      void qc.invalidateQueries({ queryKey: ['portal-preview', eventSlug] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to remove'),
  });
  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => pageDesignerApi.reorder(eventId, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event-sections', eventId] });
      void qc.invalidateQueries({ queryKey: ['portal-preview', eventSlug] });
    },
  });
  const toggleMut = useMutation({
    mutationFn: ({ s, visible }: { s: PageSection; visible: boolean }) =>
      pageDesignerApi.update(eventId, s.id, { contentJson: s.contentJson, isVisible: visible }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event-sections', eventId] });
      void qc.invalidateQueries({ queryKey: ['portal-preview', eventSlug] });
    },
  });

  const move = (index: number, delta: number) => {
    const newIds = sections.map((s) => s.id);
    const j = index + delta;
    if (j < 0 || j >= newIds.length) return;
    [newIds[index], newIds[j]] = [newIds[j], newIds[index]];
    reorderMut.mutate(newIds);
  };

  // HTML5 drag reordering (no extra deps).
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const onDragStart = (i: number) => setDragIdx(i);
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) return setDragIdx(null);
    const newIds = sections.map((s) => s.id);
    const [moved] = newIds.splice(dragIdx, 1);
    newIds.splice(i, 0, moved);
    setDragIdx(null);
    reorderMut.mutate(newIds);
  };

  return (
    <div style={{ padding: 16 }}>
      <Alert
        type="info" showIcon
        style={{ marginBlockEnd: 16 }}
        message={
          <span>
            Compose your event's public page by stacking sections. Drag to reorder, toggle visibility,
            or click Edit to tweak content. Preview updates live on the right — visit{' '}
            <a href={`/portal/events/${eventSlug}`} target="_blank" rel="noreferrer">/portal/events/{eventSlug}</a>{' '}
            to see the published page.
          </span>
        }
      />
      <Row gutter={16}>
        {/* Section list */}
        <Col xs={24} md={10} xl={8}>
          <Card size="small" title={<Space><DragOutlined /> Sections</Space>}
            extra={
              <Space>
                <PresetMenu eventId={eventId} eventSlug={eventSlug} hasExistingSections={sections.length > 0} />
                <Popover placement="leftTop" trigger="click" open={paletteOpen} onOpenChange={setPaletteOpen}
                  content={<SectionPalette onPick={(t) => addMut.mutate(t)} />}>
                  <Button type="primary" icon={<PlusOutlined />} loading={addMut.isPending}>Add section</Button>
                </Popover>
              </Space>
            }
            style={{ border: '1px solid var(--jm-border)' }}>
            {isLoading && <div style={{ color: 'var(--jm-gray-500)' }}>Loading…</div>}
            {!isLoading && sections.length === 0 && (
              <div style={{ color: 'var(--jm-gray-500)', textAlign: 'center', padding: '40px 0' }}>
                No sections yet. The portal will fall back to the default layout.
                <br />
                <Button type="primary" style={{ marginBlockStart: 12 }} onClick={() => setPaletteOpen(true)}>Add your first section</Button>
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {sections.map((s, i) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(i)}
                  style={{
                    border: '1px solid var(--jm-border)', borderRadius: 8, padding: 10,
                    background: dragIdx === i ? '#F8FAFC' : '#FFF',
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'grab',
                    opacity: s.isVisible ? 1 : 0.55,
                  }}
                >
                  <DragOutlined style={{ color: 'var(--jm-gray-400)' }} />
                  <div style={{ fontSize: 22 }}>{EventPageSectionTypeIcon[s.type]}</div>
                  <div style={{ flex: 1, minInlineSize: 0 }}>
                    <div style={{ fontWeight: 500 }}>{EventPageSectionTypeLabel[s.type]}</div>
                    <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>
                      {summaryFor(s)}
                    </div>
                  </div>
                  <Space size={2}>
                    <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                    <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === sections.length - 1} onClick={() => move(i, +1)} />
                    <Button size="small" type="text" icon={s.isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                      onClick={() => toggleMut.mutate({ s, visible: !s.isVisible })} />
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(s)} />
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}
                      onClick={() => Modal.confirm({ title: 'Remove section?', onOk: () => removeMut.mutateAsync(s.id) })} />
                  </Space>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* Live preview */}
        <Col xs={24} md={14} xl={16}>
          <Card size="small" title={<Space><EyeOutlined /> Live preview</Space>}
            style={{ border: '1px solid var(--jm-border)' }}>
            <div
              style={{
                ['--portal-primary' as string]: primaryColor || '#0E5C40',
                ['--portal-accent' as string]: accentColor || '#B45309',
                ['--portal-text' as string]: '#0F172A',
                ['--portal-muted' as string]: '#64748B',
                background: '#F8FAFC', borderRadius: 8, padding: 12, maxBlockSize: '70dvh', overflow: 'auto',
              } as React.CSSProperties}
            >
              {preview && sections.length > 0
                ? sections.map((s) => (
                    <div key={s.id} style={{ opacity: s.isVisible ? 1 : 0.4 }}>
                      <SectionRenderer section={s} event={previewAugmented(preview, sections)} />
                    </div>
                  ))
                : <Typography.Text type="secondary">Add sections to preview your page.</Typography.Text>
              }
            </div>
          </Card>
        </Col>
      </Row>

      {editing && (
        <EditSectionDrawer
          key={editing.id}
          eventId={eventId} eventSlug={eventSlug} section={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function previewAugmented(preview: PortalEventDetail, sections: PageSection[]): PortalEventDetail {
  return { ...preview, sections, hasCustomPage: sections.length > 0 };
}

function summaryFor(s: PageSection): string {
  const p = parseSection(s);
  switch (p.type) {
    case 1: return `Heading: ${p.content.heading || '(untitled)'}`;
    case 2: return p.content.heading ?? '(text block)';
    case 3: return 'Agenda from event';
    case 4: return `${(p.content.speakers ?? []).length} speaker(s)`;
    case 5: return p.content.heading ?? 'Venue';
    case 6: return `${(p.content.images ?? []).length} image(s)`;
    case 7: return `${(p.content.items ?? []).length} question(s)`;
    case 8: return p.content.heading || '(CTA)';
    case 9: return 'Registration form';
    case 10: return p.content.heading ?? 'Countdown';
    case 11: return `${(p.content.items ?? []).length} stat(s)`;
    case 12: return `${(p.content.sponsors ?? []).length} sponsor(s)`;
    case 13: return 'Custom HTML';
  }
}

function SectionPalette({ onPick }: { onPick: (t: EventPageSectionType) => void }) {
  const types: EventPageSectionType[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div style={{ inlineSize: 320, display: 'grid', gap: 6 }}>
      {types.map((t) => (
        <button
          key={t}
          onClick={() => onPick(t)}
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: '#FFF', border: '1px solid var(--jm-border)', borderRadius: 8,
            padding: 10, cursor: 'pointer', textAlign: 'start',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFF')}
        >
          <div style={{ fontSize: 22 }}>{EventPageSectionTypeIcon[t]}</div>
          <div>
            <div style={{ fontWeight: 500 }}>{EventPageSectionTypeLabel[t]}</div>
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{EventPageSectionTypeDescription[t]}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function EditSectionDrawer({ eventId, eventSlug, section, onClose }: {
  eventId: string; eventSlug: string; section: PageSection; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const parsed = useMemo(() => parseSection(section), [section]);

  const [content, setContent] = useState<SectionContent['content']>(parsed.content as SectionContent['content']);
  const [visible, setVisible] = useState(section.isVisible);

  // If the drawer opens on a different section, reset local state.
  useEffect(() => { setContent(parseSection(section).content as SectionContent['content']); setVisible(section.isVisible); }, [section]);

  const saveMut = useMutation({
    mutationFn: () => pageDesignerApi.update(eventId, section.id, {
      contentJson: stringifyContent(content), isVisible: visible,
    }),
    onSuccess: () => {
      message.success('Section saved.');
      void qc.invalidateQueries({ queryKey: ['event-sections', eventId] });
      void qc.invalidateQueries({ queryKey: ['portal-preview', eventSlug] });
      onClose();
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed'),
  });

  return (
    <Drawer open width={560} onClose={onClose} destroyOnHidden
      title={<Space><span style={{ fontSize: 22 }}>{EventPageSectionTypeIcon[section.type]}</span> {EventPageSectionTypeLabel[section.type]}</Space>}
      extra={<Space><Switch checked={visible} onChange={setVisible} checkedChildren={<EyeOutlined />} unCheckedChildren={<EyeInvisibleOutlined />} /></Space>}
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'space-between' }}>
          <Tag color={visible ? 'green' : 'default'}>{visible ? 'Visible' : 'Hidden'}</Tag>
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>Save section</Button>
          </Space>
        </Space>
      }>
      <SectionEditor type={section.type} value={content} onChange={(v) => setContent(v as SectionContent['content'])} />
    </Drawer>
  );
}

function PresetMenu({ eventId, eventSlug, hasExistingSections }: { eventId: string; eventSlug: string; hasExistingSections: boolean }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { data: presets = [] } = useQuery({
    queryKey: ['event-presets', eventId],
    queryFn: () => pageDesignerApi.listPresets(eventId),
  });

  const applyMut = useMutation({
    mutationFn: ({ key, replace }: { key: string; replace: boolean }) => pageDesignerApi.applyPreset(eventId, key, replace),
    onSuccess: (rows) => {
      message.success(`Applied preset — ${rows.length} section${rows.length === 1 ? '' : 's'} created.`);
      void qc.invalidateQueries({ queryKey: ['event-sections', eventId] });
      void qc.invalidateQueries({ queryKey: ['portal-preview', eventSlug] });
    },
    onError: (e) => {
      const err = e as { response?: { data?: { detail?: string; title?: string } } };
      message.error(err.response?.data?.detail ?? err.response?.data?.title ?? 'Failed to apply preset');
    },
  });

  const onPick = (key: string) => {
    if (!hasExistingSections) { applyMut.mutate({ key, replace: false }); return; }
    modal.confirm({
      title: 'Apply preset',
      content: 'This page already has sections. Do you want to REPLACE them, or APPEND the preset to what\'s there?',
      okText: 'Replace',
      okButtonProps: { danger: true },
      cancelText: 'Append',
      onOk: () => applyMut.mutateAsync({ key, replace: true }),
      onCancel: () => applyMut.mutate({ key, replace: false }),
    });
  };

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: presets.map((p) => ({
          key: p.key,
          label: (
            <div style={{ minInlineSize: 280 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{p.description}</div>
              <div style={{ fontSize: 11, color: 'var(--jm-gray-400)', marginBlockStart: 2 }}>{p.sectionCount} sections</div>
            </div>
          ),
          onClick: () => onPick(p.key),
        })),
      }}
    >
      <Button icon={<LayoutOutlined />} loading={applyMut.isPending}>Apply preset</Button>
    </Dropdown>
  );
}
