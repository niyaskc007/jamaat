import { useState } from 'react';
import {
  Card, Row, Col, Tag, Button, Upload, Input, Space, Form, Alert, App as AntdApp, Typography,
  Divider, Tabs,
} from 'antd';
import {
  ApiOutlined, GlobalOutlined, MessageOutlined, WhatsAppOutlined, MailOutlined,
  UploadOutlined, SearchOutlined, SendOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, extractProblem } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';

type Status = {
  geolocation: { provider: string; isConfigured: boolean; databasePath: string };
  sms: { provider?: string | null; isConfigured: boolean; fromNumber?: string | null; supported: string[] };
  whatsapp: { provider?: string | null; isConfigured: boolean; fromNumber?: string | null; supported: string[] };
};

/// Admin integrations panel. Each card shows a configured/unconfigured chip + a Test button
/// that round-trips through the real provider. Credentials live in appsettings.json /
/// environment variables (see docs); the panel is for visibility + verification, not for
/// editing secrets in the browser. Future: encrypted tenant_settings table for runtime config.
export function IntegrationsPage() {
  const statusQ = useQuery({
    queryKey: ['integrations-status'],
    queryFn: async () => (await api.get<Status>('/api/v1/integrations/status')).data,
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="External systems - geolocation database, SMS gateway, WhatsApp, email. Configure credentials in appsettings or environment, then verify here." />

      <Tabs
        items={[
          { key: 'geo', label: <span><GlobalOutlined /> Geolocation</span>, children: <GeolocationCard status={statusQ.data?.geolocation} /> },
          { key: 'sms', label: <span><MessageOutlined /> SMS</span>, children: <SmsCard status={statusQ.data?.sms} /> },
          { key: 'wa', label: <span><WhatsAppOutlined /> WhatsApp</span>, children: <WhatsAppCard status={statusQ.data?.whatsapp} /> },
          { key: 'email', label: <span><MailOutlined /> Email</span>, children: <EmailCard /> },
          { key: 'other', label: <span><ApiOutlined /> Other</span>, children: <OtherCard /> },
        ]}
      />
    </div>
  );
}

// --- Geolocation ---------------------------------------------------------

function GeolocationCard({ status }: { status?: Status['geolocation'] }) {
  const { message } = AntdApp.useApp();
  const [testIp, setTestIp] = useState('8.8.8.8');
  const [testResult, setTestResult] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<{ isConfigured: boolean; message: string }>(
        '/api/v1/integrations/geolocation/upload', fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      return r.data;
    },
    onSuccess: (r) => {
      message.success(r.message);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Upload failed'),
  });

  const test = useMutation({
    mutationFn: async (ip: string) => (await api.get<{ ip: string; country: string | null; city: string | null; found: boolean }>(
      `/api/v1/integrations/geolocation/test?ip=${encodeURIComponent(ip)}`)).data,
    onSuccess: (r) => setTestResult(r.found ? `${r.ip} → ${[r.city, r.country].filter(Boolean).join(', ') || 'Unknown'}` : `${r.ip} → not in database`),
    onError: (e) => message.error(extractProblem(e).detail ?? 'Test failed'),
  });

  return (
    <Card className="jm-card">
      <Space direction="vertical" size={16} className="jm-full-width">
        <StatusRow ok={!!status?.isConfigured} label="MaxMind GeoLite2" detail={status?.databasePath} />
        <Alert
          type="info" showIcon
          message="Privacy-first geolocation"
          description={<>
            We use the offline MaxMind GeoLite2 database so member IPs never leave your servers, and login isn't slowed by an online API call.
            See <Typography.Link href="/help">the setup guide</Typography.Link> for download instructions and a refresh schedule.
          </>}
        />

        <div>
          <Typography.Title level={5} className="jm-section-title">Refresh database</Typography.Title>
          <Typography.Paragraph type="secondary" className="jm-page-intro">
            Drop in a fresh `.tar.gz`, `.zip`, or pre-extracted `.mmdb` from MaxMind. The reader hot-reloads — no restart needed.
          </Typography.Paragraph>
          <Upload showUploadList={false} accept=".mmdb,.tar.gz,.tgz,.zip"
            beforeUpload={(file) => { upload.mutate(file as unknown as File); return false; }}>
            <Button icon={<UploadOutlined />} loading={upload.isPending}>Upload database</Button>
          </Upload>
        </div>

        <Divider className="jm-divider-flush" />

        <div>
          <Typography.Title level={5} className="jm-section-title">Test lookup</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBlockStart: 4, marginBlockEnd: 12 }}>
            Try a public IP — `8.8.8.8` (Google DNS), `1.1.1.1` (Cloudflare), or any visitor IP from your logs.
          </Typography.Paragraph>
          <Space.Compact className="jm-test-form-input">
            <Input prefix={<SearchOutlined />} placeholder="IP to look up" value={testIp} onChange={(e) => setTestIp(e.target.value)} />
            <Button type="primary" loading={test.isPending} onClick={() => test.mutate(testIp)}>Lookup</Button>
          </Space.Compact>
          {testResult && <Alert type="success" message={testResult} className="jm-alert-after-card" />}
        </div>
      </Space>
    </Card>
  );
}

// --- SMS -----------------------------------------------------------------

function SmsCard({ status }: { status?: Status['sms'] }) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();

  const test = useMutation({
    mutationFn: async (v: { to: string; message?: string }) =>
      (await api.post<{ success: boolean; providerMessageId?: string; errorDetail?: string }>(
        '/api/v1/integrations/sms/test', v)).data,
    onSuccess: (r) => r.success
      ? message.success(`SMS sent. Provider id: ${r.providerMessageId ?? 'noop'}`)
      : message.error(`SMS failed: ${r.errorDetail ?? 'unknown'}`),
    onError: (e) => message.error(extractProblem(e).detail ?? 'Test send failed'),
  });

  return (
    <Card className="jm-card">
      <Space direction="vertical" size={16} className="jm-full-width">
        <StatusRow ok={!!status?.isConfigured}
          label={status?.provider ? `Active provider: ${status.provider}` : 'No SMS provider configured'}
          detail={status?.fromNumber ? `From: ${status.fromNumber}` : undefined} />

        <Alert
          type="info" showIcon
          message="Supported providers"
          description={<>
            <Typography.Text strong>Twilio</Typography.Text> — global, premium ($0.04+/SMS to UAE).
            <br /><Typography.Text strong>Unifonic</Typography.Text> — UAE-based, popular regional ($0.02-0.03).
            <br /><Typography.Text strong>Infobip</Typography.Text> — global with strong MENA coverage ($0.025-0.03).
            <br />Configure in <code>appsettings.json</code> under the <code>Sms</code> section and restart, or via env vars.
          </>}
        />

        <Divider className="jm-divider-flush" />

        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => test.mutate(v)}>
          <Typography.Title level={5} className="jm-section-title">Test send</Typography.Title>
          <Typography.Paragraph type="secondary" className="jm-page-intro">
            Send a one-off message through the active provider. Uses the credentials in <code>Sms:*</code>.
          </Typography.Paragraph>
          <Form.Item name="to" label="To (E.164 format)" rules={[{ required: true, pattern: /^\+\d{6,15}$/, message: 'Use E.164: +<countrycode><number>' }]}>
            <Input placeholder="+9715xxxxxxx" />
          </Form.Item>
          <Form.Item name="message" label="Message">
            <Input.TextArea rows={3} placeholder="Test message from Jamaat – if you see this, SMS is working." />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={test.isPending}>Send test SMS</Button>
        </Form>
      </Space>
    </Card>
  );
}

// --- WhatsApp ------------------------------------------------------------

function WhatsAppCard({ status }: { status?: Status['whatsapp'] }) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();

  const test = useMutation({
    mutationFn: async (v: { to: string; message?: string }) =>
      (await api.post<{ success: boolean; providerMessageId?: string; errorDetail?: string }>(
        '/api/v1/integrations/whatsapp/test', v)).data,
    onSuccess: (r) => r.success
      ? message.success(`WhatsApp sent. Provider id: ${r.providerMessageId ?? 'noop'}`)
      : message.error(`WhatsApp failed: ${r.errorDetail ?? 'unknown'}`),
    onError: (e) => message.error(extractProblem(e).detail ?? 'Test send failed'),
  });

  return (
    <Card className="jm-card">
      <Space direction="vertical" size={16} className="jm-full-width">
        <StatusRow ok={!!status?.isConfigured}
          label={status?.provider ? `Active provider: ${status.provider}` : 'No WhatsApp provider configured'}
          detail={status?.fromNumber ? `From: ${status.fromNumber}` : undefined} />

        <Alert
          type="warning" showIcon
          message="Twilio WhatsApp Business API"
          description={<>
            Outbound messages outside a 24-hour conversation window need a pre-approved template. The sandbox works for testing without approval (recipients must opt in by texting <code>join &lt;phrase&gt;</code> to your sandbox number first).
            Configure under <code>WhatsApp</code> in appsettings: <code>TwilioAccountSid</code>, <code>TwilioAuthToken</code>, <code>FromNumber</code>.
          </>}
        />

        <Divider className="jm-divider-flush" />

        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => test.mutate(v)}>
          <Typography.Title level={5} style={{ margin: 0 }}>Test send</Typography.Title>
          <Form.Item name="to" label="To (E.164 format)" rules={[{ required: true, pattern: /^\+\d{6,15}$/, message: 'Use E.164: +<countrycode><number>' }]}>
            <Input placeholder="+9715xxxxxxx" />
          </Form.Item>
          <Form.Item name="message" label="Message">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={test.isPending}>Send test WhatsApp</Button>
        </Form>
      </Space>
    </Card>
  );
}

// --- Email + Other -------------------------------------------------------

function EmailCard() {
  return (
    <Card className="jm-card">
      <Alert
        type="info" showIcon
        message="SMTP email"
        description={<>
          Configure under <code>Notifications:Smtp</code> in appsettings (Host, Port, Username, Password, FromAddress).
          Set <code>Notifications:Enabled=true</code> to flip from log-only to live delivery. Every notification is recorded
          in <Typography.Link href="/admin/notifications">Admin → Notifications</Typography.Link> regardless of mode.
        </>}
      />
    </Card>
  );
}

function OtherCard() {
  return (
    <Card className="jm-card">
      <Typography.Title level={5} className="jm-section-title">Other integrations</Typography.Title>
      <Typography.Paragraph type="secondary" className="jm-page-intro">
        ITS member sync, banking exports, scheduled jobs — coming in subsequent rollouts.
      </Typography.Paragraph>
    </Card>
  );
}

// --- shared bits ---------------------------------------------------------

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="jm-row-12">
      <Tag color={ok ? 'green' : 'red'} icon={ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />} className="jm-status-tag">
        {ok ? 'Configured' : 'Not configured'}
      </Tag>
      <div>
        <div className="jm-strong">{label}</div>
        {detail && <div className="jm-loc-ip">{detail}</div>}
      </div>
    </div>
  );
}
