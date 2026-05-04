import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Spin, Typography, Result } from 'antd';
import { Logo } from '../../shared/ui/Logo';
import { cmsApi, type CmsPage } from './cmsApi';

/// Public-facing CMS page renderer for /legal/{slug} and /help/{slug}. No auth required;
/// uses a minimal chrome (logo + back-to-login link) so legal pages are reachable from the
/// login footer.
export function CmsPageView() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CmsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError(null);
    cmsApi.getPageBySlug(slug)
      .then((p) => { if (!cancelled) setPage(p); })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        setError(status === 404 ? 'not-found' : 'error');
      });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div style={{ minBlockSize: '100dvh', background: '#FAFAFA', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBlockEnd: '1px solid #E5E7EB', background: '#FFFFFF' }}>
        <Logo size={28} />
        <Link to="/login" style={{ color: '#0B6E63', fontWeight: 500 }}>Back to login</Link>
      </header>
      <main style={{ flex: 1, padding: '32px 24px', display: 'flex', justifyContent: 'center' }}>
        <article style={{ maxInlineSize: 760, inlineSize: '100%' }}>
          {error === 'not-found' && (
            <Result status="404" title="Page not found" subTitle={`No CMS page exists with slug "${slug}".`} />
          )}
          {error === 'error' && (
            <Result status="error" title="Could not load page" subTitle="Please try again later." />
          )}
          {!error && !page && <Spin />}
          {page && (
            <>
              <Typography.Title level={1} style={{ marginBlockEnd: 24 }}>{page.title}</Typography.Title>
              <div className="jm-cms-body">
                <ReactMarkdown>{page.body}</ReactMarkdown>
              </div>
              {page.updatedAtUtc && (
                <Typography.Paragraph type="secondary" style={{ marginBlockStart: 32, fontSize: 12 }}>
                  Last updated {new Date(page.updatedAtUtc).toLocaleDateString()}
                </Typography.Paragraph>
              )}
            </>
          )}
        </article>
      </main>
      <footer style={{ padding: '16px 32px', borderBlockStart: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280' }}>
        <span>© {new Date().getFullYear()} Jamaat · A product of Ubrixy Technologies</span>
        <span style={{ display: 'flex', gap: 12 }}>
          <Link to="/legal/terms" style={{ color: '#6B7280' }}>Terms</Link>
          <Link to="/legal/privacy" style={{ color: '#6B7280' }}>Privacy</Link>
          <Link to="/help/faq" style={{ color: '#6B7280' }}>FAQ</Link>
        </span>
      </footer>
      <style>{`
        .jm-cms-body h2 { font-size: 22px; font-weight: 600; margin-block: 24px 12px; }
        .jm-cms-body h3 { font-size: 18px; font-weight: 600; margin-block: 18px 8px; }
        .jm-cms-body p  { font-size: 15px; line-height: 1.65; color: #374151; }
        .jm-cms-body ul { padding-inline-start: 24px; }
        .jm-cms-body li { margin-block-end: 6px; }
        .jm-cms-body code { background: #F3F4F6; padding: 1px 6px; border-radius: 4px; font-size: 13px; }
        .jm-cms-body a    { color: #0B6E63; }
      `}</style>
    </div>
  );
}
