import type { ReactNode } from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

type Props = {
  /// Module icon (already tinted/coloured by caller — we just wrap it).
  icon: ReactNode;
  /// Short headline, e.g. "No commitments yet".
  title: string;
  /// One or two sentences explaining what the module does and when to use it.
  description: ReactNode;
  /// Primary CTA — usually "New X". Hide it (pass undefined) when the user
  /// lacks the create permission so we don't dangle a button they can't use.
  primaryAction?: { label: string; onClick: () => void };
  /// Optional secondary CTA (e.g. "Import from Excel").
  secondaryAction?: { label: string; onClick: () => void };
  /// Deep-link into the help page anchor for this module.
  helpHref?: string;
};

/// First-run card shown by list pages when there are zero rows *and* no active filters.
/// Keeps the tone consistent across modules — the pages themselves decide whether
/// to render this or a "No matches for your filter" variant.
export function ModuleEmptyState({ icon, title, description, primaryAction, secondaryAction, helpHref }: Props) {
  return (
    <Card
      styles={{
        body: {
          padding: '48px 24px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, var(--jm-surface-muted, #F8FAFC) 0%, #FFFFFF 100%)',
        },
      }}
      style={{ border: '1px dashed var(--jm-border-strong, #CBD5E1)' }}
    >
      <div
        style={{
          inlineSize: 64,
          blockSize: 64,
          borderRadius: 16,
          marginInline: 'auto',
          marginBlockEnd: 16,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(11,110,99,0.08)',
          color: 'var(--jm-primary-500, #0B6E63)',
          fontSize: 28,
        }}
      >
        {icon}
      </div>
      <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>{title}</Typography.Title>
      <Typography.Paragraph
        type="secondary"
        style={{ maxInlineSize: 520, marginInline: 'auto', marginBlockStart: 8, marginBlockEnd: 20, fontSize: 14 }}
      >
        {description}
      </Typography.Paragraph>
      <Space wrap>
        {primaryAction && (
          <Button type="primary" size="middle" onClick={primaryAction.onClick}>{primaryAction.label}</Button>
        )}
        {secondaryAction && (
          <Button size="middle" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
        )}
        {helpHref && (
          <Link to={helpHref}>
            <Button type="link" icon={<QuestionCircleOutlined />}>How does this module work?</Button>
          </Link>
        )}
      </Space>
    </Card>
  );
}
