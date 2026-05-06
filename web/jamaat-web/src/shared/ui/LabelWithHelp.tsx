import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

/// Form label with a tooltip-icon affordance. Used across the operator and member-portal
/// long-form inputs (QH application, commitment submit, profile editor) to surface helper
/// text without crowding the visible label. Single shared implementation per RULES.md §15.
export function LabelWithHelp({ children, help }: { children: ReactNode; help: string }) {
  return (
    <span className="jm-label-with-help">
      {children}
      <Tooltip title={help}>
        <InfoCircleOutlined className="jm-label-with-help-icon" />
      </Tooltip>
    </span>
  );
}
