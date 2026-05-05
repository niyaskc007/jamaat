import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, Space, Result } from 'antd';
import { UserOutlined, MailOutlined, PhoneOutlined, MessageOutlined } from '@ant-design/icons';
import { Logo } from '../../shared/ui/Logo';
import { LanguageSwitcher } from '../../shared/i18n/LanguageSwitcher';
import { memberApplicationsApi, type SubmitApplicationDto, type ApplicationReceipt } from './registerApi';
import { extractProblem } from '../../shared/api/client';

/// Public self-registration page. Anonymous - no JWT, no captcha (admin moderates each
/// application). Members fill in name + ITS + at least one contact channel; the committee
/// reviews via /admin/applications and either approves (which provisions the login + emails
/// the temp password) or rejects with a note.
export function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ApplicationReceipt | null>(null);
  const [form] = Form.useForm<SubmitApplicationDto>();

  const onFinish = async (values: SubmitApplicationDto) => {
    setError(null);
    setSubmitting(true);
    try {
      const r = await memberApplicationsApi.submit({
        fullName: values.fullName.trim(),
        itsNumber: values.itsNumber.trim(),
        email: values.email?.trim() || null,
        phoneE164: values.phoneE164?.trim() || null,
        notes: values.notes?.trim() || null,
      });
      setReceipt(r);
    } catch (e) {
      setError(extractProblem(e).detail ?? 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <PublicShell>
        <Result
          status="success"
          title="Application submitted"
          subTitle={receipt.message}
          extra={[
            <Button key="login" type="primary" onClick={() => navigate('/login')}>Back to login</Button>,
          ]}
        />
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <Card className="jm-card" style={{ inlineSize: '100%', maxInlineSize: 540 }}>
        <Typography.Title level={3} style={{ marginBlockStart: 0 }}>Apply for portal access</Typography.Title>
        <Typography.Paragraph type="secondary">
          Submit this form to request a member-portal account. The committee reviews each application
          and contacts you with a decision. Approved applicants receive a welcome email with a
          temporary password.
        </Typography.Paragraph>

        {error && <Alert type="error" showIcon message={error} style={{ marginBlockEnd: 16 }} />}

        <Form layout="vertical" form={form} onFinish={onFinish}>
          <Form.Item name="fullName" label="Full name"
            rules={[{ required: true, min: 2, max: 200 }]}>
            <Input prefix={<UserOutlined />} placeholder="As registered with your Jamaat" autoFocus />
          </Form.Item>
          <Form.Item name="itsNumber" label="ITS number"
            rules={[
              { required: true },
              { pattern: /^[0-9]{8}$/, message: 'ITS must be 8 digits.' },
            ]}>
            <Input className="jm-tnum" maxLength={8} placeholder="40123000" />
          </Form.Item>
          <Form.Item name="email" label="Email"
            rules={[{ type: 'email', max: 200 }]}>
            <Input prefix={<MailOutlined />} placeholder="you@example.com" />
          </Form.Item>
          <Form.Item name="phoneE164" label="Phone (with country code)"
            rules={[{ max: 32 }]}>
            <Input prefix={<PhoneOutlined />} placeholder="+9715xxxxxxx" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBlockEnd: 16 }}>
            Provide an email or phone so the committee can contact you.
          </Typography.Text>
          <Form.Item name="notes" label="Notes for the committee (optional)"
            rules={[{ max: 2000 }]}>
            <Input.TextArea
              prefix={<MessageOutlined />}
              rows={3}
              placeholder="Anything we should know about your application?"
              maxLength={2000}
              showCount
            />
          </Form.Item>

          <Space style={{ inlineSize: '100%', justifyContent: 'space-between' }}>
            <Link to="/login">Already have an account? Sign in</Link>
            <Button type="primary" htmlType="submit" loading={submitting}>Submit application</Button>
          </Space>
        </Form>
      </Card>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minBlockSize: '100dvh', display: 'flex', flexDirection: 'column', background: '#FAFAFA' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBlockEnd: '1px solid #E5E7EB', background: '#FFFFFF' }}>
        <Logo size={28} />
        <LanguageSwitcher />
      </header>
      <main style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
        {children}
      </main>
      <footer style={{ padding: '16px 32px', borderBlockStart: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280' }}>
        <span>© {new Date().getFullYear()} Jamaat · A product of Ubrixy Technologies</span>
        <span style={{ display: 'flex', gap: 12 }}>
          <Link to="/legal/terms" style={{ color: '#6B7280' }}>Terms</Link>
          <Link to="/legal/privacy" style={{ color: '#6B7280' }}>Privacy</Link>
          <Link to="/help/faq" style={{ color: '#6B7280' }}>FAQ</Link>
        </span>
      </footer>
    </div>
  );
}
