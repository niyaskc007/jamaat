import { useState, useEffect } from 'react';
import { Upload, Button, Space, Input, App as AntdApp } from 'antd';
import { UploadOutlined, DeleteOutlined, LinkOutlined, WarningOutlined } from '@ant-design/icons';
import { extractProblem } from '../api/client';

type Props = {
  value?: string | null;
  onChange: (url: string | null) => void;
  upload: (file: File) => Promise<string>;
  /// Compact preview height. Defaults to 96 for inline use; 160 for hero/cover.
  previewHeight?: number;
  /// Allow pasting a remote URL alongside the upload button. Default: true.
  allowUrl?: boolean;
  placeholder?: string;
  accept?: string;
};

/// Image picker that wraps an upload + preview + clear + (optional) URL paste-in. Callers supply
/// the upload function so this component is unaware of the storage backend - it just returns the
/// URL string the server hands back. Use this everywhere we previously asked the user to type an
/// image URL by hand (logos, hero bg, gallery, speakers, sponsors, share image).
export function ImageUploadField({
  value, onChange, upload,
  previewHeight = 96,
  allowUrl = true,
  placeholder = 'Or paste an image URL',
  accept = 'image/*',
}: Props) {
  const { message } = AntdApp.useApp();
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [broken, setBroken] = useState(false);

  // Reset the broken-image flag whenever the URL changes (e.g. after a fresh upload).
  useEffect(() => { setBroken(false); }, [value]);

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const url = await upload(file);
      onChange(url);
      message.success('Image uploaded.');
    } catch (e) {
      message.error(extractProblem(e).detail ?? 'Upload failed - is the API restarted with the latest build?');
    } finally {
      setBusy(false);
    }
    return false; // prevent default upload
  };

  return (
    <div>
      {value && !broken ? (
        <img
          src={value}
          alt=""
          onError={() => setBroken(true)}
          style={{
            inlineSize: '100%', blockSize: previewHeight, objectFit: 'cover',
            borderRadius: 8, marginBlockEnd: 8, border: '1px solid var(--jm-border)', display: 'block',
          }}
        />
      ) : value && broken ? (
        <div style={{
          blockSize: previewHeight, borderRadius: 8, marginBlockEnd: 8,
          background: '#FEF2F2', border: '1px dashed #DC2626',
          display: 'grid', placeItems: 'center', color: '#DC2626', fontSize: 12, padding: 8, textAlign: 'center',
        }}>
          <div>
            <WarningOutlined /> Image not reachable<br />
            <span style={{ fontSize: 11, color: '#7F1D1D' }}>{value}</span>
          </div>
        </div>
      ) : (
        <div style={{
          blockSize: previewHeight, borderRadius: 8, marginBlockEnd: 8,
          background: 'var(--jm-surface-muted, #F8FAFC)', border: '1px dashed var(--jm-border)',
          display: 'grid', placeItems: 'center', color: 'var(--jm-gray-400)', fontSize: 12,
        }}>No image</div>
      )}
      <Space wrap>
        <Upload maxCount={1} showUploadList={false} accept={accept} beforeUpload={onUpload}>
          <Button icon={<UploadOutlined />} loading={busy} size="small">Upload</Button>
        </Upload>
        {allowUrl && (
          <Button size="small" icon={<LinkOutlined />} type={showUrl ? 'primary' : 'default'}
            onClick={() => setShowUrl((v) => !v)}>URL</Button>
        )}
        {value && (
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(null)}>Remove</Button>
        )}
      </Space>
      {showUrl && allowUrl && (
        <Input
          style={{ marginBlockStart: 8 }}
          size="small"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
    </div>
  );
}
