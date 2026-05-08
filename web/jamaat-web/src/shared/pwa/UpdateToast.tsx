import { useEffect, useState } from 'react';
import { Card, Button, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { applyServiceWorkerUpdate, onSwNeedRefresh } from './registerSw';

/// Surfaces a "new version available" toast when the SW reports needRefresh.
/// SW registration itself happens in main.tsx (so install criteria are met on
/// app boot, not after portal navigation); this component just listens.
export function UpdateToast() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => onSwNeedRefresh(() => setNeedRefresh(true)), []);

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
            <Button type="primary" size="small" onClick={() => applyServiceWorkerUpdate()}>Reload now</Button>
            <Button type="text" size="small" onClick={() => setNeedRefresh(false)}>Later</Button>
          </Space>
        </div>
      </Space>
    </Card>
  );
}
