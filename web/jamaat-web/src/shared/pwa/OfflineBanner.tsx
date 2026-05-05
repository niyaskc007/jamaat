import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { WifiOutlined } from '@ant-design/icons';

/// Surfaces a small banner at the top of the portal when navigator.onLine flips to
/// false. The service worker keeps recent /api/v1/portal/me/* responses cached so the
/// member can still see their data offline; the banner just makes it explicit that
/// what they're looking at is stale. No banner = network is fine; we don't add chrome
/// for the happy path.
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <Alert
      type="warning"
      showIcon
      icon={<WifiOutlined />}
      message="You're offline"
      description="Showing your last-fetched data. Changes you make won't save until you reconnect."
      banner
      style={{ position: 'sticky', insetBlockStart: 0, zIndex: 100 }}
    />
  );
}
