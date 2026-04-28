import { useState } from 'react';
import { Modal, Upload, Button, Alert, Typography, Table, App as AntdApp, Space } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, extractProblem } from '../api/client';
import { downloadServerXlsx } from './server';

type ImportRowError = { rowNumber: number; message: string; field?: string | null };
type ImportResult = { totalRows: number; committedCount: number; errors: ImportRowError[] };

type Props = {
  open: boolean;
  onClose: () => void;
  /// Title shown on the dialog (e.g. "Import members").
  title: string;
  /// Endpoint that accepts an XLSX upload (multipart). Returns { totalRows, committedCount, errors[] }.
  uploadEndpoint: string;
  /// Endpoint that returns an XLSX template to download.
  templateEndpoint: string;
  /// Suggested filename for the template download.
  templateFilename: string;
  /// Called when an upload succeeded with at least one committed row, so the parent can refetch.
  onCommitted?: () => void;
  /// Optional hint shown above the upload area (e.g. column expectations).
  hint?: React.ReactNode;
  /// React Query cache keys to invalidate on commit so list pages refresh.
  invalidateKeys?: readonly (readonly unknown[])[];
};

/// Reusable upload-and-import dialog. Pattern:
///   1. User drops an XLSX (or downloads the template first).
///   2. Submit → POSTs multipart to <uploadEndpoint>.
///   3. Show committed count + per-row errors. User can fix and re-upload.
/// One file per upload — the backend already commits valid rows even when others error,
/// so re-uploading with a fixed sheet only retries the previously-failed rows.
export function ImportDialog({
  open, onClose, title, uploadEndpoint, templateEndpoint, templateFilename,
  onCommitted, hint, invalidateKeys,
}: Props) {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const [file, setFile] = useState<UploadFile | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file?.originFileObj) throw new Error('Select a file first.');
      const form = new FormData();
      form.append('file', file.originFileObj as unknown as Blob, file.name);
      const { data } = await api.post<ImportResult>(uploadEndpoint, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: async (data) => {
      setResult(data);
      if (data.committedCount > 0) {
        message.success(`Imported ${data.committedCount} row(s).`);
        for (const k of invalidateKeys ?? []) await qc.invalidateQueries({ queryKey: k });
        onCommitted?.();
      } else if (data.errors.length > 0) {
        message.warning('No rows imported — see errors below.');
      } else {
        message.info('No rows in the file.');
      }
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Upload failed.'),
  });

  const reset = () => { setFile(null); setResult(null); };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={() => { reset(); onClose(); }}
      width={720}
      destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'space-between' }}>
          <Button icon={<DownloadOutlined />} onClick={() => downloadServerXlsx(templateEndpoint, {}, templateFilename)}>
            Download template
          </Button>
          <Space>
            <Button onClick={() => { reset(); onClose(); }}>{result ? 'Close' : 'Cancel'}</Button>
            <Button type="primary" loading={uploadMut.isPending} disabled={!file} onClick={() => uploadMut.mutate()}>
              {result ? 'Re-upload' : 'Upload & import'}
            </Button>
          </Space>
        </Space>
      }
    >
      {hint && <Alert type="info" showIcon style={{ marginBlockEnd: 12 }} message={hint} />}

      <Upload.Dragger
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        beforeUpload={() => false} // we upload manually via the button
        maxCount={1}
        fileList={file ? [file] : []}
        onChange={({ fileList }) => { setFile(fileList[fileList.length - 1] ?? null); setResult(null); }}
        onRemove={() => { setFile(null); setResult(null); return true; }}
        style={{ padding: 8 }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">Drop an XLSX file here, or click to choose one</p>
        <p className="ant-upload-hint" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
          Use the template above to start with the correct headers.
        </p>
      </Upload.Dragger>

      {result && (
        <div style={{ marginBlockStart: 16 }}>
          <Typography.Text strong>
            {result.committedCount} of {result.totalRows} row(s) imported.
            {result.errors.length > 0 && <Typography.Text type="danger" style={{ marginInlineStart: 8 }}>{result.errors.length} error(s).</Typography.Text>}
          </Typography.Text>

          {result.errors.length > 0 && (
            <Table<ImportRowError>
              size="small"
              style={{ marginBlockStart: 12 }}
              dataSource={result.errors}
              rowKey={(r) => `${r.rowNumber}-${r.field ?? ''}`}
              pagination={result.errors.length > 25 ? { pageSize: 25 } : false}
              columns={[
                { title: 'Row', dataIndex: 'rowNumber', width: 70, render: (v: number) => <span className="jm-tnum">{v}</span> },
                { title: 'Field', dataIndex: 'field', width: 140, render: (v?: string | null) => v ?? '—' },
                { title: 'Error', dataIndex: 'message', render: (v: string) => <Typography.Text type="danger" style={{ fontSize: 12 }}>{v}</Typography.Text> },
              ]}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
