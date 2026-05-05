import { useEffect, useState } from 'react';
import { Card, Button, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/// Surfaces a "new version available" toast when vite-plugin-pwa's registerSW reports
/// `needRefresh`. Distinct from the autoUpdate flow we used to have: that one would
/// just reload silently, which can lose unsaved profile-form state. With prompt mode
/// the user opts in.
///
/// Mounted globally (in MemberPortalLayout); does nothing until the SW reports
/// needRefresh. Operators don't see it - they pick up updates on next page reload
/// because the operator AppLayout doesn't mount this component.
export function UpdateToast() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [reload, setReload] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Dynamically import so dev mode (no SW build) doesn't hard-fail.
    import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          setNeedRefresh(true);
        },
        // onOfflineReady: the SW finished pre-caching. We could surface this too but
        // the OfflineBanner already covers offline-state; an extra toast on every
        // first-load is just noise.
      });
      // The result is a function that triggers the actual update + reload when called.
      setReload(() => () => update(true));
    }).catch(() => {
      // dev mode without SW build, or older browsers - silently ignore.
    });
    return () => { cancelled = true; };
  }, []);

  if (!needRefresh) return null;

  return (
    <Card
      size="small"
      style={{
        position: 'fixed', insetBlockEnd: 16, insetInlineStart: 16, zIndex: 1001,
        maxInlineSize: 360, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <Space align="start">
        <ReloadOutlined style={{ fontSize: 18, color: 'var(--jm-primary-500)' }} />
        <div style={{ flex: 1 }}>
          <Typography.Text strong>A new version is ready</Typography.Text>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
            Reload to get the latest portal updates.
          </div>
          <Space style={{ marginBlockStart: 8 }}>
            <Button type="primary" size="small" onClick={() => reload?.()}>Reload now</Button>
            <Button type="text" size="small" onClick={() => setNeedRefresh(false)}>Later</Button>
          </Space>
        </div>
      </Space>
    </Card>
  );
}
