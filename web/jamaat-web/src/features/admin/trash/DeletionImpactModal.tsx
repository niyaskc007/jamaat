import { useState } from 'react';
import { Modal, Alert, Input, Tag, Space, App as AntdApp, Skeleton } from 'antd';
import { ExclamationCircleOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../shared/api/client';
import { authStore } from '../../../shared/auth/authStore';
import { deletionApi, type DeletionImpact } from './deletionApi';

const { TextArea } = Input;

const MIN_REASON_LENGTH = 10;

type Props = {
  open: boolean;
  entityType: string;
  id: string;
  /// Optional override of the label shown in the modal title. Defaults to the
  /// label the server returns in the impact preview (e.g. "SABEELEST - Sabeel
  /// Establishment"). Passing a label here renders the title before the server
  /// roundtrip completes, which is nicer for the user on a slow link.
  labelHint?: string;
  onClose: () => void;
  /// Optional: invoked after a successful soft-delete. Caller typically invalidates
  /// the list query for the entity type so the row disappears from the master-data UI.
  onDeleted?: () => void;
};

/// Two-step destructive-delete modal:
///   1. Fetches the impact preview from the server (no side effects).
///   2. Shows blockers (red), cascades (yellow), redactions (gray).
///   3. If blockers present, Delete button stays disabled with an explainer.
///   4. Otherwise, operator types a reason (min 10 chars) and clicks Delete.
///   5. The actual delete is a soft-delete - the row goes to /admin/trash with
///      a 30-day retention timer. Restoring or purging is done from the Trash page.
export function DeletionImpactModal({ open, entityType, id, labelHint, onClose, onDeleted }: Props) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [reason, setReason] = useState('');

  const impactQ = useQuery({
    queryKey: ['deletion', 'impact', entityType, id],
    queryFn: () => deletionApi.impact(entityType, id),
    enabled: open,
    staleTime: 0, // always re-fetch when the modal opens; state may have changed
  });

  const deleteMut = useMutation({
    mutationFn: () => deletionApi.softDelete(entityType, id, reason),
    onSuccess: () => {
      message.success('Soft-deleted. Available in /admin/trash for 30 days.');
      qc.invalidateQueries({ queryKey: ['trash'] });
      qc.invalidateQueries({ queryKey: ['deletion', 'impact', entityType, id] });
      setReason('');
      onDeleted?.();
      onClose();
    },
    onError: (err) => {
      const p = extractProblem(err);
      message.error(p?.detail ?? p?.title ?? 'Delete failed');
    },
  });

  const impact: DeletionImpact | undefined = impactQ.data;
  const hasBlockers = (impact?.blockers.length ?? 0) > 0;
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= MIN_REASON_LENGTH;

  return (
    <Modal
      open={open}
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#dc2626' }} />
          <span>Delete {labelHint ?? impact?.label ?? `${entityType}/${id}`}?</span>
        </Space>
      }
      width={680}
      okText={hasBlockers ? 'Blocked' : 'Delete'}
      okButtonProps={{
        danger: true,
        disabled: hasBlockers || !reasonValid || impactQ.isLoading || deleteMut.isPending,
        loading: deleteMut.isPending,
      }}
      onOk={() => deleteMut.mutate()}
      cancelText="Cancel"
      onCancel={() => { setReason(''); onClose(); }}
      destroyOnClose
    >
      {impactQ.isLoading ? (
        <Skeleton active />
      ) : impactQ.isError ? (
        <Alert
          type="error" showIcon
          message="Couldn't load impact preview"
          description={extractProblem(impactQ.error)?.detail ?? (impactQ.error as Error)?.message}
        />
      ) : impact ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {hasBlockers && (
            <Alert
              type="error" showIcon
              icon={<WarningOutlined />}
              message={`${impact.blockers.length} blocker(s) - cannot delete yet`}
              description={
                <ul style={{ paddingInlineStart: 18, margin: 0 }}>
                  {impact.blockers.map((b, i) => (
                    <li key={i}>
                      <Tag color="red">{b.kind}</Tag> {b.description}
                    </li>
                  ))}
                </ul>
              }
            />
          )}

          {impact.cascades.length > 0 && (
            <Alert
              type="warning" showIcon
              message="Will also be soft-deleted (cascade)"
              description={
                <ul style={{ paddingInlineStart: 18, margin: 0 }}>
                  {impact.cascades.map((c, i) => (
                    <li key={i}>
                      <Tag color="orange">{c.kind}</Tag> {c.description}
                    </li>
                  ))}
                </ul>
              }
            />
          )}

          {impact.redactions.length > 0 && (
            <Alert
              type="info" showIcon
              message="Will survive (PII redacted at purge time)"
              description={
                <ul style={{ paddingInlineStart: 18, margin: 0 }}>
                  {impact.redactions.map((r, i) => (
                    <li key={i}>
                      <Tag>{r.kind}</Tag> {r.description}
                    </li>
                  ))}
                </ul>
              }
            />
          )}

          {!hasBlockers && impact.cascades.length === 0 && impact.redactions.length === 0 && (
            <Alert
              type="success" showIcon
              message="No known dependencies"
              description="This row can be soft-deleted cleanly. It will move to /admin/trash with a 30-day retention window."
            />
          )}

          {!hasBlockers && (
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>
                Reason <span style={{ color: '#dc2626' }}>*</span>
              </div>
              <TextArea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder='Why is this being deleted? Future admins will see this in the trash + audit log. Minimum 10 characters.'
                maxLength={500}
                showCount
              />
              {reason.length > 0 && !reasonValid && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>
                  At least {MIN_REASON_LENGTH} characters required.
                </div>
              )}
            </div>
          )}
        </Space>
      ) : null}
    </Modal>
  );
}

/// Reusable "Delete" button + modal pair for master-data list rows. Drop one of
/// these onto a row's action column to get the destructive-delete flow for free.
export function DeleteRowButton({
  entityType, id, label, onDeleted, gatePermission,
}: {
  entityType: string;
  id: string;
  label?: string;
  onDeleted?: () => void;
  /// If provided, the button is hidden unless the current user holds the perm.
  /// Typical value: 'admin.delete.master'.
  gatePermission?: string;
}) {
  const [open, setOpen] = useState(false);
  // Permission check kept lightweight - read from authStore directly so callers
  // don't have to thread `hasPermission` through their own scope.
  if (gatePermission && !authStore.hasPermission(gatePermission)) return null;
  return (
    <>
      <a onClick={() => setOpen(true)} style={{ color: '#dc2626' }}>
        <DeleteOutlined /> Delete
      </a>
      {open && (
        <DeletionImpactModal
          open={open}
          entityType={entityType}
          id={id}
          labelHint={label}
          onClose={() => setOpen(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}
