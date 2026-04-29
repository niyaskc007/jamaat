import { type ReactNode, useEffect, useState } from 'react';
import { Collapse, Tag, Space, Input, Button } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import type { PortalEventDetail, PageSection, GuestInput, AgeBand } from '../eventsApi';
import {
  type HeroContent, type TextContent, type AgendaContent, type SpeakersContent,
  type VenueContent, type GalleryContent, type FaqContent, type CtaContent, type RegistrationContent,
  type CountdownContent, type StatsContent, type SponsorsContent, type CustomHtmlContent,
  type SectionStyle,
  parseSection,
} from './types';
import { formatDate, formatDateTime } from '../../../shared/format/format';
import { portalApi, AgeBandLabel } from '../eventsApi';
import { App as AntdApp } from 'antd';

type RenderProps = {
  section: PageSection;
  event: PortalEventDetail;
  onRegistered?: () => void;
};

/**
 * Polymorphic renderer - reads a section's JSON content and delegates to the right template.
 * Used both in the admin designer (as a live preview) and on the public portal.
 */
export function SectionRenderer({ section, event, onRegistered }: RenderProps) {
  const parsed = parseSection(section);
  const style = (parsed.content as { style?: SectionStyle } | undefined)?.style;
  const inner = (() => {
    switch (parsed.type) {
      case 1: return <HeroRender content={parsed.content} event={event} />;
      case 2: return <TextRender content={parsed.content} />;
      case 3: return <AgendaRender content={parsed.content} event={event} />;
      case 4: return <SpeakersRender content={parsed.content} />;
      case 5: return <VenueRender content={parsed.content} event={event} />;
      case 6: return <GalleryRender content={parsed.content} />;
      case 7: return <FaqRender content={parsed.content} />;
      case 8: return <CtaRender content={parsed.content} />;
      case 9: return <RegistrationRender content={parsed.content} event={event} onRegistered={onRegistered} />;
      case 10: return <CountdownRender content={parsed.content} event={event} />;
      case 11: return <StatsRender content={parsed.content} />;
      case 12: return <SponsorsRender content={parsed.content} />;
      case 13: return <CustomHtmlRender content={parsed.content} />;
    }
  })();
  return <StyledShell style={style} id={parsed.type === 9 ? 'register' : undefined}>{inner}</StyledShell>;
}

/** Applies the common `style` envelope around each section. */
function StyledShell({ style, id, children }: { style?: SectionStyle; id?: string; children: ReactNode }) {
  const s = style ?? {};
  const bg = s.backgroundImageUrl
    ? `${s.overlay !== false ? 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)),' : ''} center/cover no-repeat url(${s.backgroundImageUrl})`
    : s.background;
  const wrapperStyle: React.CSSProperties = {
    paddingBlockStart: s.paddingTop ?? 0,
    paddingBlockEnd: s.paddingBottom ?? 20,
    background: bg,
    color: s.textColor,
  };
  const innerStyle: React.CSSProperties = s.maxWidth
    ? { maxInlineSize: s.maxWidth, marginInline: 'auto', paddingInline: 16 }
    : {};
  return (
    <section id={id} style={wrapperStyle}>
      <div style={innerStyle}>{children}</div>
    </section>
  );
}

// ---- Hero -----------------------------------------------------------------

function HeroRender({ content, event }: { content: HeroContent; event: PortalEventDetail }) {
  const bg = content.backgroundImageUrl
    ?? (content.useEventCover ? event.summary.coverImageUrl ?? undefined : undefined);
  const align = content.alignment ?? 'center';
  const overlayGradient = content.overlay !== false
    ? 'linear-gradient(180deg, rgba(0,0,0,0.20), rgba(0,0,0,0.55))'
    : '';
  const background = bg
    ? `${overlayGradient ? overlayGradient + ',' : ''} center/cover no-repeat url(${bg})`
    : `linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-accent) 100%)`;
  return (
    <>
      <div style={{
        borderRadius: 16, color: '#fff', padding: '72px 32px', minBlockSize: 340,
        display: 'flex', flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align,
        background,
      }}>
        {event.logoUrl && content.useEventCover && (
          <img src={event.logoUrl} alt="" style={{ blockSize: 48, marginBlockEnd: 20 }} />
        )}
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 54px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {content.heading || event.summary.name}
        </h1>
        {(content.subheading || event.summary.tagline) && (
          <p style={{ marginBlockStart: 12, fontSize: 'clamp(15px, 1.6vw, 19px)', opacity: 0.95, maxInlineSize: 680 }}>
            {content.subheading || event.summary.tagline}
          </p>
        )}
        <div style={{ marginBlockStart: 22, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 14, opacity: 0.9, justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
          <span><CalendarOutlined /> {formatDate(event.summary.eventDate)}{event.summary.eventDateHijri ? ` · ${event.summary.eventDateHijri}` : ''}</span>
          {event.summary.place && <span><EnvironmentOutlined /> {event.summary.place}</span>}
        </div>
        {content.ctaLabel && (
          <a
            onClick={(e) => {
              if (content.ctaTarget === 'register' || !content.ctaTarget) {
                e.preventDefault();
                document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            href={content.ctaTarget && content.ctaTarget !== 'register' ? content.ctaTarget : '#register'}
            style={{
              marginBlockStart: 28, display: 'inline-flex', alignItems: 'center', padding: '14px 28px',
              background: '#fff', color: 'var(--portal-primary)', fontWeight: 600, borderRadius: 10,
              textDecoration: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', cursor: 'pointer',
            }}
          >
            {content.ctaLabel} →
          </a>
        )}
      </div>
    </>
  );
}

// ---- Text -----------------------------------------------------------------

function TextRender({ content }: { content: TextContent }) {
  // TipTap stores HTML; legacy content may still be plain text w/ minimal markdown - detect and transform.
  const body = content.body ?? '';
  const html = looksLikeHtml(body) ? body : renderLite(body);
  return (
    <>
      <div className="portal-rich" style={{
        background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0',
        textAlign: content.alignment ?? 'left',
      }}>
        {content.heading && <h2 style={{ marginBlockStart: 0, fontSize: 24 }}>{content.heading}</h2>}
        <div style={{ color: 'var(--portal-text)', lineHeight: 1.65, fontSize: 15 }}
          dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <style>{`
        .portal-rich h2 { font-size: 22px; margin: 18px 0 8px; font-weight: 600; }
        .portal-rich h3 { font-size: 18px; margin: 16px 0 6px; font-weight: 600; }
        .portal-rich p { margin: 0 0 10px; }
        .portal-rich ul, .portal-rich ol { padding-inline-start: 24px; margin: 0 0 10px; }
        .portal-rich a { color: var(--portal-primary); text-decoration: underline; }
        .portal-rich blockquote { border-inline-start: 3px solid #E2E8F0; margin: 0 0 10px; padding-inline-start: 12px; color: #475569; }
      `}</style>
    </>
  );
}
function looksLikeHtml(s: string) { return /<\/?[a-z][\s\S]*?>/i.test(s); }

/** Minimal markdown fallback for legacy content or quick plain text. */
function renderLite(src: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const esc = escape(src);
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
}

// ---- Agenda ----------------------------------------------------------------

function AgendaRender({ content, event }: { content: AgendaContent; event: PortalEventDetail }) {
  const items = event.agenda ?? [];
  return (
    <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0' }}>
        <h2 style={{ marginBlockStart: 0, fontSize: 24 }}>{content.heading ?? 'Agenda'}</h2>
        {items.length === 0
          ? <div style={{ color: 'var(--portal-muted)' }}>Agenda will be posted soon.</div>
          : (
            <div style={{ display: 'grid', gap: 2 }}>
              {items.map((a) => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, padding: '14px 0', borderBlockStart: '1px solid #F1F5F9' }}>
                  {content.showTime !== false && (
                    <div className="jm-tnum" style={{ fontWeight: 600, color: 'var(--portal-primary)' }}>
                      {a.startTime ?? '-'}{a.endTime ? ` – ${a.endTime}` : ''}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{a.title}</div>
                    {content.showSpeaker !== false && a.speaker && (
                      <div style={{ fontSize: 13, color: 'var(--portal-muted)', marginBlockStart: 2 }}>{a.speaker}</div>
                    )}
                    {a.description && (
                      <div style={{ fontSize: 13, marginBlockStart: 6, color: 'var(--portal-text)' }}>{a.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </>
  );
}

// ---- Speakers --------------------------------------------------------------

function SpeakersRender({ content }: { content: SpeakersContent }) {
  const speakers = content.speakers ?? [];
  return (
    <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0' }}>
        <h2 style={{ marginBlockStart: 0, fontSize: 24 }}>{content.heading ?? 'Speakers'}</h2>
        {speakers.length === 0
          ? <div style={{ color: 'var(--portal-muted)' }}>Speakers to be announced.</div>
          : (
            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {speakers.map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: 16 }}>
                  {s.photoUrl
                    ? <img src={s.photoUrl} alt={s.name} style={{ inlineSize: 112, blockSize: 112, borderRadius: '50%', objectFit: 'cover', marginBlockEnd: 12 }} />
                    : <div style={{ inlineSize: 112, blockSize: 112, borderRadius: '50%', background: 'var(--portal-primary)', color: '#fff', margin: '0 auto 12px', display: 'grid', placeItems: 'center', fontSize: 38, fontWeight: 600 }}>{(s.name || '?')[0]?.toUpperCase()}</div>}
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  {s.title && <div style={{ fontSize: 12, color: 'var(--portal-muted)' }}>{s.title}</div>}
                  {s.bio && <div style={{ fontSize: 13, marginBlockStart: 8, color: 'var(--portal-text)' }}>{s.bio}</div>}
                </div>
              ))}
            </div>
          )}
      </div>
    </>
  );
}

// ---- Venue -----------------------------------------------------------------

function VenueRender({ content, event }: { content: VenueContent; event: PortalEventDetail }) {
  const address = content.addressOverride ?? event.venueAddress;
  const lat = event.venueLatitude;
  const lng = event.venueLongitude;
  return (
    <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0' }}>
        <h2 style={{ marginBlockStart: 0, fontSize: 24 }}>{content.heading ?? 'Venue'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: lat && lng && content.showMap !== false ? '1fr 1fr' : '1fr', gap: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{event.summary.place ?? 'Venue'}</div>
            {address && <div style={{ color: 'var(--portal-muted)', marginBlockStart: 4 }}>{address}</div>}
            {event.contactPhone && <div style={{ marginBlockStart: 14 }}><PhoneOutlined /> {event.contactPhone}</div>}
            {event.contactEmail && <div style={{ marginBlockStart: 4 }}><MailOutlined /> {event.contactEmail}</div>}
          </div>
          {lat && lng && content.showMap !== false && (
            <iframe title="Venue map" style={{ inlineSize: '100%', minBlockSize: 260, border: 0, borderRadius: 8 }}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.005}%2C${Number(lat) - 0.003}%2C${Number(lng) + 0.005}%2C${Number(lat) + 0.003}&layer=mapnik&marker=${lat}%2C${lng}`}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ---- Gallery ---------------------------------------------------------------

function GalleryRender({ content }: { content: GalleryContent }) {
  const images = content.images ?? [];
  return (
    <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0' }}>
        {content.heading && <h2 style={{ marginBlockStart: 0, fontSize: 24 }}>{content.heading}</h2>}
        {images.length === 0
          ? <div style={{ color: 'var(--portal-muted)' }}>No images yet.</div>
          : (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {images.map((img, i) => (
                <figure key={i} style={{ margin: 0 }}>
                  <img src={img.url} alt={img.caption ?? ''} style={{ inlineSize: '100%', blockSize: 180, objectFit: 'cover', borderRadius: 8 }} />
                  {img.caption && <figcaption style={{ fontSize: 12, color: 'var(--portal-muted)', marginBlockStart: 6 }}>{img.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
      </div>
    </>
  );
}

// ---- FAQ -------------------------------------------------------------------

function FaqRender({ content }: { content: FaqContent }) {
  const items = content.items ?? [];
  return (
    <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0' }}>
        <h2 style={{ marginBlockStart: 0, fontSize: 24 }}>{content.heading ?? 'FAQ'}</h2>
        <Collapse
          accordion ghost
          items={items.map((item, i) => ({
            key: `${i}`,
            label: <span style={{ fontWeight: 600 }}>{item.question}</span>,
            children: <div style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</div>,
          }))}
        />
      </div>
    </>
  );
}

// ---- CTA -------------------------------------------------------------------

function CtaRender({ content }: { content: CtaContent }) {
  const tone = content.tone ?? 'primary';
  const background = tone === 'dark'
    ? '#0F172A'
    : tone === 'accent'
      ? 'var(--portal-accent)'
      : 'var(--portal-primary)';
  return (
    <>
      <div style={{ background, color: '#fff', borderRadius: 16, padding: '56px 32px', textAlign: 'center' }}>
        <h2 style={{ marginBlockStart: 0, fontSize: 32, letterSpacing: '-0.01em' }}>{content.heading}</h2>
        {content.subheading && <p style={{ fontSize: 16, opacity: 0.9 }}>{content.subheading}</p>}
        <a
          onClick={(e) => {
            if (!content.buttonTarget || content.buttonTarget === 'register') {
              e.preventDefault();
              document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          href={content.buttonTarget && content.buttonTarget !== 'register' ? content.buttonTarget : '#register'}
          style={{
            marginBlockStart: 20, display: 'inline-flex', alignItems: 'center', padding: '14px 28px',
            background: '#fff', color: tone === 'dark' ? '#0F172A' : 'var(--portal-primary)', fontWeight: 600, borderRadius: 10,
            textDecoration: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.22)', cursor: 'pointer',
          }}
        >{content.buttonLabel}</a>
      </div>
    </>
  );
}

// ---- Registration ----------------------------------------------------------

function RegistrationRender({ content, event, onRegistered }: {
  content: RegistrationContent; event: PortalEventDetail; onRegistered?: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [its, setIts] = useState('');
  const [notes, setNotes] = useState('');
  const [guests, setGuests] = useState<GuestInput[]>([]);
  const [registered, setRegistered] = useState<{ code: string; status: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const addGuest = () => setGuests((p) => [...p, { name: '', ageBand: 3 }]);
  const updateGuest = (i: number, patch: Partial<GuestInput>) => setGuests((p) => p.map((g, j) => i === j ? { ...g, ...patch } : g));
  const removeGuest = (i: number) => setGuests((p) => p.filter((_, j) => j !== i));

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const r = await portalApi.register({
        eventId: event.summary.id,
        attendeeName: name,
        attendeeEmail: email || undefined,
        attendeePhone: phone || undefined,
        attendeeItsNumber: its || undefined,
        specialRequests: notes || undefined,
        guests: guests.filter((g) => g.name.trim()).length > 0 ? guests.filter((g) => g.name.trim()) : undefined,
      });
      setRegistered({ code: r.registrationCode, status: r.status });
      message.success('Registered.');
      onRegistered?.();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string; title?: string } } };
      message.error(err.response?.data?.detail ?? err.response?.data?.title ?? 'Registration failed');
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 420px)', gap: 32 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--portal-primary)', fontWeight: 700 }}>
              Reserve your seat
            </div>
            <h2 style={{ margin: '8px 0 12px', fontSize: 28 }}>{content.heading ?? 'Join us at this event'}</h2>
            <p style={{ color: 'var(--portal-muted)' }}>
              Fill in your details to get a confirmation code you can show at the entrance.
              {event.allowGuests && event.maxGuestsPerRegistration > 0 && ` You can bring up to ${event.maxGuestsPerRegistration} guest${event.maxGuestsPerRegistration === 1 ? '' : 's'}.`}
            </p>
            {event.summary.seatsRemaining != null && event.summary.registrationsOpenNow && (
              <Tag color={event.summary.seatsRemaining <= 10 ? 'volcano' : 'green'} style={{ marginBlockStart: 8 }}>
                {event.summary.seatsRemaining} seats remaining
              </Tag>
            )}
          </div>
          <div>
            {registered
              ? (
                <div style={{ background: 'var(--portal-primary)', color: '#fff', borderRadius: 12, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>Registered · code</div>
                  <div className="jm-tnum" style={{ fontSize: 32, fontWeight: 700, marginBlockStart: 6 }}>{registered.code}</div>
                  <div style={{ marginBlockStart: 6, opacity: 0.9 }}>
                    Status: {registered.status === 2 ? 'Confirmed' : registered.status === 1 ? 'Pending approval' : registered.status === 3 ? 'Waitlisted' : '-'}
                  </div>
                </div>
              )
              : !event.summary.registrationsOpenNow
                ? <div style={{ background: '#F1F5F9', borderRadius: 12, padding: 24, color: 'var(--portal-muted)', textAlign: 'center' }}>
                    Registrations are closed.
                  </div>
                : (
                  <Space direction="vertical" size={10} style={{ inlineSize: '100%' }}>
                    <Input size="large" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
                    {event.openToNonMembers
                      ? <Input placeholder="ITS number (if member)" value={its} onChange={(e) => setIts(e.target.value)} maxLength={8} />
                      : <Input placeholder="ITS number *" value={its} onChange={(e) => setIts(e.target.value)} maxLength={8} />}
                    <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <Input placeholder="Phone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <Input.TextArea placeholder="Special requests, dietary notes…" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    {event.allowGuests && content.showGuests !== false && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBlock: 8 }}>
                          Guests {event.maxGuestsPerRegistration > 0 && <span style={{ color: 'var(--portal-muted)', fontWeight: 400 }}>(up to {event.maxGuestsPerRegistration})</span>}
                        </div>
                        {guests.map((g, i) => (
                          <Space key={i} style={{ display: 'flex', marginBlockEnd: 6 }}>
                            <Input placeholder="Name" value={g.name} onChange={(e) => updateGuest(i, { name: e.target.value })} />
                            <select value={g.ageBand} onChange={(e) => updateGuest(i, { ageBand: Number(e.target.value) as AgeBand })} style={{ blockSize: 32, borderRadius: 6, border: '1px solid #D9D9D9', padding: '0 8px' }}>
                              {Object.entries(AgeBandLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <Button type="text" danger onClick={() => removeGuest(i)}>×</Button>
                          </Space>
                        ))}
                        {guests.length < event.maxGuestsPerRegistration && (
                          <Button size="small" onClick={addGuest}>+ Add guest</Button>
                        )}
                      </div>
                    )}
                    <Button type="primary" block size="large" loading={submitting}
                      disabled={!name.trim() || (!event.openToNonMembers && its.length !== 8)}
                      style={{ background: 'var(--portal-primary)', borderColor: 'var(--portal-primary)', marginBlockStart: 8 }}
                      onClick={submit}>
                      Register now
                    </Button>
                    {event.requiresApproval && (
                      <div style={{ fontSize: 12, color: 'var(--portal-muted)', textAlign: 'center' }}>
                        Your registration will be reviewed and confirmed by an admin.
                      </div>
                    )}
                  </Space>
                )
            }
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Countdown -------------------------------------------------------------

function CountdownRender({ content, event }: { content: CountdownContent; event: PortalEventDetail }) {
  const target = content.targetKind === 'custom' && content.customIsoDateTime
    ? new Date(content.customIsoDateTime)
    : event.summary.startsAtUtc
      ? new Date(event.summary.startsAtUtc)
      : new Date(event.summary.eventDate);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const diff = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  const expired = diff === 0;

  return (
    <>
      <div style={{ borderRadius: 16, padding: 32, textAlign: 'center',
        background: 'linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-accent) 100%)',
        color: '#fff' }}>
        {content.heading && <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.9 }}>{content.heading}</div>}
        {expired
          ? <div style={{ fontSize: 30, fontWeight: 700, marginBlockStart: 8 }}>{content.completedLabel ?? 'We have begun'}</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBlockStart: 14, maxInlineSize: 520, marginInline: 'auto' }}>
              <Cell n={days} l="days" />
              <Cell n={hours} l="hrs" />
              <Cell n={mins} l="min" />
              <Cell n={secs} l="sec" />
            </div>
          )}
      </div>
    </>
  );
}
function Cell({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div className="jm-tnum" style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1 }}>{String(n).padStart(2, '0')}</div>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.9, marginBlockStart: 4 }}>{l}</div>
    </div>
  );
}

// ---- Stats -----------------------------------------------------------------

function StatsRender({ content }: { content: StatsContent }) {
  const items = content.items ?? [];
  return (
    <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0' }}>
        {content.heading && <h2 style={{ marginBlockStart: 0, fontSize: 22, textAlign: 'center' }}>{content.heading}</h2>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, gap: 20, marginBlockStart: items.length ? 16 : 0 }}>
          {items.map((it, i) => (
            <div key={i} style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 700, color: 'var(--portal-primary)', lineHeight: 1 }}>{it.value}</div>
              <div style={{ fontSize: 13, color: 'var(--portal-muted)', marginBlockStart: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---- Sponsors --------------------------------------------------------------

function SponsorsRender({ content }: { content: SponsorsContent }) {
  const sponsors = content.sponsors ?? [];
  return (
    <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #E2E8F0' }}>
        {content.heading && <h2 style={{ marginBlockStart: 0, fontSize: 22, textAlign: 'center' }}>{content.heading}</h2>}
        {sponsors.length === 0
          ? <div style={{ color: 'var(--portal-muted)', textAlign: 'center' }}>Sponsors appear here.</div>
          : (
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginBlockStart: 20 }}>
              {sponsors.map((s, i) => {
                const img = s.logoUrl
                  ? <img src={s.logoUrl} alt={s.name} style={{ blockSize: 52, maxInlineSize: 180, objectFit: 'contain', filter: 'grayscale(1)', opacity: 0.75, transition: 'all 200ms' }}
                      onMouseEnter={(e) => { e.currentTarget.style.filter = 'grayscale(0)'; e.currentTarget.style.opacity = '1'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.filter = 'grayscale(1)'; e.currentTarget.style.opacity = '0.75'; }} />
                  : <div style={{ blockSize: 52, display: 'grid', placeItems: 'center', padding: '0 16px', background: '#F1F5F9', borderRadius: 6, color: 'var(--portal-muted)', fontWeight: 500 }}>{s.name}</div>;
                return s.href
                  ? <a key={i} href={s.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{img}</a>
                  : <span key={i}>{img}</span>;
              })}
            </div>
          )}
      </div>
    </>
  );
}

// ---- Custom HTML -----------------------------------------------------------

function CustomHtmlRender({ content }: { content: CustomHtmlContent }) {
  // Admins own this content; we deliberately allow raw HTML. Don't expose this to untrusted authors.
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: content.html ?? '' }} />
    </>
  );
}

export function renderDateTime(s?: string | null) { return s ? formatDateTime(s) : '-'; }
