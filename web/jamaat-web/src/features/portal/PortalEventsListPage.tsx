import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { portalApi, EventCategoryLabel } from '../events/eventsApi';
import { formatDate } from '../../shared/format/format';
import { PortalLayout } from './PortalLayout';
import { Empty, Spin, Tag } from 'antd';

export function PortalEventsListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-events'],
    queryFn: () => portalApi.listUpcoming(50),
  });

  return (
    <PortalLayout>
      <div style={{ marginBlockEnd: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Upcoming events</h1>
        <p style={{ color: 'var(--portal-muted)', marginBlockStart: 4 }}>
          Browse and register for events organised by the Jamaat.
        </p>
      </div>

      {isLoading && <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Empty description="No upcoming events right now. Check back soon." />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {(data ?? []).map((e) => (
          <Link key={e.id} to={`/portal/events/${e.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <article style={{
              background: '#FFFFFF',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid #E2E8F0',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(el) => { el.currentTarget.style.boxShadow = '0 10px 30px rgba(15, 23, 42, 0.08)'; el.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(el) => { el.currentTarget.style.boxShadow = ''; el.currentTarget.style.transform = ''; }}>
              <div style={{
                blockSize: 140,
                background: e.coverImageUrl
                  ? `center/cover no-repeat url(${e.coverImageUrl})`
                  : `linear-gradient(135deg, ${e.primaryColor ?? '#0E5C40'} 0%, ${e.accentColor ?? '#B45309'} 100%)`,
                display: 'flex', alignItems: 'flex-end', padding: 12, color: '#fff',
              }}>
                <Tag color="rgba(255,255,255,0.25)" style={{ color: '#fff', border: 'none' }}>{e.categoryName ?? EventCategoryLabel[e.category] ?? `Category ${e.category}`}</Tag>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--portal-text)' }}>{e.name}</div>
                {e.tagline && <div style={{ fontSize: 13, color: 'var(--portal-muted)', marginBlockStart: 2 }}>{e.tagline}</div>}
                <div style={{ marginBlockStart: 10, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-muted)' }}>
                  <span>📅 {formatDate(e.eventDate)}</span>
                  {e.place && <span>📍 {e.place}</span>}
                </div>
                <div style={{ marginBlockStart: 12 }}>
                  {e.registrationsOpenNow
                    ? <Tag color="green" style={{ margin: 0 }}>Registrations open</Tag>
                    : <Tag style={{ margin: 0 }}>Registrations closed</Tag>}
                  {e.seatsRemaining != null && e.registrationsOpenNow && (
                    <Tag color={e.seatsRemaining <= 10 ? 'volcano' : 'default'} style={{ marginInlineStart: 6 }}>
                      {e.seatsRemaining} seats left
                    </Tag>
                  )}
                </div>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </PortalLayout>
  );
}
