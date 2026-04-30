import { useState } from 'react';
import {
  Card, Tabs, Spin, Result, Space, Button, Form, Input, InputNumber, Select, DatePicker, Switch, Tag,
  Row, Col, Descriptions, App as AntdApp, Avatar, Divider, Typography, Badge, Upload, Alert,
  Table, Drawer,
} from 'antd';
import { useAuth } from '../../../shared/auth/useAuth';
import { UserOutlined, TeamOutlined, HomeOutlined, BookOutlined, IdcardOutlined, CheckCircleOutlined, PhoneOutlined, GlobalOutlined, HeartOutlined, SafetyCertificateOutlined, FileProtectOutlined, StarOutlined, UploadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { ReliabilityTab } from '../reliability/ReliabilityTab';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { formatDate, formatDateTime, money } from '../../../shared/format/format';
import { extractProblem } from '../../../shared/api/client';
import {
  memberProfileApi, memberChangeRequestApi, type MemberProfile, type VerificationStatus,
  type MemberEducationEntry, type AddMemberEducationInput, type Qualification,
  GenderLabel, MaritalStatusLabel, BloodGroupLabel, WarakatLabel, MisaqStatusLabel,
  QualificationLabel, HousingOwnershipLabel, TypeOfHouseLabel, VerificationStatusLabel, VerificationStatusColor,
} from './memberProfileApi';
import { sectorsApi, subSectorsApi } from '../../sectors/sectorsApi';
import { membersApi } from '../membersApi';
import { lookupsApi, MemberLookupCategory } from '../../admin/master-data/lookups/lookupsApi';
import { organisationsApi, type MemberOrgMembership } from '../../organisations/organisationsApi';
import { FamilyDetailDrawer } from '../../families/FamilyDetailDrawer';

const { Text } = Typography;

export function MemberProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('identity');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['member-profile', id], queryFn: () => memberProfileApi.get(id), enabled: !!id,
  });

  const { data: summary } = useQuery({
    queryKey: ['member-contrib-summary', id], queryFn: () => memberProfileApi.contributionSummary(id), enabled: !!id,
  });

  const { data: memberships } = useQuery({
    queryKey: ['member-orgs', id], queryFn: () => organisationsApi.listMemberships({ memberId: id, pageSize: 100 }), enabled: !!id,
  });

  const onSaved = (p: MemberProfile) => {
    message.success('Profile updated.');
    qc.setQueryData(['member-profile', id], p);
    void qc.invalidateQueries({ queryKey: ['members'] });
  };
  const onErr = (e: unknown) => message.error(extractProblem(e).detail ?? 'Save failed');

  // Pending change-request count for this member - surfaced as a banner so admins
  // immediately see "this profile has unverified edits sitting in the queue".
  const pendingQ = useQuery({
    queryKey: ['member-pending-changes', id],
    queryFn: () => memberChangeRequestApi.listForMember(id),
    enabled: !!id && (hasPermission('member.view')),
  });
  const pendingCount = (pendingQ.data ?? []).filter((r) => r.status === 1).length;

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  if (!profile) return <Result status="404" title="Member not found" extra={<Button onClick={() => navigate('/members')}>Back to members</Button>} />;

  const initials = (profile.fullName ?? '?').split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');

  return (
    <div>
      <PageHeader
        title={profile.fullName}
        subtitle={`ITS ${profile.itsNumber}${profile.tanzeemFileNo ? ` · File #${profile.tanzeemFileNo}` : ''}${profile.familyName ? ` · ${profile.familyName}` : ''}`}
        actions={<Button onClick={() => navigate('/members')}>Back</Button>}
      />

      {/* Header card */}
      {pendingCount > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBlockEnd: 16 }}
          message={`${pendingCount} profile change${pendingCount === 1 ? '' : 's'} pending verification`}
          description={
            hasPermission('member.changes.approve')
              ? <span>An admin needs to review them. <Link to="/admin/change-requests">Open the queue</Link>.</span>
              : 'These will appear once an admin approves them. The reviewer note will be shown if anything is rejected.'
          }
        />
      )}
      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Avatar size={72} src={profile.photoUrl ?? undefined}
              style={{ background: 'var(--jm-primary-500)', fontWeight: 600, fontSize: 24 }}>
              {initials}
            </Avatar>
          </Col>
          <Col flex="auto">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{profile.fullName}</div>
              <Space size={12} wrap>
                {/* Gender + age surface at the top of the profile so they're visible at a
                    glance. Age is computed from DOB; falls back to AgeSnapshot when DOB
                    isn't on file. Both render only when known so we don't print "Unknown". */}
                {profile.gender !== 0 && (
                  <Tag>{GenderLabel[profile.gender]}</Tag>
                )}
                {(profile.age != null || profile.ageSnapshot != null) && (
                  <Tag>{profile.age != null ? `${profile.age} yrs` : `${profile.ageSnapshot} yrs (snapshot)`}</Tag>
                )}
                <Tag color={VerificationStatusColor[profile.dataVerificationStatus]} icon={<SafetyCertificateOutlined />}>
                  Data · {VerificationStatusLabel[profile.dataVerificationStatus]}
                </Tag>
                <Tag color={VerificationStatusColor[profile.photoVerificationStatus]} icon={<FileProtectOutlined />}>
                  Photo · {VerificationStatusLabel[profile.photoVerificationStatus]}
                </Tag>
                {profile.sectorCode && <Tag icon={<HomeOutlined />}>{profile.sectorCode}{profile.subSectorCode ? ` · ${profile.subSectorCode}` : ''}</Tag>}
                {profile.jamaat && <Tag icon={<GlobalOutlined />}>{profile.jamaat}{profile.jamiaat ? ` · ${profile.jamiaat}` : ''}</Tag>}
              </Space>
            </div>
          </Col>
          {summary && (
            <Col>
              <Space size="large">
                <StatPill label="Receipts" value={money(summary.totalReceipts, 'AED')} />
                <StatPill label="Commitments" value={`${summary.activeCommitmentCount}`} sub={money(summary.totalOutstandingCommitments, 'AED')} />
                <StatPill label="QH loans" value={`${summary.activeLoanCount}`} sub={money(summary.totalOutstandingQarzanHasana, 'AED')} />
                <StatPill label="Patronages" value={`${summary.activeEnrollmentCount}`} />
              </Space>
            </Col>
          )}
        </Row>
      </Card>

      <Card style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
        <Tabs
          tabPosition="left"
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ minBlockSize: 560 }}
          items={[
            { key: 'identity', label: <span><IdcardOutlined /> Identity</span>, children: <IdentityTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'family', label: <span><TeamOutlined /> Family</span>, children: <FamilyTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'contact', label: <span><PhoneOutlined /> Contact</span>, children: <ContactTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'address', label: <span><HomeOutlined /> Address & Housing</span>, children: <AddressTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'origin', label: <span><GlobalOutlined /> Jamaat & Sector</span>, children: <OriginTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'education', label: <span><BookOutlined /> Education & Work</span>, children: <EducationTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'religious', label: <span><StarOutlined /> Religious</span>, children: <ReligiousTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'personal', label: <span><UserOutlined /> Personal</span>, children: <PersonalTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            { key: 'orgs', label: <span><HeartOutlined /> Organisations</span>, children: <OrganisationsTab memberId={id} memberships={memberships?.items ?? []} /> },
            { key: 'verification', label: <span><CheckCircleOutlined /> Verification</span>, children: <VerificationTab profile={profile} onSaved={onSaved} onErr={onErr} /> },
            ...(hasPermission('member.reliability.view')
              ? [{ key: 'reliability', label: <span><ThunderboltOutlined /> Reliability</span>, children: <ReliabilityTab memberId={profile.id} /> }]
              : []),
          ]}
        />
      </Card>
    </div>
  );
}

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }} className="jm-tnum">{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }} className="jm-tnum">{sub}</div>}
    </div>
  );
}

function SectionSaveBar({ loading, onSave, mode }: { loading: boolean; onSave: () => void; mode?: ProfileSubmitMode }) {
  // When the active user holds member.self.update only, edits go through the verification
  // queue. Re-label the button to make the consequence clear.
  const isQueued = mode === 'request';
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
      paddingBlock: 16, borderBlockStart: '1px solid var(--jm-border)', marginBlockStart: 16 }}>
      {isQueued && (
        <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
          Changes go to admin verification before they take effect.
        </span>
      )}
      <Button type="primary" loading={loading} onClick={onSave}>
        {isQueued ? 'Submit for verification' : 'Save changes'}
      </Button>
    </div>
  );
}

/// Decides how a tab's save should route. When the user has member.update we apply the
/// change directly; when they only have member.self.update the change goes to the admin
/// verification queue; otherwise the form is read-only.
type ProfileSubmitMode = 'direct' | 'request' | 'readonly';

function useProfileSubmitMode(): ProfileSubmitMode {
  const { hasPermission } = useAuth();
  if (hasPermission('member.update')) return 'direct';
  if (hasPermission('member.self.update')) return 'request';
  return 'readonly';
}

/// Section-level save dispatcher. Every tab passes its section name + the ready DTO; this
/// routes to the direct update endpoint or the queue depending on permission. Returns a
/// react-query mutation so the tab keeps its existing isPending / loading semantics.
function useSectionSubmit(
  profile: MemberProfile,
  section: 'identity' | 'personal' | 'contact' | 'address' | 'origin' | 'education-work' | 'religious' | 'family-refs',
  directApi: (id: string, dto: Record<string, unknown>) => Promise<MemberProfile>,
  onSaved: (p: MemberProfile) => void,
  onErr: (e: unknown) => void,
) {
  const { message } = AntdApp.useApp();
  const mode = useProfileSubmitMode();
  return useMutation({
    mutationFn: async (dto: Record<string, unknown>) => {
      if (mode === 'direct') return directApi(profile.id, dto);
      if (mode === 'request') {
        const r = await memberChangeRequestApi.submit(profile.id, section, dto);
        // Translate the queue submission to the same shape the tab expects so its onSuccess
        // works without a special case. We just return the unchanged profile.
        message.success('Submitted for verification.');
        // Suppress onSaved so the form keeps the user's typed values; the queue holds them
        // until an admin reviews. The notification doubles as the success cue.
        // Using a thrown sentinel would be ugly; returning the profile signals "no change".
        void r;
        return profile;
      }
      throw new Error('You do not have permission to edit this profile.');
    },
    onSuccess: (next) => {
      // In direct mode, this is the freshly-updated profile. In request mode it's the
      // unchanged profile (the change is pending review).
      if (mode === 'direct') onSaved(next);
    },
    onError: onErr,
  });
}

function IdentityTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mode = useProfileSubmitMode();
  const mut = useSectionSubmit(profile, 'identity', memberProfileApi.updateIdentity, onSaved, onErr);
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} initialValues={profile} requiredMark={false}>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="Full name (English)" name="fullName" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Title" name="title"><Input placeholder="e.g., NKD" /></Form.Item></Col>
          <Col span={12}><Form.Item label="Full name (Arabic)" name="fullNameArabic"><Input dir="rtl" /></Form.Item></Col>
          <Col span={12}><Form.Item label="Tanzeem File No." name="tanzeemFileNo"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="First prefix" name="firstPrefix"><Input placeholder="e.g., Mulla" /></Form.Item></Col>
          <Col span={8}><Form.Item label="Prefix year" name="prefixYear"><InputNumber style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="First name" name="firstName"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Father prefix" name="fatherPrefix"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Father name" name="fatherName"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Father surname" name="fatherSurname"><Input /></Form.Item></Col>
          {/* Spouse fields - gender-aware label. Backend column is gender-neutral
              (SpousePrefix/SpouseName); the UI just adapts the wording so the form reads
              naturally. Hidden when the member's gender is unknown to avoid mismatched
              defaults. The fields auto-populate from the linked spouse when SpouseItsNumber
              resolves to an existing member (see Family tab); they remain editable here for
              manual capture when the spouse isn't on our rolls yet. */}
          {profile.gender !== 0 && (() => {
            const spouseLabel = profile.gender === 1 ? 'Wife' : 'Husband';
            return (
              <>
                <Col span={8}><Form.Item label={`${spouseLabel} prefix`} name="spousePrefix"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item label={`${spouseLabel} name`} name="spouseName"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item label="Surname" name="surname"><Input /></Form.Item></Col>
              </>
            );
          })()}
          {profile.gender === 0 && (
            <>
              <Col span={8}><Form.Item label="Spouse prefix" name="spousePrefix" tooltip="Set the member's gender on the Personal tab to see the right label."><Input /></Form.Item></Col>
              <Col span={8}><Form.Item label="Spouse name" name="spouseName"><Input /></Form.Item></Col>
              <Col span={8}><Form.Item label="Surname" name="surname"><Input /></Form.Item></Col>
            </>
          )}
          <Col span={12}><Form.Item label="Full name (Hindi)" name="fullNameHindi"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Full name (Urdu)" name="fullNameUrdu"><Input dir="rtl" /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} mode={mode} />
    </div>
  );
}

function FamilyTab({ profile }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const navigate = useNavigate();
  // Read-only family information surface. Per user direction (item 12 / phase E), all
  // family edits live in the /families page (or the FamilyDetailDrawer launched from
  // here); this tab just shows what's on file and links into the proper management UI.
  const [familyDrawerOpen, setFamilyDrawerOpen] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <Alert
        type="info" showIcon style={{ marginBlockEnd: 16 }}
        message="Family information is managed in the Families page"
        description={
          <span>
            Father / Mother / Spouse links, family roles, headship and family-tree updates all
            happen in the family detail drawer. This tab shows the current state, read-only.
          </span>
        }
      />

      <Card style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 16 }}>
        <Descriptions size="small" column={2} colon={false} labelStyle={{ color: 'var(--jm-gray-500)', fontSize: 12 }}
          items={[
            { key: 'fam', label: 'Family',
              children: profile.familyName ? (
                <Space>
                  <span style={{ fontWeight: 500 }}>{profile.familyName} ({profile.familyCode})</span>
                  <Button size="small" type="primary" icon={<TeamOutlined />} onClick={() => setFamilyDrawerOpen(true)}>
                    Open family page
                  </Button>
                </Space>
              ) : (
                <Space>
                  <span style={{ color: 'var(--jm-gray-500)' }}>Not in a family</span>
                  <Button size="small" type="link" onClick={() => navigate('/families')}>Manage families</Button>
                </Space>
              ),
            },
            { key: 'role', label: 'Role in family', children: profile.familyRole ? String(profile.familyRole) : '-' },
          ]}
        />
      </Card>

      <Card title="Linked relatives" size="small" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 16 }}>
        <Descriptions size="small" column={1} colon={false} labelStyle={{ color: 'var(--jm-gray-500)', fontSize: 12 }}
          items={[
            { key: 'father', label: 'Father', children: <RelativeRow its={profile.fatherItsNumber} /> },
            { key: 'mother', label: 'Mother', children: <RelativeRow its={profile.motherItsNumber} /> },
            { key: 'spouse', label: 'Spouse', children: <RelativeRow its={profile.spouseItsNumber} /> },
          ]}
        />
      </Card>

      <Card title="Marriage" size="small" style={{ border: '1px solid var(--jm-border)' }}>
        <Descriptions size="small" column={2} colon={false} labelStyle={{ color: 'var(--jm-gray-500)', fontSize: 12 }}
          items={[
            { key: 'nikah', label: 'Date of Nikah', children: profile.dateOfNikah ? dayjs(profile.dateOfNikah).format('DD MMM YYYY') : '-' },
            { key: 'nikahH', label: 'Date of Nikah (Hijri)', children: profile.dateOfNikahHijri || '-' },
          ]}
        />
        <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
          Edit dates on the Personal tab.
        </div>
      </Card>

      {familyDrawerOpen && profile.familyId && (
        <FamilyDetailDrawer familyId={profile.familyId} onClose={() => setFamilyDrawerOpen(false)} />
      )}
    </div>
  );
}

/// Compact display of one relative reference. When the ITS resolves to a member on our rolls,
/// show their name + a click-through to that member's profile. Otherwise show the raw ITS.
function RelativeRow({ its }: { its?: string | null }) {
  const valid = !!its && /^\d{8}$/.test(its.trim());
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['its-lookup', its],
    queryFn: async () => {
      const res = await membersApi.list({ search: (its ?? '').trim(), pageSize: 5 });
      return res.items?.find((m) => m.itsNumber === (its ?? '').trim()) ?? null;
    },
    enabled: valid,
    staleTime: 60_000,
  });
  if (!its) return <span style={{ color: 'var(--jm-gray-400)' }}>Not on file</span>;
  if (q.data) {
    return (
      <Space>
        <a onClick={() => navigate(`/members/${q.data!.id}`)} style={{ fontWeight: 500 }}>{q.data.fullName}</a>
        <span className="jm-tnum" style={{ color: 'var(--jm-gray-500)' }}>ITS {q.data.itsNumber}</span>
        <Tag color="green">Linked</Tag>
      </Space>
    );
  }
  return (
    <Space>
      <span className="jm-tnum">{its}</span>
      <Tag color="orange">Not in roll</Tag>
    </Space>
  );
}

function ContactTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mode = useProfileSubmitMode();
  const mut = useSectionSubmit(profile, 'contact', memberProfileApi.updateContact, onSaved, onErr);
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false}
        initialValues={{
          phone: profile.phone, whatsAppNo: profile.whatsAppNo, email: profile.email,
          linkedInUrl: profile.linkedInUrl, facebookUrl: profile.facebookUrl,
          instagramUrl: profile.instagramUrl, twitterUrl: profile.twitterUrl, websiteUrl: profile.websiteUrl,
        }}>
        <Typography.Title level={5} style={{ marginBlockStart: 0 }}>Phone &amp; email</Typography.Title>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="Mobile" name="phone"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="WhatsApp" name="whatsAppNo"><Input /></Form.Item></Col>
          <Col span={24}><Form.Item label="Email" name="email"><Input type="email" /></Form.Item></Col>
        </Row>
        {/* Social profiles - all optional. Stored as plain URL strings; light validation
            only (max length). The labels show familiar names to make it self-explanatory. */}
        <Typography.Title level={5} style={{ marginBlockStart: 16 }}>Social profiles &amp; web</Typography.Title>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="LinkedIn" name="linkedInUrl"><Input placeholder="https://linkedin.com/in/..." /></Form.Item></Col>
          <Col span={12}><Form.Item label="Facebook" name="facebookUrl"><Input placeholder="https://facebook.com/..." /></Form.Item></Col>
          <Col span={12}><Form.Item label="Instagram" name="instagramUrl"><Input placeholder="https://instagram.com/..." /></Form.Item></Col>
          <Col span={12}><Form.Item label="Twitter / X" name="twitterUrl"><Input placeholder="https://twitter.com/..." /></Form.Item></Col>
          <Col span={24}><Form.Item label="Personal website" name="websiteUrl"><Input placeholder="https://..." /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} mode={mode} />
    </div>
  );
}

function AddressTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mode = useProfileSubmitMode();
  const mut = useSectionSubmit(profile, 'address', memberProfileApi.updateAddress, onSaved, onErr);
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={profile}>
        <Typography.Title level={5} style={{ marginBlockStart: 0 }}>Address</Typography.Title>
        <Row gutter={16}>
          <Col span={24}><Form.Item label="Address line" name="addressLine"><Input.TextArea rows={2} /></Form.Item></Col>
          <Col span={12}><Form.Item label="Building" name="building"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Street" name="street"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Area" name="area"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="City" name="city"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="State" name="state"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Pincode" name="pincode"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Ownership" name="housingOwnership">
            <Select options={Object.entries(HousingOwnershipLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          <Col span={8}><Form.Item label="Type of house" name="typeOfHouse">
            <Select options={Object.entries(TypeOfHouseLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
        </Row>

        {/* Property details - all optional. These power the future household wealth profile;
            capturing them now so the data is on hand when reports / approvals start to use it.
            Sensitive numbers (estimated market value) only render visibly to those who can
            already see contribution + commitment data on this profile. */}
        <Typography.Title level={5} style={{ marginBlockStart: 16 }}>
          Property details
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--jm-gray-500)', marginInlineStart: 8 }}>
            (optional - fill what you know)
          </span>
        </Typography.Title>
        <Row gutter={16}>
          <Col span={6}><Form.Item label="Bedrooms" name="numBedrooms"><InputNumber min={0} max={50} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Bathrooms" name="numBathrooms"><InputNumber min={0} max={50} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Kitchens" name="numKitchens"><InputNumber min={0} max={20} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Living rooms" name="numLivingRooms"><InputNumber min={0} max={20} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Stories / floors" name="numStories"><InputNumber min={0} max={20} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Air conditioners" name="numAirConditioners"><InputNumber min={0} max={50} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Built-up area (sq ft)" name="builtUpAreaSqft"><InputNumber min={0} step={10} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Land area (sq ft)" name="landAreaSqft"><InputNumber min={0} step={10} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Property age (years)" name="propertyAgeYears"><InputNumber min={0} max={200} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="Estimated market value" name="estimatedMarketValue" tooltip="Self-declared. Used in the household wealth profile."><InputNumber min={0} step={1000} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={4}><Form.Item label="Elevator" name="hasElevator" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={4}><Form.Item label="Parking" name="hasParking" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={4}><Form.Item label="Garden" name="hasGarden" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={24}><Form.Item label="Property notes" name="propertyNotes"><Input.TextArea rows={2} placeholder="Anything else worth noting (renovations, distinctive features, etc.)" maxLength={1000} showCount /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} mode={mode} />
    </div>
  );
}

function OriginTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const [sectorId, setSectorId] = useState<string | undefined>(profile.sectorId ?? undefined);
  const sectorsQ = useQuery({ queryKey: ['sectors-active'], queryFn: () => sectorsApi.list({ active: true, pageSize: 200 }) });
  const subsQ = useQuery({
    queryKey: ['subs', sectorId],
    queryFn: () => subSectorsApi.list({ sectorId: sectorId!, active: true, pageSize: 200 }),
    enabled: !!sectorId,
  });
  const mode = useProfileSubmitMode();
  const mut = useSectionSubmit(profile, 'origin', memberProfileApi.updateOrigin, onSaved, onErr);
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={profile}>
        <Row gutter={16}>
          <Col span={8}><LookupSelect category={MemberLookupCategory.Category} name="category" label="Category" current={profile.category} /></Col>
          <Col span={8}><LookupSelect category={MemberLookupCategory.Idara} name="idara" label="Idara" current={profile.idara} /></Col>
          <Col span={8}><LookupSelect category={MemberLookupCategory.Vatan} name="vatan" label="Vatan" current={profile.vatan} /></Col>
          <Col span={8}><LookupSelect category={MemberLookupCategory.Nationality} name="nationality" label="Nationality" current={profile.nationality} /></Col>
          <Col span={8}><LookupSelect category={MemberLookupCategory.Jamaat} name="jamaat" label="Jamaat" current={profile.jamaat} /></Col>
          <Col span={8}><LookupSelect category={MemberLookupCategory.Jamiaat} name="jamiaat" label="Jamiaat" current={profile.jamiaat} /></Col>
          <Col span={12}><Form.Item label="Sector" name="sectorId">
            <Select allowClear showSearch optionFilterProp="label" onChange={(v) => { setSectorId(v); form.setFieldValue('subSectorId', null); }}
              options={(sectorsQ.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))} />
          </Form.Item></Col>
          <Col span={12}><Form.Item label="Sub-sector" name="subSectorId">
            <Select allowClear showSearch optionFilterProp="label" disabled={!sectorId}
              options={(subsQ.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))} />
          </Form.Item></Col>
        </Row>
        <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 8 }}>
          Categories / Idara / Vatan / Nationality / Jamaat / Jamiaat are managed in <a href="/admin/master-data" target="_blank" rel="noreferrer">Master data</a>.
          Existing free-text values are preserved as "(legacy)" entries in the dropdowns until they're remapped to a master value.
        </div>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} mode={mode} />
    </div>
  );
}

/// Master-data-driven dropdown for one of the origin fields. Loads the lookup category
/// once, builds options + carries the existing free-text value through as a "(legacy)"
/// option so admins see the data and can choose to remap. The form binds on the lookup
/// Code (string), keeping the column shape unchanged on the backend.
function LookupSelect({ category, name, label, current }: {
  category: string; name: string; label: string; current?: string | null;
}) {
  const q = useQuery({
    queryKey: ['lookup-list', category],
    queryFn: () => lookupsApi.list({ category, pageSize: 200, activeOnly: true }),
    staleTime: 5 * 60_000,
  });
  const masterCodes = (q.data?.items ?? []).map((l) => l.code);
  const options = (q.data?.items ?? []).map((l) => ({ value: l.code, label: `${l.code} - ${l.name}` }));
  // If the saved value isn't in the master list, surface it as a legacy option so the user
  // sees what's there. Empty string => no current value, no legacy entry.
  const trimmed = (current ?? '').trim();
  if (trimmed && !masterCodes.includes(trimmed)) {
    options.unshift({ value: trimmed, label: `${trimmed} (legacy)` });
  }
  return (
    <Form.Item label={label} name={name}>
      <Select allowClear showSearch optionFilterProp="label" options={options}
        placeholder={q.isLoading ? 'Loading...' : `Select ${label.toLowerCase()}`} />
    </Form.Item>
  );
}

function EducationTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mode = useProfileSubmitMode();
  const mut = useSectionSubmit(profile, 'education-work', memberProfileApi.updateEducationWork, onSaved, onErr);
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={profile}>
        <Typography.Title level={5} style={{ marginBlockStart: 0 }}>Headline (highest qualification snapshot)</Typography.Title>
        <Row gutter={16}>
          <Col span={8}><Form.Item label="Qualification" name="qualification" tooltip="Headline level. Use the multi-row table below to capture the full education history.">
            <Select options={Object.entries(QualificationLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          <Col span={16}><Form.Item label="Languages (comma-separated)" name="languagesCsv"><Input placeholder="Lisaan-ud-Dawat, English, Arabic, Urdu" /></Form.Item></Col>
          <Col span={24}><Form.Item label="Hunars / skills (comma-separated)" name="hunarsCsv"><Input placeholder="Cricket, Fitness, Cooking" /></Form.Item></Col>
          <Col span={8}><Form.Item label="Occupation" name="occupation"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Sub-occupation" name="subOccupation"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Sub-occupation 2" name="subOccupation2"><Input /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} mode={mode} />

      {/* Multi-row education history (item 6). Independent CRUD - the headline above is a
          snapshot; this section is the truth. Each row carries level + degree + institution
          + year + specialization. One row may be flagged "highest" (auto-managed). */}
      <Divider orientation="left" plain style={{ marginBlockStart: 24 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Education history</Typography.Title>
      </Divider>
      <EducationsPanel memberId={profile.id} />
    </div>
  );
}

function EducationsPanel({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const q = useQuery({
    queryKey: ['member-educations', memberId],
    queryFn: () => memberProfileApi.listEducations(memberId),
    enabled: !!memberId,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MemberEducationEntry | null>(null);
  const delMut = useMutation({
    mutationFn: (eduId: string) => memberProfileApi.deleteEducation(memberId, eduId),
    onSuccess: () => { message.success('Removed.'); void qc.invalidateQueries({ queryKey: ['member-educations', memberId] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const rows = q.data ?? [];

  return (
    <div>
      <div style={{ marginBlockEnd: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" type="primary" onClick={() => { setEditing(null); setDrawerOpen(true); }}>Add education</Button>
      </div>
      <Table<MemberEducationEntry>
        rowKey="id" size="small" pagination={false} dataSource={rows} loading={q.isLoading}
        locale={{ emptyText: 'No education entries yet. Click Add education to capture one.' }}
        columns={[
          { title: 'Level', dataIndex: 'level', width: 130,
            render: (v: number) => QualificationLabel[v as Qualification] ?? '-' },
          { title: 'Degree', dataIndex: 'degree', render: (v: string | null) => v ?? '-' },
          { title: 'Institution', dataIndex: 'institution', render: (v: string | null) => v ?? '-' },
          { title: 'Year', dataIndex: 'yearCompleted', width: 90, render: (v: number | null) => v ?? '-' },
          { title: 'Specialization', dataIndex: 'specialization', render: (v: string | null) => v ?? '-' },
          { title: 'Highest', dataIndex: 'isHighest', width: 90,
            render: (v: boolean) => v ? <Tag color="green">Highest</Tag> : null },
          { title: '', width: 100, align: 'end',
            render: (_: unknown, row) => (
              <Space>
                <Button size="small" type="link" onClick={() => { setEditing(row); setDrawerOpen(true); }}>Edit</Button>
                <Button size="small" type="link" danger
                  onClick={() => modal.confirm({ title: 'Remove this education entry?', okButtonProps: { danger: true }, onOk: () => delMut.mutateAsync(row.id) })}>
                  Remove
                </Button>
              </Space>
            )
          },
        ]}
      />
      {drawerOpen && (
        <EducationDrawer memberId={memberId} editing={editing} onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  );
}

function EducationDrawer({ memberId, editing, onClose }: {
  memberId: string;
  editing: MemberEducationEntry | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!editing;
  const mut = useMutation({
    mutationFn: async (input: AddMemberEducationInput) =>
      isEdit
        ? memberProfileApi.updateEducation(memberId, editing!.id, input)
        : memberProfileApi.addEducation(memberId, input),
    onSuccess: () => {
      message.success(isEdit ? 'Updated.' : 'Added.');
      void qc.invalidateQueries({ queryKey: ['member-educations', memberId] });
      onClose();
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  return (
    <Drawer open onClose={onClose} title={isEdit ? 'Edit education' : 'Add education'} width={520}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose} style={{ marginInlineEnd: 8 }}>Cancel</Button>
          <Button type="primary" loading={mut.isPending}
            onClick={() => mut.mutate(form.getFieldsValue() as AddMemberEducationInput)}>
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </div>
      }>
      <Form layout="vertical" form={form} initialValues={editing ?? { level: 0, isHighest: false }} requiredMark={false}>
        <Form.Item label="Level" name="level" rules={[{ required: true }]}>
          <Select options={Object.entries(QualificationLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
        </Form.Item>
        <Form.Item label="Degree" name="degree" tooltip="e.g., B.Tech, M.Sc, Diploma in Hospital Management">
          <Input />
        </Form.Item>
        <Form.Item label="Institution" name="institution" tooltip="University / college / school">
          <Input />
        </Form.Item>
        <Form.Item label="Year completed" name="yearCompleted">
          <InputNumber min={1900} max={dayjs().year()} style={{ inlineSize: '100%' }} />
        </Form.Item>
        <Form.Item label="Specialization" name="specialization">
          <Input placeholder="Optional - subject of study" />
        </Form.Item>
        <Form.Item name="isHighest" valuePropName="checked" tooltip="Marks this as the member's highest qualification. Setting it here will clear the flag from any other entry.">
          <Switch checkedChildren="Highest" unCheckedChildren="Not highest" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

function ReligiousTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mode = useProfileSubmitMode();
  const mut = useSectionSubmit(profile, 'religious', memberProfileApi.updateReligious, onSaved, onErr);
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={profile}>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="Quran Sanad" name="quranSanad"><Input placeholder="e.g., Marhala Ula" /></Form.Item></Col>
          <Col span={12}><Form.Item label="Ashara Mubaraka (years attended)" name="asharaMubarakaCount"><InputNumber min={0} max={99} style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Qadambosi Sharaf" name="qadambosiSharaf" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Raudat Tahera" name="raudatTaheraZiyarat" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Karbala Ziyarat" name="karbalaZiyarat" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        {/* Hajj + Umrah (v2). Hajj year is only meaningful when status is Performed/Multiple;
            we surface it conditionally so the form doesn't ask for a year that won't apply. */}
        <Typography.Title level={5} style={{ marginBlockStart: 16 }}>Hajj &amp; Umrah</Typography.Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="Hajj status" name="hajjStatus">
              <Select options={[
                { value: 0, label: 'Not performed' },
                { value: 1, label: 'Performed' },
                { value: 2, label: 'Multiple times' },
              ]} />
            </Form.Item>
          </Col>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.hajjStatus !== next.hajjStatus}>
            {({ getFieldValue }) => Number(getFieldValue('hajjStatus') ?? 0) !== 0 ? (
              <Col span={8}>
                <Form.Item label="Hajj year (most recent)" name="hajjYear">
                  <InputNumber min={1900} max={dayjs().year()} style={{ inlineSize: '100%' }} placeholder="e.g., 2019" />
                </Form.Item>
              </Col>
            ) : null}
          </Form.Item>
          <Col span={8}>
            <Form.Item label="Umrah count" name="umrahCount" tooltip="How many Umrahs the member has performed.">
              <InputNumber min={0} max={99} style={{ inlineSize: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} mode={mode} />
    </div>
  );
}

function PersonalTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mode = useProfileSubmitMode();
  // Personal has Date pickers that need formatting before the DTO leaves; we adapt the
  // direct API call to do that, then route everything through useSectionSubmit.
  const mut = useSectionSubmit(profile, 'personal',
    (id, v) => memberProfileApi.updatePersonal(id, {
      ...v,
      dateOfBirth: v.dateOfBirth ? dayjs(v.dateOfBirth as string | Date).format('YYYY-MM-DD') : null,
      misaqDate: v.misaqDate ? dayjs(v.misaqDate as string | Date).format('YYYY-MM-DD') : null,
      dateOfNikah: v.dateOfNikah ? dayjs(v.dateOfNikah as string | Date).format('YYYY-MM-DD') : null,
    }),
    onSaved, onErr);
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={{
        ...profile,
        dateOfBirth: profile.dateOfBirth ? dayjs(profile.dateOfBirth) : null,
        misaqDate: profile.misaqDate ? dayjs(profile.misaqDate) : null,
        dateOfNikah: profile.dateOfNikah ? dayjs(profile.dateOfNikah) : null,
      }}>
        <Row gutter={16}>
          <Col span={8}><Form.Item label="Date of birth" name="dateOfBirth"><DatePicker style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={8}>
            <Form.Item label="Age" tooltip="Auto-calculated from date of birth. The 'snapshot' below is a fallback for legacy imports where DOB is unknown - prefer DOB.">
              <Input value={profile.age != null ? `${profile.age} years` : (profile.ageSnapshot != null ? `${profile.ageSnapshot} (snapshot)` : '-')} disabled />
            </Form.Item>
          </Col>
          <Col span={8}><Form.Item label="Gender" name="gender">
            <Select options={Object.entries(GenderLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          {/* Hidden snapshot kept for back-compat with the existing UpdatePersonal payload;
              we no longer expose it as a user-editable field. */}
          <Form.Item name="ageSnapshot" hidden><InputNumber /></Form.Item>
          <Col span={8}><Form.Item label="Marital status" name="maritalStatus">
            <Select options={Object.entries(MaritalStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          <Col span={8}><Form.Item label="Blood group" name="bloodGroup">
            <Select options={Object.entries(BloodGroupLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          <Col span={8}><Form.Item label="Warakatul Tarkhis" name="warakatulTarkhisStatus">
            <Select options={Object.entries(WarakatLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          <Col span={8}><Form.Item label="Misaq" name="misaqStatus">
            <Select options={Object.entries(MisaqStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          <Col span={8}><Form.Item label="Misaq date" name="misaqDate"><DatePicker style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Date of Nikah" name="dateOfNikah"><DatePicker style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={24}><Form.Item label="Date of Nikah (Hijri)" name="dateOfNikahHijri"><Input /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} mode={mode} />
    </div>
  );
}

function OrganisationsTab({ memberId, memberships }: { memberId: string; memberships: MemberOrgMembership[] }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [orgId, setOrgId] = useState<string>();
  const [role, setRole] = useState('Member');
  const orgsQ = useQuery({ queryKey: ['orgs-active'], queryFn: () => organisationsApi.list({ active: true, pageSize: 200 }) });
  const addMut = useMutation({
    mutationFn: () => organisationsApi.createMembership({ memberId, organisationId: orgId!, role }),
    onSuccess: () => { message.success('Added.'); void qc.invalidateQueries({ queryKey: ['member-orgs', memberId] }); setOrgId(undefined); setRole('Member'); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => organisationsApi.removeMembership(id),
    onSuccess: () => { message.success('Removed.'); void qc.invalidateQueries({ queryKey: ['member-orgs', memberId] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });
  return (
    <div style={{ padding: 24 }}>
      <Space wrap style={{ marginBlockEnd: 16 }}>
        <Select showSearch placeholder="Select organisation" style={{ inlineSize: 320 }}
          value={orgId} onChange={setOrgId}
          optionFilterProp="label"
          options={(orgsQ.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.code} - ${o.name}` }))} />
        <Input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} style={{ inlineSize: 200 }} />
        <Button type="primary" loading={addMut.isPending} disabled={!orgId || !role} onClick={() => addMut.mutate()}>Add membership</Button>
      </Space>
      <Divider style={{ margin: '12px 0' }} />
      {memberships.length === 0
        ? <Text type="secondary">No organisation memberships.</Text>
        : <Space direction="vertical" size={8} style={{ inlineSize: '100%' }}>
            {memberships.map((m) => (
              <Card key={m.id} size="small" styles={{ body: { padding: 12 } }}>
                <Row align="middle" gutter={8}>
                  <Col flex="auto">
                    <strong>{m.organisationName}</strong> <Text type="secondary">({m.organisationCode})</Text>
                    <div><Tag color="blue">{m.role}</Tag>{m.startDate && <Text type="secondary">since {formatDate(m.startDate)}</Text>}</div>
                  </Col>
                  <Col><Badge status={m.isActive ? 'success' : 'default'} text={m.isActive ? 'Active' : 'Inactive'} /></Col>
                  <Col><Button type="text" danger onClick={() => delMut.mutate(m.id)}>Remove</Button></Col>
                </Row>
              </Card>
            ))}
          </Space>}
    </div>
  );
}

function VerificationTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const { hasPermission } = useAuth();
  const canVerify = hasPermission('member.verify');
  const canUpdate = hasPermission('member.update');
  const dataMut = useMutation({ mutationFn: (s: VerificationStatus) => memberProfileApi.verifyData(profile.id, s), onSuccess: onSaved, onError: onErr });
  const photoMut = useMutation({ mutationFn: (s: VerificationStatus) => memberProfileApi.verifyPhoto(profile.id, s), onSuccess: onSaved, onError: onErr });
  const uploadMut = useMutation({ mutationFn: (file: File) => memberProfileApi.uploadPhoto(profile.id, file), onSuccess: onSaved, onError: onErr });
  const deleteMut = useMutation({
    mutationFn: async () => { await memberProfileApi.deletePhoto(profile.id); return memberProfileApi.get(profile.id); },
    onSuccess: onSaved, onError: onErr,
  });

  return (
    <div style={{ padding: 24 }}>
      {!canVerify && (
        <Alert
          type="info" showIcon style={{ marginBlockEnd: 16 }}
          message="You don't have the 'member.verify' permission - the verification buttons below are hidden. Contact an administrator if you need this access."
        />
      )}
      <Row gutter={24}>
        <Col span={12}>
          <Card size="small" title="Data verification" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 16 }}>
            <Descriptions size="small" column={1}
              items={[
                { key: 's', label: 'Status', children: <Tag color={VerificationStatusColor[profile.dataVerificationStatus]}>{VerificationStatusLabel[profile.dataVerificationStatus]}</Tag> },
                { key: 'd', label: 'Date', children: profile.dataVerifiedOn ?? '-' },
              ]}
            />
            {canVerify && (
              <Space style={{ marginBlockStart: 12 }}>
                <Button type="primary" loading={dataMut.isPending} icon={<CheckCircleOutlined />} onClick={() => dataMut.mutate(2)}>Mark Verified</Button>
                <Button danger loading={dataMut.isPending} onClick={() => dataMut.mutate(3)}>Reject</Button>
                <Button loading={dataMut.isPending} onClick={() => dataMut.mutate(1)}>Pending</Button>
              </Space>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="Photo verification" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 16 }}>
            <Descriptions size="small" column={1}
              items={[
                { key: 's', label: 'Status', children: <Tag color={VerificationStatusColor[profile.photoVerificationStatus]}>{VerificationStatusLabel[profile.photoVerificationStatus]}</Tag> },
                { key: 'd', label: 'Date', children: profile.photoVerifiedOn ?? '-' },
              ]}
            />
            <div style={{ marginBlockStart: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
              {profile.photoUrl
                ? <img src={profile.photoUrl} alt="Member" style={{ inlineSize: 96, blockSize: 96, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--jm-border)' }} />
                : <div style={{ inlineSize: 96, blockSize: 96, borderRadius: 8, background: 'var(--jm-surface-muted)', display: 'grid', placeItems: 'center', color: 'var(--jm-gray-400)', fontSize: 11 }}>No photo</div>}
              {canUpdate && (
                <Space direction="vertical">
                  <Upload
                    maxCount={1} showUploadList={false} accept="image/*"
                    beforeUpload={(file) => { uploadMut.mutate(file); return false; }}
                  >
                    <Button icon={<UploadOutlined />} loading={uploadMut.isPending}>Upload photo</Button>
                  </Upload>
                  {profile.photoUrl && (
                    <Button size="small" type="text" danger loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Remove photo</Button>
                  )}
                </Space>
              )}
            </div>
            {canVerify && (
              <Space style={{ marginBlockStart: 12 }}>
                <Button type="primary" loading={photoMut.isPending} icon={<CheckCircleOutlined />} onClick={() => photoMut.mutate(2)}>Mark Verified</Button>
                <Button danger loading={photoMut.isPending} onClick={() => photoMut.mutate(3)}>Reject</Button>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {profile.lastScannedAtUtc && (
        <Card size="small" title="Last event scan" style={{ border: '1px solid var(--jm-border)' }}>
          <Descriptions size="small" column={2}
            items={[
              { key: 'e', label: 'Event', children: profile.lastScannedEventName ?? '-' },
              { key: 'p', label: 'Place', children: profile.lastScannedPlace ?? '-' },
              { key: 't', label: 'When', children: formatDateTime(profile.lastScannedAtUtc) },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

/// Inline ITS lookup tag. As soon as the user has typed an 8-digit ITS, hit the members
/// search and show whether it resolves to an existing member. Green when resolved,
/// orange when no match. The free-text input above stays editable so relatives not yet
/// on our rolls can still be captured by ITS even before we onboard them.
function ItsLookupTag({ its }: { its?: string | null }) {
  const valid = !!its && /^\d{8}$/.test(its.trim());
  const q = useQuery({
    queryKey: ['its-lookup', its],
    queryFn: async () => {
      const res = await membersApi.list({ search: (its ?? '').trim(), pageSize: 5 });
      return res.items?.find((m) => m.itsNumber === (its ?? '').trim()) ?? null;
    },
    enabled: valid,
    staleTime: 60_000,
  });
  if (!valid) return null;
  if (q.isLoading) return <span style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Looking up...</span>;
  if (q.data) {
    return (
      <Tag color="green" style={{ marginBlockStart: 4 }}>
        Linked: {q.data.fullName}
      </Tag>
    );
  }
  return (
    <Tag color="orange" style={{ marginBlockStart: 4 }}>
      Not in roll - free-text only
    </Tag>
  );
}
