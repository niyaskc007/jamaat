import { Form, Input, InputNumber, Switch, Select, Space, Button, Divider, Typography, Collapse, DatePicker } from 'antd';
import { PlusOutlined, DeleteOutlined, BgColorsOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type {
  HeroContent, TextContent, AgendaContent, SpeakersContent, Speaker,
  VenueContent, GalleryContent, GalleryImage, FaqContent, FaqItem,
  CtaContent, RegistrationContent,
  CountdownContent, StatsContent, StatItem, SponsorsContent, SponsorItem, CustomHtmlContent,
  SectionStyle,
  EventPageSectionType,
} from './types';
import { RichTextEditor } from './RichTextEditor';
import { ImageUploadField } from '../../../shared/ui/ImageUploadField';
import { ColorOrGradientPicker } from '../../../shared/ui/ColorOrGradientPicker';
import { CtaTargetPicker } from './CtaTargetPicker';
import { eventsApi } from '../eventsApi';

/**
 * Renders the per-type editor form given a parsed content object. Callers pass a
 * value + onChange pair (like a controlled input). `eventId` and `eventSlug` are
 * threaded down so child editors can upload assets to the right event and offer
 * sensible CTA targets (e.g. the event's own portal-register URL).
 */
export function SectionEditor({ type, value, onChange, eventId, eventSlug }: {
  type: EventPageSectionType;
  value: unknown;
  onChange: (next: unknown) => void;
  eventId: string;
  eventSlug?: string;
}) {
  const content = (value ?? {}) as Record<string, unknown> & { style?: SectionStyle };
  const update = (patch: Record<string, unknown>) => onChange({ ...content, ...patch });
  const updateStyle = (style: SectionStyle | undefined) => onChange({ ...content, style });
  const upload = (file: File) => eventsApi.uploadAsset(eventId, file).then((r) => r.url);

  const inner = (() => {
    switch (type) {
      case 1: return <HeroEditor value={content as HeroContent} onChange={(v) => update(v)} upload={upload} eventSlug={eventSlug} />;
      case 2: return <TextEditor value={content as TextContent} onChange={(v) => update(v)} />;
      case 3: return <AgendaEditor value={content as AgendaContent} onChange={(v) => update(v)} />;
      case 4: return <SpeakersEditor value={content as SpeakersContent} onChange={(v) => update(v)} upload={upload} />;
      case 5: return <VenueEditor value={content as VenueContent} onChange={(v) => update(v)} />;
      case 6: return <GalleryEditor value={content as GalleryContent} onChange={(v) => update(v)} upload={upload} />;
      case 7: return <FaqEditor value={content as FaqContent} onChange={(v) => update(v)} />;
      case 8: return <CtaEditor value={content as CtaContent} onChange={(v) => update(v)} eventSlug={eventSlug} />;
      case 9: return <RegistrationEditor value={content as RegistrationContent} onChange={(v) => update(v)} />;
      case 10: return <CountdownEditor value={content as CountdownContent} onChange={(v) => update(v)} />;
      case 11: return <StatsEditor value={content as StatsContent} onChange={(v) => update(v)} />;
      case 12: return <SponsorsEditor value={content as SponsorsContent} onChange={(v) => update(v)} upload={upload} />;
      case 13: return <CustomHtmlEditor value={content as CustomHtmlContent} onChange={(v) => update(v)} />;
    }
  })();

  return (
    <>
      {inner}
      <Divider />
      <Collapse ghost items={[{
        key: 'style',
        label: <span><BgColorsOutlined /> Style (padding, background, colors)</span>,
        children: <StyleEditor value={content.style} onChange={updateStyle} upload={upload} />,
      }]} />
    </>
  );
}

function StyleEditor({ value, onChange, upload }: { value?: SectionStyle; onChange: (v?: SectionStyle) => void; upload: (file: File) => Promise<string> }) {
  const v = value ?? ({} as SectionStyle);
  const patch = (p: Partial<SectionStyle>) => onChange({ ...v, ...p });
  return (
    <Form layout="vertical" requiredMark={false}>
      <Space wrap style={{ display: 'flex' }}>
        <Form.Item label="Padding top (px)"><InputNumber min={0} max={300} value={v.paddingTop ?? 0} onChange={(n) => patch({ paddingTop: (n ?? undefined) as number | undefined })} /></Form.Item>
        <Form.Item label="Padding bottom (px)"><InputNumber min={0} max={300} value={v.paddingBottom ?? 20} onChange={(n) => patch({ paddingBottom: (n ?? undefined) as number | undefined })} /></Form.Item>
        <Form.Item label="Max content width (px)"><InputNumber min={400} max={1600} step={40} value={v.maxWidth ?? undefined} onChange={(n) => patch({ maxWidth: (n ?? undefined) as number | undefined })} placeholder="Full width" /></Form.Item>
      </Space>
      <Form.Item label="Background colour or gradient" help="Used when no background image is set. Pick from the swatch or build a gradient.">
        <ColorOrGradientPicker value={v.background} onChange={(b) => patch({ background: b ?? undefined })} mode="full" />
      </Form.Item>
      <Form.Item label="Background image">
        <ImageUploadField value={v.backgroundImageUrl}
          onChange={(url) => patch({ backgroundImageUrl: url ?? undefined })}
          upload={upload} previewHeight={120} />
      </Form.Item>
      <Space>
        <Switch checked={v.overlay !== false} onChange={(c) => patch({ overlay: c })} /> Darken background image
      </Space>
      <Form.Item label="Text colour" style={{ marginBlockStart: 12 }}>
        <ColorOrGradientPicker value={v.textColor} onChange={(c) => patch({ textColor: c ?? undefined })} mode="solid" />
      </Form.Item>
      <Button size="small" onClick={() => onChange(undefined)}>Reset style</Button>
    </Form>
  );
}

function HeroEditor({ value, onChange, upload, eventSlug }: {
  value: HeroContent;
  onChange: (v: HeroContent) => void;
  upload: (file: File) => Promise<string>;
  eventSlug?: string;
}) {
  const v = value ?? ({} as HeroContent);
  const useCover = v.useEventCover ?? true;
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading" required>
        <Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} />
      </Form.Item>
      <Form.Item label="Subtitle">
        <Input value={v.subheading ?? ''} onChange={(e) => onChange({ ...v, subheading: e.target.value })} />
      </Form.Item>

      <Form.Item label="Background source" help="Use the event's cover image, upload a custom image, or pick a colour / gradient.">
        <Switch checked={useCover}
          onChange={(c) => onChange({ ...v, useEventCover: c })}
          checkedChildren="Use event cover" unCheckedChildren="Custom" />
      </Form.Item>

      {!useCover && (
        <>
          <Form.Item label="Custom background image">
            <ImageUploadField value={v.backgroundImageUrl}
              onChange={(url) => onChange({ ...v, backgroundImageUrl: url ?? undefined })}
              upload={upload} previewHeight={140} />
          </Form.Item>
          {!v.backgroundImageUrl && (
            <Form.Item label="Background colour or gradient" help="Shown when no image is selected.">
              <ColorOrGradientPicker value={v.backgroundColor}
                onChange={(c) => onChange({ ...v, backgroundColor: c ?? undefined })}
                mode="full" />
            </Form.Item>
          )}
        </>
      )}

      <Form.Item>
        <Space>
          <Switch checked={v.overlay !== false} onChange={(c) => onChange({ ...v, overlay: c })} />
          <span>Darken background image (improves text contrast)</span>
        </Space>
      </Form.Item>

      <Form.Item label="Alignment">
        <Select value={v.alignment ?? 'center'} onChange={(a) => onChange({ ...v, alignment: a as HeroContent['alignment'] })}
          options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
      </Form.Item>
      <Form.Item label="CTA button label">
        <Input value={v.ctaLabel ?? ''} onChange={(e) => onChange({ ...v, ctaLabel: e.target.value })} placeholder="e.g., Register now" />
      </Form.Item>
      <Form.Item label="CTA target">
        <CtaTargetPicker value={v.ctaTarget ?? 'register'}
          onChange={(t) => onChange({ ...v, ctaTarget: t as HeroContent['ctaTarget'] })}
          eventSlug={eventSlug} includeRegister />
      </Form.Item>
    </Form>
  );
}

function TextEditor({ value, onChange }: { value: TextContent; onChange: (v: TextContent) => void }) {
  const v = value ?? ({ body: '' } as TextContent);
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading (optional)"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} /></Form.Item>
      <Form.Item label="Body" required help="Rich text - use the toolbar or type Markdown inline.">
        <RichTextEditor value={v.body ?? ''} onChange={(md) => onChange({ ...v, body: md })} />
      </Form.Item>
      <Form.Item label="Alignment">
        <Select value={v.alignment ?? 'left'} onChange={(a) => onChange({ ...v, alignment: a as TextContent['alignment'] })}
          options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }]} />
      </Form.Item>
    </Form>
  );
}

function AgendaEditor({ value, onChange }: { value: AgendaContent; onChange: (v: AgendaContent) => void }) {
  const v = value ?? ({} as AgendaContent);
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="Agenda" /></Form.Item>
      <Space wrap>
        <Space><Switch checked={v.showTime !== false} onChange={(c) => onChange({ ...v, showTime: c })} /> Show time</Space>
        <Space><Switch checked={v.showSpeaker !== false} onChange={(c) => onChange({ ...v, showSpeaker: c })} /> Show speaker</Space>
      </Space>
      <Typography.Text type="secondary" style={{ display: 'block', marginBlockStart: 12 }}>
        Items come from the Agenda tab on this event. Add/edit them there - this section simply displays them.
      </Typography.Text>
    </Form>
  );
}

function SpeakersEditor({ value, onChange, upload }: {
  value: SpeakersContent; onChange: (v: SpeakersContent) => void;
  upload: (file: File) => Promise<string>;
}) {
  const v = value ?? ({ speakers: [] } as SpeakersContent);
  const update = (i: number, patch: Partial<Speaker>) =>
    onChange({ ...v, speakers: (v.speakers ?? []).map((s, j) => i === j ? { ...s, ...patch } : s) });
  const add = () => onChange({ ...v, speakers: [...(v.speakers ?? []), { name: '' }] });
  const remove = (i: number) => onChange({ ...v, speakers: (v.speakers ?? []).filter((_, j) => j !== i) });
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="Speakers" /></Form.Item>
      <div style={{ display: 'grid', gap: 12 }}>
        {(v.speakers ?? []).map((s, i) => (
          <div key={i} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
            <Space style={{ inlineSize: '100%', marginBlockEnd: 8 }}>
              <Input placeholder="Name" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
              <Input placeholder="Title" value={s.title ?? ''} onChange={(e) => update(i, { title: e.target.value })} />
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
            </Space>
            <Form.Item label="Photo" style={{ marginBlockEnd: 8 }}>
              <ImageUploadField value={s.photoUrl}
                onChange={(url) => update(i, { photoUrl: url ?? undefined })}
                upload={upload} previewHeight={96} />
            </Form.Item>
            <Input.TextArea placeholder="Short bio (optional)" rows={2} value={s.bio ?? ''} onChange={(e) => update(i, { bio: e.target.value })} />
          </div>
        ))}
      </div>
      <Button icon={<PlusOutlined />} onClick={add} style={{ marginBlockStart: 12 }}>Add speaker</Button>
    </Form>
  );
}

function VenueEditor({ value, onChange }: { value: VenueContent; onChange: (v: VenueContent) => void }) {
  const v = value ?? ({} as VenueContent);
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="Venue" /></Form.Item>
      <Form.Item label="Override address" help="Leave blank to use the event's venue address."><Input value={v.addressOverride ?? ''} onChange={(e) => onChange({ ...v, addressOverride: e.target.value })} /></Form.Item>
      <Space><Switch checked={v.showMap !== false} onChange={(c) => onChange({ ...v, showMap: c })} /> Show embedded map</Space>
      <Typography.Text type="secondary" style={{ display: 'block', marginBlockStart: 8 }}>
        The map uses the event's Latitude / Longitude - set those under the Overview tab.
      </Typography.Text>
    </Form>
  );
}

function GalleryEditor({ value, onChange, upload }: {
  value: GalleryContent; onChange: (v: GalleryContent) => void;
  upload: (file: File) => Promise<string>;
}) {
  const v = value ?? ({ images: [] } as GalleryContent);
  const update = (i: number, patch: Partial<GalleryImage>) =>
    onChange({ ...v, images: (v.images ?? []).map((img, j) => i === j ? { ...img, ...patch } : img) });
  const add = () => onChange({ ...v, images: [...(v.images ?? []), { url: '' }] });
  const remove = (i: number) => onChange({ ...v, images: (v.images ?? []).filter((_, j) => j !== i) });
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="Gallery" /></Form.Item>
      <div style={{ display: 'grid', gap: 12 }}>
        {(v.images ?? []).map((img, i) => (
          <div key={i} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
            <ImageUploadField value={img.url}
              onChange={(url) => update(i, { url: url ?? '' })}
              upload={upload} previewHeight={120} />
            <Space style={{ display: 'flex', marginBlockStart: 8 }}>
              <Input placeholder="Caption (optional)" value={img.caption ?? ''} onChange={(e) => update(i, { caption: e.target.value })} />
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
            </Space>
          </div>
        ))}
      </div>
      <Button icon={<PlusOutlined />} onClick={add} style={{ marginBlockStart: 12 }}>Add image</Button>
    </Form>
  );
}

function FaqEditor({ value, onChange }: { value: FaqContent; onChange: (v: FaqContent) => void }) {
  const v = value ?? ({ items: [] } as FaqContent);
  const update = (i: number, patch: Partial<FaqItem>) =>
    onChange({ ...v, items: (v.items ?? []).map((f, j) => i === j ? { ...f, ...patch } : f) });
  const add = () => onChange({ ...v, items: [...(v.items ?? []), { question: '', answer: '' }] });
  const remove = (i: number) => onChange({ ...v, items: (v.items ?? []).filter((_, j) => j !== i) });
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="FAQ" /></Form.Item>
      <div style={{ display: 'grid', gap: 12 }}>
        {(v.items ?? []).map((f, i) => (
          <div key={i} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
            <Space style={{ inlineSize: '100%', justifyContent: 'space-between' }}>
              <Input placeholder="Question" value={f.question} onChange={(e) => update(i, { question: e.target.value })} style={{ inlineSize: '100%' }} />
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
            </Space>
            <Input.TextArea placeholder="Answer" rows={3} style={{ marginBlockStart: 8 }} value={f.answer} onChange={(e) => update(i, { answer: e.target.value })} />
          </div>
        ))}
      </div>
      <Button icon={<PlusOutlined />} onClick={add} style={{ marginBlockStart: 12 }}>Add item</Button>
    </Form>
  );
}

function CtaEditor({ value, onChange, eventSlug }: { value: CtaContent; onChange: (v: CtaContent) => void; eventSlug?: string }) {
  const v = value ?? ({ heading: '', buttonLabel: 'Register' } as CtaContent);
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading" required><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} /></Form.Item>
      <Form.Item label="Sub-heading"><Input value={v.subheading ?? ''} onChange={(e) => onChange({ ...v, subheading: e.target.value })} /></Form.Item>
      <Form.Item label="Button label" required><Input value={v.buttonLabel ?? ''} onChange={(e) => onChange({ ...v, buttonLabel: e.target.value })} /></Form.Item>
      <Form.Item label="Button target">
        <CtaTargetPicker value={v.buttonTarget ?? 'register'}
          onChange={(t) => onChange({ ...v, buttonTarget: t as CtaContent['buttonTarget'] })}
          eventSlug={eventSlug} includeRegister />
      </Form.Item>
      <Form.Item label="Tone">
        <Select value={v.tone ?? 'primary'} onChange={(t) => onChange({ ...v, tone: t as CtaContent['tone'] })}
          options={[{ value: 'primary', label: 'Primary (event colour)' }, { value: 'accent', label: 'Accent' }, { value: 'dark', label: 'Dark' }]} />
      </Form.Item>
    </Form>
  );
}

function RegistrationEditor({ value, onChange }: { value: RegistrationContent; onChange: (v: RegistrationContent) => void }) {
  const v = value ?? ({} as RegistrationContent);
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="Reserve your seat" /></Form.Item>
      <Space><Switch checked={v.showGuests !== false} onChange={(c) => onChange({ ...v, showGuests: c })} /> Allow adding guests</Space>
      <Divider />
      <Typography.Text type="secondary">
        Capacity, guest rules, approval requirement and the open/close window are configured under the Registration tab.
      </Typography.Text>
    </Form>
  );
}

function CountdownEditor({ value, onChange }: { value: CountdownContent; onChange: (v: CountdownContent) => void }) {
  const v = value ?? ({} as CountdownContent);
  const kind = v.targetKind ?? 'eventStart';
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="Event starts in" /></Form.Item>
      <Form.Item label="Target">
        <Select value={kind} onChange={(k) => onChange({ ...v, targetKind: k as CountdownContent['targetKind'] })}
          options={[
            { value: 'eventStart', label: 'Event start time (from Overview)' },
            { value: 'custom', label: 'Custom date/time' },
          ]} />
      </Form.Item>
      {kind === 'custom' && (
        <Form.Item label="Countdown target">
          <DatePicker showTime value={v.customIsoDateTime ? dayjs(v.customIsoDateTime) : null}
            onChange={(d) => onChange({ ...v, customIsoDateTime: d?.toISOString() })} style={{ inlineSize: '100%' }} />
        </Form.Item>
      )}
      <Form.Item label="Completed label" help="Shown once the countdown hits zero."><Input value={v.completedLabel ?? ''} onChange={(e) => onChange({ ...v, completedLabel: e.target.value })} /></Form.Item>
    </Form>
  );
}

function StatsEditor({ value, onChange }: { value: StatsContent; onChange: (v: StatsContent) => void }) {
  const v = value ?? ({ items: [] } as StatsContent);
  const update = (i: number, patch: Partial<StatItem>) =>
    onChange({ ...v, items: (v.items ?? []).map((s, j) => i === j ? { ...s, ...patch } : s) });
  const add = () => onChange({ ...v, items: [...(v.items ?? []), { value: '', label: '' }] });
  const remove = (i: number) => onChange({ ...v, items: (v.items ?? []).filter((_, j) => j !== i) });
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="At a glance" /></Form.Item>
      <div style={{ display: 'grid', gap: 10 }}>
        {(v.items ?? []).map((s, i) => (
          <Space key={i} style={{ display: 'flex' }}>
            <Input placeholder="Value (e.g., 500+)" value={s.value} onChange={(e) => update(i, { value: e.target.value })} />
            <Input placeholder="Label (e.g., Attendees)" value={s.label} onChange={(e) => update(i, { label: e.target.value })} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </Space>
        ))}
      </div>
      <Button icon={<PlusOutlined />} onClick={add} style={{ marginBlockStart: 12 }}>Add stat</Button>
    </Form>
  );
}

function SponsorsEditor({ value, onChange, upload }: {
  value: SponsorsContent; onChange: (v: SponsorsContent) => void;
  upload: (file: File) => Promise<string>;
}) {
  const v = value ?? ({ sponsors: [] } as SponsorsContent);
  const update = (i: number, patch: Partial<SponsorItem>) =>
    onChange({ ...v, sponsors: (v.sponsors ?? []).map((s, j) => i === j ? { ...s, ...patch } : s) });
  const add = () => onChange({ ...v, sponsors: [...(v.sponsors ?? []), { name: '' }] });
  const remove = (i: number) => onChange({ ...v, sponsors: (v.sponsors ?? []).filter((_, j) => j !== i) });
  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Heading"><Input value={v.heading ?? ''} onChange={(e) => onChange({ ...v, heading: e.target.value })} placeholder="With thanks to" /></Form.Item>
      <div style={{ display: 'grid', gap: 12 }}>
        {(v.sponsors ?? []).map((s, i) => (
          <div key={i} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
            <Space style={{ inlineSize: '100%', marginBlockEnd: 8 }}>
              <Input placeholder="Sponsor name" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
            </Space>
            <Form.Item label="Logo" style={{ marginBlockEnd: 8 }}>
              <ImageUploadField value={s.logoUrl}
                onChange={(url) => update(i, { logoUrl: url ?? undefined })}
                upload={upload} previewHeight={80} />
            </Form.Item>
            <Form.Item label="Link target" style={{ marginBlockEnd: 0 }}>
              <CtaTargetPicker value={s.href}
                onChange={(t) => update(i, { href: t || undefined })}
                includeRegister={false} />
            </Form.Item>
          </div>
        ))}
      </div>
      <Button icon={<PlusOutlined />} onClick={add} style={{ marginBlockStart: 12 }}>Add sponsor</Button>
    </Form>
  );
}

function CustomHtmlEditor({ value, onChange }: { value: CustomHtmlContent; onChange: (v: CustomHtmlContent) => void }) {
  const v = value ?? ({ html: '' } as CustomHtmlContent);
  return (
    <Form layout="vertical" requiredMark={false}>
      <Typography.Text type="warning" style={{ display: 'block', marginBlockEnd: 8 }}>
        Raw HTML renders as-is. Anyone with page-designer permission can inject arbitrary markup - review carefully.
      </Typography.Text>
      <Form.Item label="HTML">
        <Input.TextArea autoSize={{ minRows: 10, maxRows: 30 }} style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
          value={v.html ?? ''} onChange={(e) => onChange({ ...v, html: e.target.value })} />
      </Form.Item>
    </Form>
  );
}
