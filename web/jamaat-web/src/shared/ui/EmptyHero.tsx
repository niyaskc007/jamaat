import type { ReactNode } from 'react';
import { Card, Tag, Typography, Button } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';

type Props = {
  milestone: string; // e.g. "M1", "M2"
  icon: ReactNode;
  title: string;
  description: string;
  features: string[];
  primaryAction?: { label: string; onClick: () => void };
};

/**
 * Welcoming placeholder page used while a module is on the roadmap.
 * Not a shrug — it communicates what's coming and why.
 */
export function EmptyHero({ milestone, icon, title, description, features, primaryAction }: Props) {
  return (
    <Card
      styles={{ body: { padding: 40 } }}
      style={{ boxShadow: 'var(--jm-shadow-1)', border: '1px solid var(--jm-border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--jm-primary-50)',
            color: 'var(--jm-primary-500)',
            fontSize: 32,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <Tag color="gold" style={{ marginBlockEnd: 12, fontWeight: 600, border: 'none', padding: '2px 10px' }}>
            {milestone} · Coming soon
          </Tag>
          <Typography.Title level={3} style={{ margin: 0, fontSize: 22 }}>
            {title}
          </Typography.Title>
          <Typography.Paragraph style={{ margin: '8px 0 20px', color: 'var(--jm-gray-600)', fontSize: 14, maxWidth: 620 }}>
            {description}
          </Typography.Paragraph>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {features.map((f) => (
              <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--jm-gray-700)' }}>
                <CheckCircleFilled style={{ color: 'var(--jm-primary-400)', marginBlockStart: 3, flexShrink: 0 }} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {primaryAction && (
            <Button type="primary" style={{ marginBlockStart: 24 }} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
