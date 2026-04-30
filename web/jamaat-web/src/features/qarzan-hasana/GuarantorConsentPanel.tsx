import { Card, Tag, Space, Button, App as AntdApp, Empty } from 'antd';
import { CopyOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  qarzanHasanaApi, GuarantorConsentStatusLabel, GuarantorConsentStatusColor,
} from './qarzanHasanaApi';

/// Lists the per-guarantor consent rows for a draft loan and gives the operator a
/// copy-link button for each. The link points at the public portal (`/portal/qh-consent/{token}`)
/// where the guarantor accepts or declines independently. Status is reflected with a coloured
/// tag plus the response timestamp / IP when present.
export function GuarantorConsentPanel({ loanId }: { loanId: string }) {
  const { message } = AntdApp.useApp();
  const q = useQuery({
    queryKey: ['qh-guarantor-consents', loanId],
    queryFn: () => qarzanHasanaApi.guarantorConsents(loanId),
    refetchInterval: 30_000,
  });

  if (q.isError) return null;
  const consents = q.data ?? [];
  if (q.isLoading || consents.length === 0) return null;

  const portalLinkFor = (token: string) => `${window.location.origin}/portal/qh-consent/${token}`;

  return (
    <Card size="small"
      title={<span><SafetyCertificateOutlined /> Remote guarantor consent links</span>}
      extra={<span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Each kafil reviews and accepts independently</span>}
      style={{ marginBlockEnd: 16, border: '1px solid var(--jm-border)' }}>
      <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', marginBlockEnd: 12 }}>
        Share each guarantor's link via SMS, WhatsApp or email. They open it on their phone, review the loan
        summary, and tap Accept (or Decline). The loan can be submitted once <strong>both</strong> have
        accepted - or once you've ticked the operator-witnessed consent on the new-loan form.
      </div>
      {consents.map((c, idx) => (
        <div key={c.id} style={{
          paddingBlock: 10,
          borderBlockStart: idx > 0 ? '1px solid var(--jm-border)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{c.guarantorName}</strong>
            <span className="jm-tnum" style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>ITS {c.guarantorItsNumber}</span>
            <Tag color={GuarantorConsentStatusColor[c.status]} style={{ marginInlineStart: 'auto' }}>
              {GuarantorConsentStatusLabel[c.status]}
            </Tag>
          </div>
          {c.respondedAtUtc && (
            <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 2 }}>
              Responded {dayjs(c.respondedAtUtc).format('DD MMM YYYY, HH:mm')}
              {c.responderIpAddress && <> from <span className="jm-tnum">{c.responderIpAddress}</span></>}
            </div>
          )}
          {c.status === 1 && (
            <Space style={{ marginBlockStart: 6 }}>
              <Button size="small" icon={<CopyOutlined />}
                onClick={() => {
                  void navigator.clipboard.writeText(portalLinkFor(c.token));
                  message.success(`Link for ${c.guarantorName} copied. Share it via SMS / WhatsApp.`);
                }}>
                Copy link
              </Button>
              <a href={portalLinkFor(c.token)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                Open in new tab
              </a>
            </Space>
          )}
        </div>
      ))}
    </Card>
  );
}
