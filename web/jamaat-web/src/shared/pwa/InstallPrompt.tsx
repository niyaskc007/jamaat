import { useEffect, useState } from 'react';
import { Card, Button, Space, Typography } from 'antd';
import { DownloadOutlined, CloseOutlined, ShareAltOutlined } from '@ant-design/icons';

/// Install-to-home-screen prompt for the member portal. Two flows:
///
///  1. Android Chrome / Edge / Samsung Internet: the browser fires
///     `beforeinstallprompt`; we capture it and show a one-tap Install card.
///  2. iOS Safari: no event fires, the user must tap Share -> Add to Home Screen
///     manually. We detect iOS Safari (running outside standalone mode) and
///     surface a small instructions card pointing at the Share button.
///
/// Both flows are dismissible and persist the dismissal in localStorage so the
/// prompt doesn't re-appear on every portal visit. Operator pages never mount
/// this component.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() =>
    localStorage.getItem('jamaat.pwa.dismissed') === '1'
  );

  useEffect(() => {
    if (dismissed) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);

    // iOS Safari fallback: detect iOS, NOT-running-as-standalone, NOT-already-installed.
    // The standalone media query catches the case where the user already added to home screen.
    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(/Android/.test(ua));
    const inStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS-specific legacy property:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    if (isIos && !inStandalone) setShowIosTip(true);

    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, [dismissed]);

  if (dismissed) return null;
  if (!deferred && !showIosTip) return null;

  const onInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === 'dismissed') {
      localStorage.setItem('jamaat.pwa.dismissed', '1');
      setDismissed(true);
    }
  };

  const onDismiss = () => {
    localStorage.setItem('jamaat.pwa.dismissed', '1');
    setDismissed(true);
    setDeferred(null);
    setShowIosTip(false);
  };

  return (
    <Card
      size="small"
      style={{
        position: 'fixed', insetBlockEnd: 16, insetInlineEnd: 16, zIndex: 1000,
        maxInlineSize: 360, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <Space align="start" style={{ inlineSize: '100%' }}>
        <DownloadOutlined style={{ fontSize: 18, color: 'var(--jm-primary-500)' }} />
        <div style={{ flex: 1 }}>
          <Typography.Text strong>Install Jamaat as an app</Typography.Text>
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
            {deferred
              ? 'Adds an icon to your home screen and lets the portal open like a native app.'
              : (
                <>
                  In Safari, tap <ShareAltOutlined style={{ marginInline: 2 }} /> Share, then
                  &quot;Add to Home Screen&quot; to install Jamaat as an app.
                </>
              )}
          </div>
          <Space style={{ marginBlockStart: 8 }}>
            {deferred && <Button type="primary" size="small" onClick={onInstall}>Install</Button>}
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onDismiss}>
              {deferred ? 'Not now' : 'Got it'}
            </Button>
          </Space>
        </div>
      </Space>
    </Card>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
