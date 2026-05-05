import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Form, Input, Typography, Alert, Checkbox, Collapse, Tag } from 'antd';
import { LockOutlined, MailOutlined, SafetyCertificateFilled, GlobalOutlined, FileDoneOutlined } from '@ant-design/icons';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi, isPasswordChangeRequired } from './authApi';
import { authStore } from '../../shared/auth/authStore';
import { defaultLandingFor } from '../../shared/auth/routing';
import { extractProblem } from '../../shared/api/client';
import { Logo } from '../../shared/ui/Logo';
import { IslamicPattern } from '../../shared/ui/IslamicPattern';
import { LanguageSwitcher } from '../../shared/i18n/LanguageSwitcher';
import { fetchFooterBlocks, fetchLoginBlocks } from '../cms/cmsApi';

const schema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
});
type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  // Accept both router-state (from RequireAuth) and ?returnTo= query (from axios 401 handler).
  const returnToQS = new URLSearchParams(location.search).get('returnTo');
  const from = returnToQS ?? (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@jamaat.local', password: 'Admin@12345', remember: true },
  });
  // CMS-driven marketing copy on the brand panel. Static fallbacks (i18n strings) are used until
  // the network call returns, and forever if it fails - the login screen MUST render even when
  // the API is down.
  const [cms, setCms] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLoginBlocks(), fetchFooterBlocks()]).then(([login, footer]) => {
      if (!cancelled) setCms({ ...login, ...footer });
    });
    return () => { cancelled = true; };
  }, []);
  // AntD Inputs aren't auto-controlled by react-hook-form's `register` - the DOM value
  // doesn't refresh when we call setValue from the dev-account picker. Watching here and
  // passing `value` makes the inputs fully controlled so clicks visibly fill both fields.
  const emailValue = watch('email');
  const passwordValue = watch('password');

  const fillPersona = (email: string, password: string) => {
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setValue('password', password, { shouldValidate: true, shouldDirty: true });
  };

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    try {
      const res = await authApi.login(data.email, data.password);
      // Force first-login change: server returned a non-JWT signal. Hand off to the
      // /change-password page with the identifier + temp pw pre-filled. We do NOT seed any
      // session here - clients only get a JWT after the change-password call succeeds.
      if (isPasswordChangeRequired(res)) {
        navigate('/change-password', {
          replace: true,
          state: { identifier: data.email, temporaryPassword: data.password, expiresAtUtc: res.temporaryPasswordExpiresAtUtc, returnTo: from },
        });
        return;
      }
      const stored = {
        id: res.user.id,
        userName: res.user.userName,
        fullName: res.user.fullName,
        tenantId: res.user.tenantId,
        permissions: res.user.permissions,
        preferredLanguage: res.user.preferredLanguage,
        userType: res.user.userType ?? null,
      };
      authStore.setSession(res.accessToken, res.refreshToken, stored);
      // Routing prefers the server-stamped userType claim. Falls back to permission-shape
      // inference for tokens issued before the 2026-05 migration so older tokens still
      // route correctly. Hybrid users land on /dashboard with a switcher exposed there.
      navigate(defaultLandingFor(stored, from), { replace: true });
    } catch (err) {
      const problem = extractProblem(err);
      setError(problem.detail ?? problem.title ?? t('login.invalid'));
    }
  };

  return (
    <div className="jm-login-root">
      {/* LEFT - brand panel */}
      <div className="jm-login-brand">
        <IslamicPattern opacity={0.1} colour="#C9A34B" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Logo size={36} variant="light" />
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 520 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#C9A34B',
              marginBlockEnd: 16,
            }}
          >
            {cms['login.eyebrow'] ?? t('login.marketingTitle')}
          </div>
          <Typography.Title
            level={1}
            style={{
              color: '#FFFFFF',
              fontSize: 38,
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {cms['login.title'] ?? 'One ledger for every receipt, voucher, and fund.'}
          </Typography.Title>
          <Typography.Paragraph
            style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, marginBlockStart: 16, marginBlockEnd: 32 }}
          >
            {cms['login.subtitle'] ?? t('login.marketingBody')}
          </Typography.Paragraph>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Feature icon={<SafetyCertificateFilled />} text={cms['login.feature.1'] ?? t('login.featureAudit')} />
            <Feature icon={<GlobalOutlined />} text={cms['login.feature.2'] ?? t('login.featureBilingual')} />
            <Feature icon={<FileDoneOutlined />} text={cms['login.feature.3'] ?? t('login.featureLedger')} />
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 12, gap: 16, flexWrap: 'wrap' }}>
          <span>
            © {new Date().getFullYear()} {cms['footer.tagline'] ?? 'Jamaat · A product of Ubrixy Technologies.'}
          </span>
          <span style={{ display: 'flex', gap: 12 }}>
            <Link to="/legal/terms" style={{ color: 'rgba(255,255,255,0.85)' }}>Terms</Link>
            <Link to="/legal/privacy" style={{ color: 'rgba(255,255,255,0.85)' }}>Privacy</Link>
            <Link to="/help/faq" style={{ color: 'rgba(255,255,255,0.85)' }}>FAQ</Link>
          </span>
        </div>
      </div>

      {/* RIGHT - form panel */}
      <div className="jm-login-form">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageSwitcher />
        </div>

        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ inlineSize: '100%', maxInlineSize: 380 }}>
            <Typography.Title level={2} style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>
              {t('login.title')}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBlockStart: 6, marginBlockEnd: 32, fontSize: 14 }}>
              {t('login.subtitle')}
            </Typography.Paragraph>

            <Form layout="vertical" onFinish={handleSubmit(onSubmit)} requiredMark={false}>
              <Form.Item
                label={t('login.email')}
                validateStatus={errors.email ? 'error' : ''}
                help={errors.email?.message}
              >
                <Input
                  {...register('email')}
                  value={emailValue}
                  onChange={(e) => setValue('email', e.target.value, { shouldValidate: true })}
                  size="large"
                  prefix={<MailOutlined style={{ color: 'var(--jm-gray-400)' }} />}
                  autoComplete="username"
                  autoFocus
                  placeholder="you@jamaat.local"
                />
              </Form.Item>
              <Form.Item
                label={t('login.password')}
                validateStatus={errors.password ? 'error' : ''}
                help={errors.password?.message}
              >
                <Input.Password
                  {...register('password')}
                  value={passwordValue}
                  onChange={(e) => setValue('password', e.target.value, { shouldValidate: true })}
                  size="large"
                  prefix={<LockOutlined style={{ color: 'var(--jm-gray-400)' }} />}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 20 }}>
                <Checkbox {...register('remember')}>{t('login.remember')}</Checkbox>
                <Button type="link" size="small" style={{ padding: 0 }} disabled>
                  {t('login.forgot')}
                </Button>
              </div>
              <div style={{ marginBlockEnd: 16, fontSize: 13, color: 'var(--jm-gray-500)' }}>
                Don't have an account? <Link to="/register">Apply for portal access</Link>
              </div>

              {error && <Alert type="error" message={error} showIcon style={{ marginBlockEnd: 16 }} />}

              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={isSubmitting}
                style={{ fontWeight: 500 }}
              >
                {t('login.submit')}
              </Button>
            </Form>

            {import.meta.env.DEV && (
              <Collapse
                ghost
                size="small"
                style={{ marginBlockStart: 24 }}
                items={[{
                  key: 'dev',
                  label: <Typography.Text type="secondary" style={{ fontSize: 12 }}>Development accounts - click to fill</Typography.Text>,
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {DEV_USERS.map((p) => (
                        <button
                          key={p.email}
                          type="button"
                          onClick={() => fillPersona(p.email, p.password)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--jm-surface-muted, #F5F5F5)',
                            border: '1px solid var(--jm-border, #E5E7EB)',
                            borderRadius: 6, padding: '6px 10px',
                            fontSize: 12, cursor: 'pointer',
                            textAlign: 'start',
                          }}
                        >
                          <Tag color={p.color} style={{ margin: 0, minInlineSize: 88, textAlign: 'center' }}>{p.role}</Tag>
                          <code style={{ fontSize: 11 }}>{p.email}</code>
                        </button>
                      ))}
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        All dev passwords: <code>Test@12345</code> (admin: <code>Admin@12345</code>). Hidden in production builds.
                      </Typography.Text>
                    </div>
                  ),
                }]}
              />
            )}
          </div>
        </div>
      </div>

      <style>{`
        .jm-login-root {
          min-block-size: 100dvh;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .jm-login-brand {
          position: relative;
          background: linear-gradient(135deg, #06403A 0%, #0B6E63 55%, #0E1B26 100%);
          color: #FFFFFF;
          padding: 48px 56px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }
        .jm-login-form {
          display: flex;
          flex-direction: column;
          padding: 24px 48px;
          background: #FFFFFF;
        }
        @media (max-width: 960px) {
          .jm-login-root { grid-template-columns: 1fr; }
          .jm-login-brand { padding: 32px 24px; min-block-size: 240px; }
          .jm-login-form { padding: 24px; }
        }
      `}</style>
    </div>
  );
}

const DEV_USERS: { role: string; email: string; password: string; color: string }[] = [
  { role: 'Administrator', email: 'admin@jamaat.local', password: 'Admin@12345', color: 'red' },
  { role: 'Cashier', email: 'cashier@jamaat.local', password: 'Test@12345', color: 'blue' },
  { role: 'Accountant', email: 'accountant@jamaat.local', password: 'Test@12345', color: 'gold' },
  { role: 'Event Mgr', email: 'events@jamaat.local', password: 'Test@12345', color: 'cyan' },
  { role: 'QH L1', email: 'qh-l1@jamaat.local', password: 'Test@12345', color: 'purple' },
  { role: 'QH L2', email: 'qh-l2@jamaat.local', password: 'Test@12345', color: 'magenta' },
  { role: 'Verifier', email: 'verifier@jamaat.local', password: 'Test@12345', color: 'geekblue' },
  { role: 'Viewer', email: 'viewer@jamaat.local', password: 'Test@12345', color: 'default' },
];

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>
      <span
        style={{
          inlineSize: 28,
          blockSize: 28,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(201,163,75,0.18)',
          color: '#C9A34B',
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}
