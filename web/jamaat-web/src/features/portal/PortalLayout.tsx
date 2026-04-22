import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Stand-alone layout for the public Event Portal: no app sidebar, no logged-in chrome.
 * Event-specific branding is applied per-page via inline CSS custom properties on a wrapper.
 */
export function PortalLayout({ children, primary, accent }: {
  children: ReactNode;
  primary?: string | null;
  accent?: string | null;
}) {
  const style = {
    ['--portal-primary' as string]: primary || '#0E5C40',
    ['--portal-accent' as string]: accent || '#B45309',
    ['--portal-surface' as string]: '#FFFFFF',
    ['--portal-text' as string]: '#0F172A',
    ['--portal-muted' as string]: '#64748B',
  } as React.CSSProperties;

  return (
    <div style={{ ...style, minBlockSize: '100dvh', background: '#F8FAFC', color: 'var(--portal-text)' }}>
      <header style={{
        background: 'var(--portal-surface)',
        borderBlockEnd: '1px solid #E2E8F0',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/portal/events" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600, fontSize: 16 }}>
          Jamaat · Events
        </Link>
        <Link to="/login" style={{ textDecoration: 'none', color: 'var(--portal-muted)', fontSize: 13 }}>
          Admin login →
        </Link>
      </header>
      <main style={{ maxInlineSize: 1100, marginInline: 'auto', padding: '24px 16px' }}>
        {children}
      </main>
      <footer style={{ textAlign: 'center', color: 'var(--portal-muted)', fontSize: 12, padding: '24px 16px' }}>
        © {new Date().getFullYear()} Jamaat · Powered by the community platform
      </footer>
    </div>
  );
}
