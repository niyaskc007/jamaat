import { useEffect, useState } from 'react';
import {
  Card, Form, Input, Button, Row, Col, Avatar, Upload, Typography, Tabs, Alert, Space, App as AntdApp,
  Divider, Switch, Select,
} from 'antd';
import { UserOutlined, UploadOutlined, MailOutlined, PhoneOutlined, GlobalOutlined, BellOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  portalMeApi, type PortalProfile, type UpdateContactDto, type UpdateAddressDto, type NotificationPrefs,
} from './portalMeApi';
import { extractProblem } from '../../../shared/api/client';

/// Self-edit profile form for /portal/me/profile. Two tabs (Contact + Address) — the most
/// common things a member changes about themselves. Submits create a MemberChangeRequest
/// (status=Pending) which goes through the existing admin approval queue. A banner shows
/// when any pending change is open so the member knows their last edit hasn't gone live yet.
export function ProfileEditForm() {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();

  const profileQ = useQuery({ queryKey: ['portal-profile'], queryFn: portalMeApi.profile });
  const pendingQ = useQuery({ queryKey: ['portal-pending-changes'], queryFn: portalMeApi.pendingChanges });

  const photoMut = useMutation({
    mutationFn: (file: File) => portalMeApi.uploadPhoto(file),
    onSuccess: () => {
      message.success('Photo updated.');
      void qc.invalidateQueries({ queryKey: ['portal-profile'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Photo upload failed.'),
  });

  if (profileQ.isLoading) return <Card loading className="jm-card" />;
  if (profileQ.isError) {
    return (
      <Card className="jm-card">
        <Alert
          type="error"
          message="Could not load your profile"
          description={extractProblem(profileQ.error).detail ?? 'Try refreshing the page. If this persists, contact your committee.'}
          showIcon
        />
      </Card>
    );
  }
  const profile = profileQ.data;
  if (!profile) return null;

  const pending = pendingQ.data ?? [];
  const pendingSections = new Set(pending.map((p) => p.section));

  return (
    <Card className="jm-card">
      {pending.length > 0 && (
        <Alert
          type="info" showIcon style={{ marginBlockEnd: 16 }}
          message="Pending review"
          description={`You have ${pending.length} change${pending.length === 1 ? '' : 's'} awaiting committee approval (${[...pendingSections].join(', ')}). New edits in those sections will queue behind it.`}
        />
      )}

      {/* Read-only header: name + ITS + photo */}
      <Row gutter={24} align="middle" style={{ marginBlockEnd: 16 }}>
        <Col flex="120px">
          <Avatar
            size={96}
            icon={<UserOutlined />}
            src={profile.photoUrl
              ? `${profile.photoUrl}${profile.photoUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
              : undefined}
          />
          <div style={{ marginBlockStart: 8 }}>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                if (file.size > 10 * 1024 * 1024) {
                  message.error('Photo must be smaller than 10 MB.');
                  return Upload.LIST_IGNORE;
                }
                photoMut.mutate(file as File);
                return false; // prevent default upload
              }}
            >
              <Button size="small" icon={<UploadOutlined />} loading={photoMut.isPending}>
                Change photo
              </Button>
            </Upload>
          </div>
        </Col>
        <Col flex="auto">
          <Typography.Title level={4} style={{ margin: 0 }}>{profile.fullName ?? '—'}</Typography.Title>
          <Typography.Text type="secondary">ITS <span className="jm-tnum">{profile.itsNumber ?? '—'}</span></Typography.Text>
          <div style={{ marginBlockStart: 6, fontSize: 12, color: 'var(--jm-gray-500)' }}>
            Name and identity changes are admin-only. Contact your committee to update them.
          </div>
        </Col>
      </Row>

      <Divider />

      <Tabs
        defaultActiveKey="contact"
        items={[
          {
            key: 'contact',
            label: <span><MailOutlined /> Contact</span>,
            children: <ContactTab profile={profile} blocked={pendingSections.has('Contact')} />,
          },
          {
            key: 'address',
            label: <span><GlobalOutlined /> Address</span>,
            children: <AddressTab profile={profile} blocked={pendingSections.has('Address')} />,
          },
          {
            key: 'notifications',
            label: <span><BellOutlined /> Notifications</span>,
            children: <NotificationsTab />,
          },
        ]}
      />
    </Card>
  );
}

function ContactTab({ profile, blocked }: { profile: PortalProfile; blocked: boolean }) {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<UpdateContactDto>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: UpdateContactDto) => {
    setSubmitting(true);
    try {
      await portalMeApi.submitContact(values);
      message.success('Change request submitted. Awaiting committee approval.');
      void qc.invalidateQueries({ queryKey: ['portal-pending-changes'] });
    } catch (e) {
      message.error(extractProblem(e).detail ?? 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {blocked && (
        <Alert
          type="warning" showIcon style={{ marginBlockEnd: 16 }}
          message="Contact change pending"
          description="A previous change to your contact details is still awaiting review. You can submit another, but it will queue behind the first one."
        />
      )}
      <Form
        layout="vertical"
        form={form}
        initialValues={{
          phone: profile.phone, whatsAppNo: profile.whatsAppNo, email: profile.email,
          linkedInUrl: profile.linkedInUrl, facebookUrl: profile.facebookUrl,
          instagramUrl: profile.instagramUrl, twitterUrl: profile.twitterUrl,
          websiteUrl: profile.websiteUrl,
        }}
        onFinish={submit}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="phone" label="Phone" rules={[{ max: 32 }]}>
              <Input prefix={<PhoneOutlined />} placeholder="+9715xxxxxxx" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="whatsAppNo" label="WhatsApp" rules={[{ max: 32 }]}>
              <Input prefix={<PhoneOutlined />} placeholder="+9715xxxxxxx" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email' }, { max: 200 }]}>
              <Input prefix={<MailOutlined />} placeholder="you@example.com" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="websiteUrl" label="Website" rules={[{ type: 'url' }, { max: 500 }]}>
              <Input prefix={<GlobalOutlined />} placeholder="https://" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}><Form.Item name="linkedInUrl" label="LinkedIn" rules={[{ type: 'url' }, { max: 500 }]}><Input placeholder="https://linkedin.com/in/..." /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="facebookUrl" label="Facebook" rules={[{ type: 'url' }, { max: 500 }]}><Input placeholder="https://facebook.com/..." /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="instagramUrl" label="Instagram" rules={[{ type: 'url' }, { max: 500 }]}><Input placeholder="https://instagram.com/..." /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="twitterUrl" label="Twitter / X" rules={[{ type: 'url' }, { max: 500 }]}><Input placeholder="https://x.com/..." /></Form.Item></Col>
        </Row>
        <Space>
          <Button type="primary" htmlType="submit" loading={submitting}>Submit for review</Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Changes go live after committee approval.</Typography.Text>
        </Space>
      </Form>
    </div>
  );
}

function AddressTab({ profile, blocked }: { profile: PortalProfile; blocked: boolean }) {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<UpdateAddressDto>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: UpdateAddressDto) => {
    setSubmitting(true);
    try {
      await portalMeApi.submitAddress(values);
      message.success('Change request submitted. Awaiting committee approval.');
      void qc.invalidateQueries({ queryKey: ['portal-pending-changes'] });
    } catch (e) {
      message.error(extractProblem(e).detail ?? 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {blocked && (
        <Alert
          type="warning" showIcon style={{ marginBlockEnd: 16 }}
          message="Address change pending"
          description="A previous change to your address is still awaiting review. You can submit another, but it will queue behind the first one."
        />
      )}
      <Form
        layout="vertical"
        form={form}
        initialValues={{
          addressLine: profile.addressLine, building: profile.building, street: profile.street,
          area: profile.area, city: profile.city, state: profile.state, pincode: profile.pincode,
        }}
        onFinish={submit}
      >
        <Form.Item name="addressLine" label="Address line" rules={[{ max: 500 }]}>
          <Input.TextArea rows={2} placeholder="Apartment 3B, Building 1234" />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="building" label="Building" rules={[{ max: 200 }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="street" label="Street" rules={[{ max: 200 }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="area" label="Area" rules={[{ max: 200 }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="city" label="City" rules={[{ max: 200 }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="state" label="State / Emirate" rules={[{ max: 200 }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="pincode" label="Postal code" rules={[{ max: 32 }]}><Input className="jm-tnum" /></Form.Item></Col>
        </Row>
        <Space>
          <Button type="primary" htmlType="submit" loading={submitting}>Submit for review</Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Changes go live after committee approval.</Typography.Text>
        </Space>
      </Form>
    </div>
  );
}

const NOTIF_KINDS: { key: string; title: string; description: string }[] = [
  { key: 'CommitmentInstallmentDue', title: 'Commitment installment due', description: 'Reminder 3 days before each installment due date.' },
  { key: 'QhStateChanged',           title: 'Qarzan Hasana updates',       description: 'When your loan moves between approval / disbursement states.' },
  { key: 'EventReminderT24h',        title: 'Event reminders',             description: '24 hours before each event you are confirmed for.' },
];

function NotificationsTab() {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [dirty, setDirty] = useState(false);

  const prefsQ = useQuery({ queryKey: ['portal-notification-prefs'], queryFn: portalMeApi.getNotificationPrefs });

  // Hydrate local state once data loads. Defaults: all kinds enabled, channel = auto (null).
  useEffect(() => {
    if (prefsQ.data) {
      const enabled: Record<string, boolean> = {};
      for (const k of NOTIF_KINDS) enabled[k.key] = prefsQ.data.enabledKinds?.[k.key] ?? true;
      setPrefs({ enabledKinds: enabled, preferredChannel: prefsQ.data.preferredChannel ?? null });
      setDirty(false);
    }
  }, [prefsQ.data]);

  const saveMut = useMutation({
    mutationFn: (p: NotificationPrefs) => portalMeApi.setNotificationPrefs(p),
    onSuccess: () => {
      message.success('Preferences saved.');
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['portal-notification-prefs'] });
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed.'),
  });

  if (prefsQ.isLoading || !prefs) return <Card loading className="jm-card" />;

  const toggle = (key: string, on: boolean) => {
    setPrefs((p) => p && ({ ...p, enabledKinds: { ...p.enabledKinds, [key]: on } }));
    setDirty(true);
  };
  const setChannel = (v: NotificationPrefs['preferredChannel']) => {
    setPrefs((p) => p && ({ ...p, preferredChannel: v }));
    setDirty(true);
  };

  return (
    <div>
      <Alert
        type="info" showIcon style={{ marginBlockEnd: 16 }}
        message="How notifications work"
        description="The system picks the best channel available (WhatsApp > SMS > email) by default. Set a preferred channel below to override. Each notification type can be muted independently. Updates are written to a server-side audit log even when delivery is in log-only mode."
      />

      <Card size="small" className="jm-card" style={{ marginBlockEnd: 16 }}>
        <Typography.Text type="secondary" className="jm-overline">Preferred channel</Typography.Text>
        <div style={{ marginBlockStart: 8 }}>
          <Select
            value={prefs.preferredChannel ?? 'auto'}
            onChange={(v) => setChannel(v === 'auto' ? null : (v as NotificationPrefs['preferredChannel']))}
            style={{ inlineSize: 220 }}
            options={[
              { value: 'auto',     label: 'Auto (best available)' },
              { value: 'Email',    label: 'Email' },
              { value: 'Sms',      label: 'SMS' },
              { value: 'WhatsApp', label: 'WhatsApp' },
            ]}
          />
        </div>
      </Card>

      <Card size="small" className="jm-card">
        <Typography.Text type="secondary" className="jm-overline">Notification types</Typography.Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBlockStart: 12 }}>
          {NOTIF_KINDS.map((k) => (
            <div key={k.key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{k.title}</div>
                <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{k.description}</div>
              </div>
              <Switch
                checked={prefs.enabledKinds[k.key] !== false}
                onChange={(on) => toggle(k.key, on)}
              />
            </div>
          ))}
        </div>
      </Card>

      <Space style={{ marginBlockStart: 16 }}>
        <Button type="primary" disabled={!dirty} loading={saveMut.isPending} onClick={() => saveMut.mutate(prefs)}>
          Save preferences
        </Button>
        {!dirty && <Typography.Text type="secondary" style={{ fontSize: 12 }}>No unsaved changes.</Typography.Text>}
      </Space>
    </div>
  );
}
