import { useState, useCallback, type ReactNode } from 'react';
import type { MenuProps } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { authStore } from '../../../shared/auth/authStore';
import { DeletionImpactModal } from './DeletionImpactModal';

/// Drop-in helper for master-data panels: gives them a SuperAdmin "Delete" menu
/// item and a rendered modal. Keeps the per-panel boilerplate to two lines
/// (spread `menuItem` into the dropdown items, render `modal` once at the end).
///
/// Example:
///   const sa = useSuperAdminDelete({
///     entityType: 'Sector',
///     invalidateKey: ['sectors'],
///     labelFor: (r) => `${r.code} - ${r.name}`,
///   });
///   ...
///   const items: MenuProps['items'] = [
///     { key: 'edit', label: 'Edit', onClick: ... },
///     ...sa.menuItemFor(row),
///   ];
///   ...
///   return <>{table}{sa.modal}</>;
export function useSuperAdminDelete<TRow extends { id: string }>(opts: {
  entityType: string;
  /// TanStack Query key prefix to invalidate after a successful soft-delete so the
  /// panel's list re-fetches and the row disappears from view.
  invalidateKey: readonly unknown[];
  /// Friendly label shown in the modal title. Falls back to "{entityType}/{id}"
  /// if omitted.
  labelFor?: (row: TRow) => string;
  /// Permission name to gate the menu entry. Defaults to `admin.delete.master` for the
  /// 12 master-data panels; pass `admin.delete.identity` for Member / Family panels.
  permission?: string;
}): {
  /// True when the current user holds `admin.delete.master`. Use this to conditionally
  /// render an inline Delete button on panels that don't use a Dropdown menu.
  canSoftDelete: boolean;
  /// Spread this into a Dropdown `items` array. Returns an empty array when
  /// the current user lacks admin.delete.master so the menu entry vanishes.
  menuItemFor: (row: TRow) => NonNullable<MenuProps['items']>;
  /// Open the impact-preview modal for a row from anywhere - e.g. an inline
  /// button onClick handler on panels that don't use a Dropdown menu.
  trigger: (row: TRow) => void;
  /// Render once at the end of the component tree. Becomes a real Modal only
  /// when a row is selected; otherwise nothing.
  modal: ReactNode;
} {
  const [target, setTarget] = useState<TRow | null>(null);
  const qc = useQueryClient();
  const canSoftDelete = authStore.hasPermission(opts.permission ?? 'admin.delete.master');

  const menuItemFor = useCallback((row: TRow): NonNullable<MenuProps['items']> => {
    if (!canSoftDelete) return [];
    return [{
      key: 'soft-delete',
      icon: React.createElement(DeleteOutlined),
      danger: true,
      label: 'Delete (SuperAdmin)',
      onClick: () => setTarget(row),
    }];
  }, [canSoftDelete]);

  const modal = target ? React.createElement(DeletionImpactModal, {
    open: true,
    entityType: opts.entityType,
    id: target.id,
    labelHint: opts.labelFor?.(target),
    onClose: () => setTarget(null),
    onDeleted: () => { void qc.invalidateQueries({ queryKey: opts.invalidateKey }); },
  }) : null;

  const trigger = useCallback((row: TRow) => setTarget(row), []);

  return { canSoftDelete, menuItemFor, trigger, modal };
}
