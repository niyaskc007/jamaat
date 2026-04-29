import { useState } from 'react';
import {
  Card, Tabs, Spin, Result, Space, Button, Form, Input, InputNumber, Select, DatePicker, Switch, Tag,
  Row, Col, Descriptions, App as AntdApp, Avatar, Divider, Typography, Badge, Upload, Alert,
} from 'antd';
import { useAuth } from '../../../shared/auth/useAuth';
import { UserOutlined, TeamOutlined, HomeOutlined, BookOutlined, IdcardOutlined, CheckCircleOutlined, PhoneOutlined, GlobalOutlined, HeartOutlined, SafetyCertificateOutlined, FileProtectOutlined, StarOutlined, UploadOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { formatDate, formatDateTime, money } from '../../../shared/format/format';
import { extractProblem } from '../../../shared/api/client';
import {
  memberProfileApi, type MemberProfile, type VerificationStatus,
  GenderLabel, MaritalStatusLabel, BloodGroupLabel, WarakatLabel, MisaqStatusLabel,
  QualificationLabel, HousingOwnershipLabel, TypeOfHouseLabel, VerificationStatusLabel, VerificationStatusColor,
} from './memberProfileApi';
import { sectorsApi, subSectorsApi } from '../../sectors/sectorsApi';
import { organisationsApi, type MemberOrgMembership } from '../../organisations/organisationsApi';
import { FamilyDetailDrawer } from '../../families/FamilyDetailDrawer';

const { Text } = Typography;

export function MemberProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
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
                <StatPill label="Enrollments" value={`${summary.activeEnrollmentCount}`} />
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

function SectionSaveBar({ loading, onSave }: { loading: boolean; onSave: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlock: 16, borderBlockStart: '1px solid var(--jm-border)', marginBlockStart: 16 }}>
      <Button type="primary" loading={loading} onClick={onSave}>Save changes</Button>
    </div>
  );
}

function IdentityTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updateIdentity(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
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
          <Col span={8}><Form.Item label="Husband prefix" name="husbandPrefix"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Husband name" name="husbandName"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Surname" name="surname"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Full name (Hindi)" name="fullNameHindi"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="Full name (Urdu)" name="fullNameUrdu"><Input dir="rtl" /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} />
    </div>
  );
}

function FamilyTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  // Drawer-open state: when set, the FamilyDetailDrawer below shows the family in-place
  // so the member context is preserved. We import FamilyDetailDrawer dynamically to avoid
  // a circular module load.
  const [familyDrawerOpen, setFamilyDrawerOpen] = useState(false);
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updateFamilyRefs(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
  const nikahMut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updatePersonal(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
  const onSave = () => {
    const v = form.getFieldsValue();
    mut.mutate({
      fatherItsNumber: v.fatherItsNumber || null,
      motherItsNumber: v.motherItsNumber || null,
      spouseItsNumber: v.spouseItsNumber || null,
    });
    // Nikah stays on the Personal side; separate call only if changed
    nikahMut.mutate({
      dateOfBirth: profile.dateOfBirth,
      ageSnapshot: profile.ageSnapshot,
      gender: profile.gender, maritalStatus: profile.maritalStatus, bloodGroup: profile.bloodGroup,
      warakatulTarkhisStatus: profile.warakatulTarkhisStatus,
      misaqStatus: profile.misaqStatus, misaqDate: profile.misaqDate,
      dateOfNikah: v.dateOfNikah ? dayjs(v.dateOfNikah).format('YYYY-MM-DD') : null,
      dateOfNikahHijri: v.dateOfNikahHijri || null,
    });
  };
  return (
    <div style={{ padding: 24 }}>
      <Descriptions size="small" bordered column={2} style={{ marginBlockEnd: 16 }}
        items={[
          { key: 'fam', label: 'Family', children: profile.familyName
            ? <Space>
                <span>{profile.familyName} ({profile.familyCode})</span>
                <Button size="small" type="link" onClick={() => setFamilyDrawerOpen(true)}>Open family</Button>
              </Space>
            : <Space>
                <span style={{ color: 'var(--jm-gray-500)' }}>Not in a family</span>
                <Button size="small" type="link" onClick={() => navigate('/families')}>Manage families</Button>
              </Space>
          },
          { key: 'role', label: 'Role', children: profile.familyRole ? String(profile.familyRole) : '—' },
        ]}
      />
      {familyDrawerOpen && profile.familyId && (
        <FamilyDetailDrawer familyId={profile.familyId} onClose={() => setFamilyDrawerOpen(false)} />
      )}
      <Form layout="vertical" form={form} requiredMark={false}
        initialValues={{
          fatherItsNumber: profile.fatherItsNumber,
          motherItsNumber: profile.motherItsNumber,
          spouseItsNumber: profile.spouseItsNumber,
          dateOfNikah: profile.dateOfNikah ? dayjs(profile.dateOfNikah) : null,
          dateOfNikahHijri: profile.dateOfNikahHijri,
        }}>
        <Row gutter={16}>
          <Col span={8}><Form.Item label="Father ITS" name="fatherItsNumber"><Input maxLength={8} className="jm-tnum" /></Form.Item></Col>
          <Col span={8}><Form.Item label="Mother ITS" name="motherItsNumber"><Input maxLength={8} className="jm-tnum" /></Form.Item></Col>
          <Col span={8}><Form.Item label="Spouse ITS" name="spouseItsNumber"><Input maxLength={8} className="jm-tnum" /></Form.Item></Col>
          <Col span={8}><Form.Item label="Date of Nikah" name="dateOfNikah"><DatePicker style={{ inlineSize: '100%' }} /></Form.Item></Col>
          <Col span={16}><Form.Item label="Date of Nikah (Hijri)" name="dateOfNikahHijri"><Input placeholder="e.g., 15 Rabiul Akhar 1431H." /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending || nikahMut.isPending} onSave={onSave} />
    </div>
  );
}

function ContactTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updateContact(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false}
        initialValues={{ phone: profile.phone, whatsAppNo: profile.whatsAppNo, email: profile.email }}>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="Mobile" name="phone"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="WhatsApp" name="whatsAppNo"><Input /></Form.Item></Col>
          <Col span={24}><Form.Item label="Email" name="email"><Input type="email" /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} />
    </div>
  );
}

function AddressTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updateAddress(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={profile}>
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
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} />
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
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updateOrigin(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={profile}>
        <Row gutter={16}>
          <Col span={8}><Form.Item label="Category" name="category"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Idara" name="idara"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Vatan" name="vatan"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Nationality" name="nationality"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Jamaat" name="jamaat"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Jamiaat" name="jamiaat"><Input placeholder="e.g., Khaleej" /></Form.Item></Col>
          <Col span={12}><Form.Item label="Sector" name="sectorId">
            <Select allowClear showSearch optionFilterProp="label" onChange={(v) => { setSectorId(v); form.setFieldValue('subSectorId', null); }}
              options={(sectorsQ.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))} />
          </Form.Item></Col>
          <Col span={12}><Form.Item label="Sub-sector" name="subSectorId">
            <Select allowClear showSearch optionFilterProp="label" disabled={!sectorId}
              options={(subsQ.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))} />
          </Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} />
    </div>
  );
}

function EducationTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updateEducationWork(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
  return (
    <div style={{ padding: 24 }}>
      <Form layout="vertical" form={form} requiredMark={false} initialValues={profile}>
        <Row gutter={16}>
          <Col span={8}><Form.Item label="Qualification" name="qualification">
            <Select options={Object.entries(QualificationLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
          <Col span={16}><Form.Item label="Languages (comma-separated)" name="languagesCsv"><Input placeholder="Lisaan-ud-Dawat, English, Arabic, Urdu" /></Form.Item></Col>
          <Col span={24}><Form.Item label="Hunars / skills (comma-separated)" name="hunarsCsv"><Input placeholder="Cricket, Fitness, Cooking" /></Form.Item></Col>
          <Col span={8}><Form.Item label="Occupation" name="occupation"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Sub-occupation" name="subOccupation"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="Sub-occupation 2" name="subOccupation2"><Input /></Form.Item></Col>
        </Row>
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} />
    </div>
  );
}

function ReligiousTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => memberProfileApi.updateReligious(profile.id, v),
    onSuccess: onSaved, onError: onErr,
  });
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
      </Form>
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} />
    </div>
  );
}

function PersonalTab({ profile, onSaved, onErr }: { profile: MemberProfile; onSaved: (p: MemberProfile) => void; onErr: (e: unknown) => void }) {
  const [form] = Form.useForm();
  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      return memberProfileApi.updatePersonal(profile.id, {
        ...v,
        dateOfBirth: v.dateOfBirth ? dayjs(v.dateOfBirth as string | Date).format('YYYY-MM-DD') : null,
        misaqDate: v.misaqDate ? dayjs(v.misaqDate as string | Date).format('YYYY-MM-DD') : null,
        dateOfNikah: v.dateOfNikah ? dayjs(v.dateOfNikah as string | Date).format('YYYY-MM-DD') : null,
      });
    },
    onSuccess: onSaved, onError: onErr,
  });
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
          <Col span={8}><Form.Item label="Age snapshot" name="ageSnapshot"><InputNumber style={{ inlineSize: '100%' }} min={0} max={150} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Gender" name="gender">
            <Select options={Object.entries(GenderLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
          </Form.Item></Col>
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
      <SectionSaveBar loading={mut.isPending} onSave={() => mut.mutate(form.getFieldsValue())} />
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
          options={(orgsQ.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.code} — ${o.name}` }))} />
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
          message="You don't have the 'member.verify' permission — the verification buttons below are hidden. Contact an administrator if you need this access."
        />
      )}
      <Row gutter={24}>
        <Col span={12}>
          <Card size="small" title="Data verification" style={{ border: '1px solid var(--jm-border)', marginBlockEnd: 16 }}>
            <Descriptions size="small" column={1}
              items={[
                { key: 's', label: 'Status', children: <Tag color={VerificationStatusColor[profile.dataVerificationStatus]}>{VerificationStatusLabel[profile.dataVerificationStatus]}</Tag> },
                { key: 'd', label: 'Date', children: profile.dataVerifiedOn ?? '—' },
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
                { key: 'd', label: 'Date', children: profile.photoVerifiedOn ?? '—' },
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
              { key: 'e', label: 'Event', children: profile.lastScannedEventName ?? '—' },
              { key: 'p', label: 'Place', children: profile.lastScannedPlace ?? '—' },
              { key: 't', label: 'When', children: formatDateTime(profile.lastScannedAtUtc) },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
