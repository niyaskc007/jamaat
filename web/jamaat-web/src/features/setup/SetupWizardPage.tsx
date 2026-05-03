import { useEffect, useState } from 'react';
import { Card, Steps, Form, Input, Select, Button, Alert, Spin, Result, Typography, Space, Divider, Tag } from 'antd';
import {
  CheckCircleOutlined, DatabaseOutlined, BankOutlined, UserOutlined, RocketOutlined,
  WarningOutlined, ReloadOutlined, ArrowRightOutlined, LockOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { setupApi, type InitializeSetupInput } from './setupApi';
import { extractProblem } from '../../shared/api/client';

/// Public route at /setup. Walks an operator through the four-step first-run wizard:
///   0  Welcome / system check  - probes /setup/status, shows DB reachability + version
///   1  Configure your Jamaat   - tenant name, code, base currency, language
///   2  Create the first admin  - full name, email, password (with confirm)
///   3  Done                    - one click to /login with the email pre-filled
///
/// The wizard never collects DB credentials - those live in appsettings.json and are set
/// by the install.ps1 installer at deploy time. Anything we'd need at runtime to talk to
/// the database has already been resolved by the time this page renders.
export function SetupWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [tenantForm] = Form.useForm<{
    tenantName: string; tenantCode: string; baseCurrency: string; preferredLanguage: string;
  }>();
  const [adminForm] = Form.useForm<{
    adminFullName: string; adminEmail: string; adminPassword: string; confirmPassword: string;
  }>();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [completionEmail, setCompletionEmail] = useState<string | null>(null);

  // Re-fetch status on mount + every time the user backs into Welcome. If setup is already
  // complete (someone refreshed the page after finishing) we send them straight to /login.
  const statusQ = useQuery({
    queryKey: ['setup-status'],
    queryFn: setupApi.status,
    refetchInterval: false,
  });

  useEffect(() => {
    if (statusQ.data && !statusQ.data.requiresSetup && step !== 3) {
      navigate('/login', { replace: true });
    }
  }, [statusQ.data, step, navigate]);

  const initMut = useMutation({
    mutationFn: (input: InitializeSetupInput) => setupApi.initialize(input),
    onSuccess: (r) => {
      setCompletionEmail(r.loginEmail);
      setStep(3);
    },
    onError: (err) => {
      const p = extractProblem(err);
      setSubmissionError(p.detail ?? p.title ?? 'Setup failed.');
    },
  });

  const finish = async () => {
    setSubmissionError(null);
    try {
      const tenant = await tenantForm.validateFields();
      const admin = await adminForm.validateFields();
      initMut.mutate({
        tenantName: tenant.tenantName,
        tenantCode: tenant.tenantCode,
        baseCurrency: tenant.baseCurrency,
        adminFullName: admin.adminFullName,
        adminEmail: admin.adminEmail,
        adminPassword: admin.adminPassword,
        preferredLanguage: tenant.preferredLanguage,
      });
    } catch {
      // validateFields rejects when a required field is missing — let the user see the
      // inline AntD field errors and stay on the current step.
    }
  };

  return (
    <div className="jm-brand-backdrop">
      <Card className="jm-brand-card" style={{ inlineSize: '100%', maxInlineSize: 720 }}>
        <Typography.Title level={3} className="jm-section-title">Welcome to Jamaat</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBlockEnd: 16 }}>
          Let's set up your community management system. This takes about a minute.
        </Typography.Paragraph>

        <Steps
          size="small"
          current={step}
          style={{ marginBlockEnd: 24 }}
          items={[
            { title: 'Welcome', icon: <DatabaseOutlined /> },
            { title: 'Your Jamaat', icon: <BankOutlined /> },
            { title: 'Admin user', icon: <UserOutlined /> },
            { title: 'Done', icon: <RocketOutlined /> },
          ]}
        />

        {step === 0 && (
          <WelcomeStep
            statusQ={statusQ}
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <Form layout="vertical" form={tenantForm} requiredMark={false}
            initialValues={{ baseCurrency: 'AED', preferredLanguage: 'en', tenantCode: 'JAMAAT' }}>
            <Typography.Paragraph type="secondary">
              The Jamaat name shows on every receipt, voucher, and report. Pick a short code (3–10
              uppercase letters) that identifies your tenant in URLs and exports.
            </Typography.Paragraph>
            <Form.Item name="tenantName" label="Jamaat name"
              rules={[{ required: true, message: 'Enter your Jamaat name.' }]}>
              <Input size="large" placeholder="e.g. Anjuman-e-Burhani Mumbai" autoFocus />
            </Form.Item>
            <Form.Item name="tenantCode" label="Short code"
              rules={[
                { required: true, message: 'Pick a short code.' },
                { pattern: /^[A-Z0-9_]{2,12}$/, message: 'Uppercase letters, digits, underscore. 2–12 chars.' },
              ]}>
              <Input size="large" placeholder="JAMAAT" />
            </Form.Item>
            <Space size={16} style={{ display: 'flex' }}>
              <Form.Item name="baseCurrency" label="Base currency" style={{ flex: 1 }}
                rules={[{ required: true }]}>
                <Select size="large" options={[
                  { value: 'AED', label: 'AED — UAE Dirham' },
                  { value: 'INR', label: 'INR — Indian Rupee' },
                  { value: 'USD', label: 'USD — US Dollar' },
                  { value: 'GBP', label: 'GBP — Pound Sterling' },
                  { value: 'PKR', label: 'PKR — Pakistani Rupee' },
                  { value: 'KWD', label: 'KWD — Kuwaiti Dinar' },
                  { value: 'SAR', label: 'SAR — Saudi Riyal' },
                ]} />
              </Form.Item>
              <Form.Item name="preferredLanguage" label="Default language" style={{ flex: 1 }}
                rules={[{ required: true }]}>
                <Select size="large" options={[
                  { value: 'en', label: 'English' },
                  { value: 'ar', label: 'العربية' },
                  { value: 'hi', label: 'हिन्दी' },
                  { value: 'ur', label: 'اُردو' },
                ]} />
              </Form.Item>
            </Space>
            <FooterNav onBack={() => setStep(0)}
              onNext={async () => { try { await tenantForm.validateFields(); setStep(2); } catch { /* fields show errors */ } }} />
          </Form>
        )}

        {step === 2 && (
          <Form layout="vertical" form={adminForm} requiredMark={false}>
            <Typography.Paragraph type="secondary">
              This is the first administrator. They can create more users from the admin module
              later. Pick a strong password — at least 8 characters with a mix of cases + a digit.
            </Typography.Paragraph>
            <Form.Item name="adminFullName" label="Full name"
              rules={[{ required: true, message: "Enter the admin's full name." }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder="e.g. System Administrator" autoFocus />
            </Form.Item>
            <Form.Item name="adminEmail" label="Email"
              rules={[
                { required: true, message: 'Email is required.' },
                { type: 'email', message: 'Enter a valid email address.' },
              ]}>
              <Input size="large" placeholder="admin@yourjamaat.org" />
            </Form.Item>
            <Form.Item name="adminPassword" label="Password"
              rules={[
                { required: true, message: 'Choose a password.' },
                { min: 8, message: 'At least 8 characters.' },
              ]}>
              <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
            </Form.Item>
            <Form.Item name="confirmPassword" label="Confirm password"
              dependencies={['adminPassword']}
              rules={[
                { required: true, message: 'Confirm the password.' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('adminPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match.'));
                  },
                }),
              ]}>
              <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
            </Form.Item>
            {submissionError && (
              <Alert type="error" showIcon message={submissionError}
                style={{ marginBlockEnd: 12 }} closable onClose={() => setSubmissionError(null)} />
            )}
            <FooterNav onBack={() => setStep(1)}
              onNext={finish}
              nextLabel={initMut.isPending ? 'Creating…' : 'Finish setup'}
              nextDisabled={initMut.isPending}
              nextIcon={<RocketOutlined />} />
          </Form>
        )}

        {step === 3 && (
          <Result
            status="success"
            icon={<CheckCircleOutlined style={{ color: 'var(--jm-success-fg-strong)' }} />}
            title="Setup complete"
            subTitle={
              <span>
                You can now sign in as <Tag color="blue" className="jm-tnum">{completionEmail}</Tag>.
                The admin user has full permissions across the platform.
              </span>
            }
            extra={
              <Button type="primary" size="large" icon={<ArrowRightOutlined />}
                onClick={() => navigate(`/login${completionEmail ? `?email=${encodeURIComponent(completionEmail)}` : ''}`, { replace: true })}>
                Go to sign in
              </Button>
            }
          />
        )}

        <Divider style={{ marginBlock: 16 }} />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Jamaat · {statusQ.data?.version ?? 'loading…'} · First-run wizard
        </Typography.Text>
      </Card>
    </div>
  );
}

function WelcomeStep({ statusQ, onNext }: {
  statusQ: ReturnType<typeof useQuery<import('./setupApi').SetupStatus>>;
  onNext: () => void;
}) {
  if (statusQ.isLoading) {
    return <div style={{ padding: 32, textAlign: 'center' }}><Spin size="large" /></div>;
  }
  if (statusQ.isError || !statusQ.data) {
    return (
      <Alert type="error" showIcon icon={<WarningOutlined />}
        message="Can't reach the API"
        description={
          <span>
            The setup wizard couldn't talk to the API. Make sure the API process is running and
            that the connection string in <code>appsettings.json</code> is correct, then refresh.
          </span>
        }
        action={<Button icon={<ReloadOutlined />} onClick={() => statusQ.refetch()}>Retry</Button>}
      />
    );
  }
  const s = statusQ.data;
  return (
    <Space direction="vertical" size={12} style={{ inlineSize: '100%' }}>
      <Alert
        type={s.dbReachable ? 'success' : 'error'} showIcon
        message={s.dbReachable ? 'Database connection: OK' : 'Database connection: failed'}
        description={s.dbReachable
          ? 'The API can talk to the database. Migrations have been applied.'
          : 'Update the connection string in appsettings.json and restart the API, then refresh this page.'}
      />
      <Alert
        type={s.hasAnyTenant ? 'success' : 'warning'} showIcon
        message={s.hasAnyTenant ? 'Default tenant: ready' : 'Default tenant: missing'}
        description={s.hasAnyTenant
          ? 'The seeded tenant row exists and will be configured in the next step.'
          : 'No tenant row found. Restart the API to run migrations + seed.'}
      />
      <Alert
        type={s.hasAnyAdmin ? 'info' : 'warning'} showIcon
        message={s.hasAnyAdmin ? 'Admin already exists' : 'No admin yet'}
        description={s.hasAnyAdmin
          ? "An admin user is already configured. The wizard isn't needed — go to sign in."
          : "You'll create the first admin in the last step of this wizard."}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlockStart: 8 }}>
        <Button type="primary" size="large" disabled={!s.dbReachable || !s.hasAnyTenant}
          icon={<ArrowRightOutlined />} onClick={onNext}>
          Get started
        </Button>
      </div>
    </Space>
  );
}

function FooterNav({ onBack, onNext, nextLabel = 'Next', nextDisabled = false, nextIcon = <ArrowRightOutlined /> }: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextIcon?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockStart: 8 }}>
      <Button onClick={onBack}>Back</Button>
      <Button type="primary" onClick={onNext} disabled={nextDisabled} icon={nextIcon}>
        {nextLabel}
      </Button>
    </div>
  );
}
