import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Spin, Result, Button, Tag, Input, Select, Space, Alert, App as AntdApp } from 'antd';
import { PortalLayout } from './PortalLayout';
import { portalApi, AgeBandLabel, type AgeBand, type GuestInput, type EventRegistration } from '../events/eventsApi';
import { extractProblem } from '../../shared/api/client';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { SectionRenderer } from '../events/sections/SectionRenderer';
import { Helmet } from 'react-helmet-async';

export function PortalEventPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['portal-event', slug],
    queryFn: () => portalApi.getBySlug(slug),
    enabled: !!slug,
  });

  if (isLoading) return <PortalLayout><div style={{ textAlign: 'center', padding: 80 }}><Spin /></div></PortalLayout>;
  if (!data) return <PortalLayout><Result status="404" title="Event not found" subTitle="The event you're looking for doesn't exist or has been hidden." /></PortalLayout>;

  const e = data.summary;

  // Build browser + social-scraper metadata from the share fields (falling back to the event's own fields).
  const metaTitle = data.shareTitle || e.name;
  const metaDesc = data.shareDescription || e.tagline || (data.description ? stripHtml(data.description).slice(0, 160) : undefined);
  const metaImage = data.shareImageUrl || e.coverImageUrl || undefined;
  const canonical = typeof window !== 'undefined' ? `${window.location.origin}/portal/events/${e.slug}` : undefined;

  const head = (
    <Helmet>
      <title>{metaTitle}</title>
      {metaDesc && <meta name="description" content={metaDesc} />}
      {canonical && <link rel="canonical" href={canonical} />}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={metaTitle} />
      {metaDesc && <meta property="og:description" content={metaDesc} />}
      {metaImage && <meta property="og:image" content={metaImage} />}
      {canonical && <meta property="og:url" content={canonical} />}
      <meta name="twitter:card" content={metaImage ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={metaTitle} />
      {metaDesc && <meta name="twitter:description" content={metaDesc} />}
      {metaImage && <meta name="twitter:image" content={metaImage} />}
    </Helmet>
  );

  // If an admin has composed a custom page (any visible sections), render those instead of the default layout.
  if (data.hasCustomPage && data.sections.length > 0) {
    return (
      <PortalLayout primary={e.primaryColor} accent={e.accentColor}>
        {head}
        {data.sections.map((s) => (
          <SectionRenderer key={s.id} section={s} event={data} onRegistered={() => void refetch()} />
        ))}
      </PortalLayout>
    );
  }

  return (
    <PortalLayout primary={e.primaryColor} accent={e.accentColor}>
      {head}
      {/* Hero */}
      <section style={{
        borderRadius: 16,
        background: e.coverImageUrl
          ? `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55)), center/cover no-repeat url(${e.coverImageUrl})`
          : `linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-accent) 100%)`,
        color: '#fff', padding: '48px 32px', marginBlockEnd: 24,
      }}>
        {data.logoUrl && <img src={data.logoUrl} alt="" style={{ blockSize: 48, marginBlockEnd: 16 }} />}
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>
          {formatDate(e.eventDate)}{e.eventDateHijri ? ` · ${e.eventDateHijri}` : ''}
        </div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 40, fontWeight: 700 }}>{e.name}</h1>
        {e.tagline && <div style={{ fontSize: 18, opacity: 0.95 }}>{e.tagline}</div>}
        <div style={{ marginBlockStart: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
          {e.place && <span>📍 {e.place}</span>}
          {e.startsAtUtc && <span>🕐 {formatDateTime(e.startsAtUtc)}</span>}
          {e.seatsRemaining != null && e.registrationsOpenNow && <span>🎟 {e.seatsRemaining} seats remaining</span>}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: 24 }}>
        {/* Main content */}
        <div>
          {data.description && (
            <section style={{ background: 'var(--portal-surface)', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0', marginBlockEnd: 16 }}>
              <h2 style={{ marginBlockStart: 0, fontSize: 20 }}>About</h2>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--portal-text)' }}>{data.description}</div>
            </section>
          )}

          {data.agenda.length > 0 && (
            <section style={{ background: 'var(--portal-surface)', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0', marginBlockEnd: 16 }}>
              <h2 style={{ marginBlockStart: 0, fontSize: 20 }}>Agenda</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.agenda.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBlockStart: '1px solid #F1F5F9' }}>
                    <div style={{ minInlineSize: 100, fontWeight: 600, color: 'var(--portal-primary)' }} className="jm-tnum">
                      {a.startTime ?? '-'}{a.endTime ? ` – ${a.endTime}` : ''}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      {a.speaker && <div style={{ fontSize: 13, color: 'var(--portal-muted)' }}>{a.speaker}</div>}
                      {a.description && <div style={{ fontSize: 13, marginBlockStart: 4 }}>{a.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.venueAddress && (
            <section style={{ background: 'var(--portal-surface)', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0' }}>
              <h2 style={{ marginBlockStart: 0, fontSize: 20 }}>Venue</h2>
              <div><strong>{e.place}</strong></div>
              <div style={{ color: 'var(--portal-muted)' }}>{data.venueAddress}</div>
              {(data.contactPhone || data.contactEmail) && (
                <div style={{ marginBlockStart: 8, fontSize: 13 }}>
                  Contact: {data.contactPhone ?? ''} {data.contactEmail ? `· ${data.contactEmail}` : ''}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Registration sidebar */}
        <aside>
          <RegistrationCard event={data} onRegistered={() => void refetch()} />
        </aside>
      </div>
    </PortalLayout>
  );
}

function RegistrationCard({ event, onRegistered }: { event: Awaited<ReturnType<typeof portalApi.getBySlug>>; onRegistered: () => void }) {
  const { message } = AntdApp.useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [its, setIts] = useState('');
  const [notes, setNotes] = useState('');
  const [guests, setGuests] = useState<GuestInput[]>([]);
  const [registration, setRegistration] = useState<EventRegistration | null>(null);

  const addGuest = () => setGuests((p) => [...p, { name: '', ageBand: 3 }]);
  const updateGuest = (i: number, patch: Partial<GuestInput>) => setGuests((p) => p.map((g, j) => i === j ? { ...g, ...patch } : g));
  const removeGuest = (i: number) => setGuests((p) => p.filter((_, j) => j !== i));

  const mut = useMutation({
    mutationFn: () => portalApi.register({
      eventId: event.summary.id,
      attendeeName: name,
      attendeeEmail: email || undefined,
      attendeePhone: phone || undefined,
      attendeeItsNumber: its || undefined,
      specialRequests: notes || undefined,
      guests: guests.filter((g) => g.name.trim()).length > 0 ? guests.filter((g) => g.name.trim()) : undefined,
    }),
    onSuccess: (r) => {
      setRegistration(r);
      message.success(`Registration confirmed: ${r.registrationCode}`);
      onRegistered();
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Registration failed'),
  });

  if (registration) {
    return (
      <section style={{ background: 'var(--portal-surface)', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, position: 'sticky', insetBlockStart: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--portal-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Registered</div>
        <h2 style={{ fontSize: 24, margin: '8px 0' }}>You're in! 🎉</h2>
        <div style={{ background: 'var(--portal-primary)', color: '#fff', borderRadius: 8, padding: 16, textAlign: 'center', marginBlockStart: 16 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>Registration code</div>
          <div className="jm-tnum" style={{ fontSize: 28, fontWeight: 700, marginBlockStart: 4 }}>{registration.registrationCode}</div>
        </div>
        <Alert
          type="info" showIcon style={{ marginBlockStart: 12 }}
          message={<>Status: <Tag>{registration.status === 2 ? 'Confirmed' : registration.status === 1 ? 'Pending approval' : registration.status === 3 ? 'Waitlisted' : '-'}</Tag></>}
          description="Show this code at the entrance, or give your ITS number at the door." />
        <Button block type="link" style={{ marginBlockStart: 12 }} onClick={() => { setRegistration(null); setName(''); setEmail(''); setPhone(''); setIts(''); setNotes(''); setGuests([]); }}>
          Register someone else
        </Button>
      </section>
    );
  }

  if (!event.summary.registrationsOpenNow) {
    return (
      <section style={{ background: 'var(--portal-surface)', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, position: 'sticky', insetBlockStart: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Registrations closed</h2>
        <p style={{ color: 'var(--portal-muted)' }}>This event is not currently accepting new registrations.</p>
      </section>
    );
  }

  return (
    <section style={{ background: 'var(--portal-surface)', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, position: 'sticky', insetBlockStart: 20 }}>
      <h2 style={{ marginBlockStart: 0, fontSize: 20 }}>Reserve your seat</h2>
      <Space direction="vertical" size={10} style={{ inlineSize: '100%' }}>
        <Input size="large" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
        {event.openToNonMembers
          ? <Input placeholder="ITS number (if member)" value={its} onChange={(e) => setIts(e.target.value)} maxLength={8} />
          : <Input placeholder="ITS number *" value={its} onChange={(e) => setIts(e.target.value)} maxLength={8} />}
        <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="Phone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input.TextArea placeholder="Special requests, dietary notes…" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

        {event.allowGuests && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBlock: 8 }}>
              Guests {event.maxGuestsPerRegistration > 0 && <span style={{ color: 'var(--portal-muted)', fontWeight: 400 }}>(up to {event.maxGuestsPerRegistration})</span>}
            </div>
            {guests.map((g, i) => (
              <Space key={i} style={{ display: 'flex', marginBlockEnd: 6 }}>
                <Input placeholder="Name" value={g.name} onChange={(e) => updateGuest(i, { name: e.target.value })} />
                <Select value={g.ageBand} style={{ inlineSize: 110 }} onChange={(v) => updateGuest(i, { ageBand: v as AgeBand })}
                  options={Object.entries(AgeBandLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
                <Button type="text" danger onClick={() => removeGuest(i)}>×</Button>
              </Space>
            ))}
            {guests.length < event.maxGuestsPerRegistration && (
              <Button size="small" onClick={addGuest}>+ Add guest</Button>
            )}
          </div>
        )}

        <Button type="primary" block size="large" loading={mut.isPending}
          disabled={!name.trim() || (!event.openToNonMembers && its.length !== 8)}
          style={{ background: 'var(--portal-primary)', borderColor: 'var(--portal-primary)', marginBlockStart: 8 }}
          onClick={() => mut.mutate()}>
          Register now
        </Button>
        {event.requiresApproval && (
          <div style={{ fontSize: 12, color: 'var(--portal-muted)', textAlign: 'center' }}>
            Your registration will be reviewed and confirmed by an admin.
          </div>
        )}
      </Space>
    </section>
  );
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
