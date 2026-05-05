import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Alert, Typography, Space, Tag } from 'antd';
import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from './authApi';
import { authStore } from '../../shared/auth/authStore';
import { defaultLandingFor } from '../../shared/auth/routing';
import { extractProblem } from '../../shared/api/client';
import dayjs from 'dayjs';

/// /change-password
///
/// Two flows hit this page:
///
///   1. **Forced first-login** - the user just logged in with a temp password and the server
///      returned PasswordChangeRequiredResponse. LoginPage redirects here with state carrying
///      `identifier` and `temporaryPassword`. We POST /auth/complete-first-login on submit and
///      seed the session with the resulting JWT.
///
///   2. **Free-form rotation** - an already-authenticated user navigated here from their
///      profile menu. We POST /auth/change-password (which uses their existing JWT) and just
///      bounce them back to where they came from.
///
/// Visual chrome (brand-gradient backdrop, centered card) comes from `.jm-brand-backdrop` +
/// `.jm-brand-card` in portal.css. No inline styling for colours / spacing.
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navState = location.state as {
    identifier?: string; temporaryPassword?: string;
    expiresAtUtc?: string | null; returnTo?: string;
  } | null;

  const isForcedFlow = !!navState?.identifier;
  const isAuthenticated = !!authStore.getAccessToken();

  const [currentPassword, setCurrentPassword] = useState(navState?.temporaryPassword ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isForcedFlow && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isForcedFlow, isAuthenticated, navigate]);

  const expiresAt = navState?.expiresAtUtc ? dayjs(navState.expiresAtUtc) : null;
  const expiresInDays = expiresAt ? Math.ceil(expiresAt.diff(dayjs(), 'hour') / 24) : null;

  const validate = () => {
    if (newPassword.length < 8) return 'New password must be at least 8 characters.';
    if (newPassword === currentPassword) return 'New password must be different from the current one.';
    if (newPassword !== confirmPassword) return "Passwords don't match.";
    return null;
  };

  const onSubmit = async () => {
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    setSubmitting(true);
    try {
      if (isForcedFlow) {
        const res = await authApi.completeFirstLogin(navState!.identifier!, currentPassword, newPassword);
        const stored = {
          id: res.user.id, userName: res.user.userName, fullName: res.user.fullName,
          tenantId: res.user.tenantId, permissions: res.user.permissions,
          preferredLanguage: res.user.preferredLanguage,
          // Carry userType through so the SPA routes correctly. Without this the stored
          // session looks like userType=undefined, the next page that calls
          // resolveUserType() falls back to permission-shape inference, and any operator
          // user (Hybrid types in particular) gets misrouted.
          userType: res.user.userType ?? null,
        };
        authStore.setSession(res.accessToken, res.refreshToken, stored);
        // Use the same helper as LoginPage. Importantly, defaultLandingFor() ignores
        // the `from` argument when the user is type=Member - first-login flow had
        // navState.returnTo='/dashboard' baked in by LoginPage's default, which would
        // otherwise misroute Members to the operator dashboard right after they set
        // their first permanent password.
        const dest = defaultLandingFor(stored, navState?.returnTo ?? '/dashboard');
        navigate(dest, { replace: true });
      } else {
        await authApi.changePassword(currentPassword, newPassword);
        const back = searchParams.get('returnTo') ?? '/me';
        navigate(back, { replace: true });
      }
    } catch (err) {
      const p = extractProblem(err);
      setError(p.detail ?? p.title ?? 'Password change failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="jm-brand-backdrop">
      <Card className="jm-brand-card">
        <Space direction="vertical" size={4} className="jm-full-width">
          <SafetyCertificateOutlined className="jm-changepw-icon" />
          <Typography.Title level={3} className="jm-section-title">
            {isForcedFlow ? 'Set your new password' : 'Change password'}
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="jm-changepw-subtitle">
            {isForcedFlow
              ? 'Your account is using a temporary password. Choose a new one to finish signing in.'
              : 'Enter your current password and pick a new one.'}
          </Typography.Paragraph>
        </Space>

        {isForcedFlow && expiresInDays != null && (
          <Alert
            type={expiresInDays <= 1 ? 'warning' : 'info'}
            showIcon
            className="jm-alert-after-card"
            message={
              expiresInDays > 1
                ? <span>Temporary password valid for <Tag color="blue">{expiresInDays} days</Tag></span>
                : <span>Temporary password expires <Tag color="orange">{expiresAt!.fromNow()}</Tag></span>
            }
            description="Set a permanent password now to keep access."
          />
        )}

        <Form layout="vertical" requiredMark={false} onFinish={onSubmit} className="jm-changepw-form">
          {!isForcedFlow && (
            <Form.Item label="Current password">
              <Input.Password size="large" prefix={<LockOutlined />} value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password" autoFocus />
            </Form.Item>
          )}
          {isForcedFlow && (
            <Form.Item label="Temporary password">
              <Input.Password size="large" prefix={<LockOutlined />} value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="off" />
            </Form.Item>
          )}
          <Form.Item label="New password" help="At least 8 characters.">
            <Input.Password size="large" prefix={<LockOutlined />} value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" autoFocus={isForcedFlow} />
          </Form.Item>
          <Form.Item label="Confirm new password">
            <Input.Password size="large" prefix={<LockOutlined />} value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </Form.Item>

          {error && <Alert type="error" message={error} showIcon className="jm-changepw-alert" />}

          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            {isForcedFlow ? 'Set password and sign in' : 'Update password'}
          </Button>
          {!isForcedFlow && (
            <Button block onClick={() => navigate(-1)} className="jm-changepw-cancel">Cancel</Button>
          )}
        </Form>
      </Card>
    </div>
  );
}
