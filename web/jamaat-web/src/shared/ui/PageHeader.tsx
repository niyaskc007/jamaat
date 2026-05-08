import type { ReactNode } from 'react';
import { Typography } from 'antd';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

/// Page header used across operator + member portal pages. Title + optional
/// subtitle on the left, actions on the right. On phones the actions drop
/// below the title so a long greeting like "Good evening, Administrator" no
/// longer fights the buttons for horizontal space (which used to force the
/// title into a 5-character column that wrapped per-character).
///
/// Layout lives in app.css (`.jm-page-header*`) per RULES.md §10 - this
/// component is JSX-only.
export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="jm-page-header">
      <div className="jm-page-header-titles">
        <Typography.Title level={2} className="jm-page-header-title">
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Paragraph type="secondary" className="jm-page-header-subtitle">
            {subtitle}
          </Typography.Paragraph>
        )}
      </div>
      {actions && <div className="jm-page-header-extra">{actions}</div>}
    </div>
  );
}
