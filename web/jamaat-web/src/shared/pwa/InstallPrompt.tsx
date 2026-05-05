import { useEffect, useState } from 'react';
import { Card, Button, Space, Typography } from 'antd';
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons';

/// First-visit install prompt for the member portal. Listens for the browser's
/// `beforeinstallprompt` event, captures it, and surfaces a small dismissible card so
/// members on Android Chrome / Edge can add the portal to their home screen with one tap.
/// Persisted dismissal in localStorage prevents the prompt from re-appearing on every
/// portal visit. iOS Safari does not fire `beforeinstallprompt`; the manifest still works
/// for "Add to Home Screen" via the Share menu, just no UI hint from us. Operator pages
/// never mount this component.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() =>
    localStorage.getItem('jamaat.pwa.dismissed') === '1'
  );

  useEffect(() => {
    if (dismissed) return;
    const handler = (e: Event) => {
      // The browser fires this once it deems the page installable. Calling preventDefault
      // captures the prompt so we can replay it from our own button.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, [dismissed]);

  if (dismissed || !deferred) return null;

  const onInstall = async () => {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === 'dismissed') {
      // User said "no thanks" - remember it so we don't pester next visit.
      localStorage.setItem('jamaat.pwa.dismissed', '1');
      setDismissed(true);
    }
  };

  const onDismiss = () => {
    localStorage.setItem('jamaat.pwa.dismissed', '1');
    setDismissed(true);
    setDeferred(null);
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
            Adds an icon to your home screen and lets the portal open like a native app.
          </div>
          <Space style={{ marginBlockStart: 8 }}>
            <Button type="primary" size="small" onClick={onInstall}>Install</Button>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onDismiss}>Not now</Button>
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
