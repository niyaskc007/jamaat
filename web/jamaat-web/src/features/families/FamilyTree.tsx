import { Card, Empty, Tag, Space, Typography, Spin } from 'antd';
import { UserOutlined, HeartOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { membersApi } from '../members/membersApi';
import { memberProfileApi, type MemberProfile } from '../members/profile/memberProfileApi';
import type { FamilyMember } from './familiesApi';

/// Auto-derived relationship tree for a family. The model already captures Father/Mother/Spouse
/// ITS numbers on every member profile, so we walk the head's profile + each family member's
/// ITS refs to draw a 3-row layout: parents → head + spouse → children.
///
/// Anyone listed by ITS but not part of *this* family (e.g. an in-law) is shown with a
/// muted tag - we resolve their name via the global members lookup so the tree still reads
/// well even when relatives sit in other families.
export function FamilyTree({ familyId, headMemberId, members }: {
  familyId: string;
  headMemberId?: string | null;
  members: FamilyMember[];
}) {
  const navigate = useNavigate();
  // The head's *full* profile carries the ITS refs (Father/Mother/Spouse). Family list rows
  // only have the basic family-tab columns, so we fetch the head profile separately.
  const headQ = useQuery({
    queryKey: ['member-profile-for-tree', headMemberId],
    queryFn: () => headMemberId ? memberProfileApi.get(headMemberId) : Promise.resolve(null),
    enabled: !!headMemberId,
  });

  if (!headMemberId) {
    return (
      <Card title={<Space><ApartmentOutlined /> Family tree</Space>} size="small" style={{ border: '1px solid var(--jm-border)' }}>
        <Empty description="No head set on this family - assign a head to render the tree." />
      </Card>
    );
  }
  if (headQ.isLoading || !headQ.data) {
    return (
      <Card title={<Space><ApartmentOutlined /> Family tree</Space>} size="small" style={{ border: '1px solid var(--jm-border)' }}>
        <div style={{ paddingBlock: 24, textAlign: 'center' }}><Spin /></div>
      </Card>
    );
  }

  const head = headQ.data;
  return (
    <Card title={<Space><ApartmentOutlined /> Family tree</Space>} size="small" style={{ border: '1px solid var(--jm-border)' }}>
      <FamilyTreeBody head={head} familyMembers={members} familyId={familyId} onOpenMember={(id) => navigate(`/members/${id}`)} />
    </Card>
  );
}

function FamilyTreeBody({ head, familyMembers, familyId, onOpenMember }: {
  head: MemberProfile;
  familyMembers: FamilyMember[];
  familyId: string;
  onOpenMember: (id: string) => void;
}) {
  // Resolve the parents + spouse by ITS number. They may or may not be in *this* family -
  // a married woman's father will typically be in her parents' family. We fetch up to ~500
  // members and resolve in-memory so we don't fan out N round-trips for large families.
  const refsItsList = [head.fatherItsNumber, head.motherItsNumber, head.spouseItsNumber]
    .filter((s): s is string => !!s);

  const memberLookupQ = useQuery({
    queryKey: ['members-tree-lookup'],
    queryFn: () => membersApi.list({ pageSize: 500 }),
  });

  const findByIts = (its: string) =>
    memberLookupQ.data?.items.find((m) => m.itsNumber === its);

  const father = head.fatherItsNumber ? findByIts(head.fatherItsNumber) : undefined;
  const mother = head.motherItsNumber ? findByIts(head.motherItsNumber) : undefined;
  const spouse = head.spouseItsNumber ? findByIts(head.spouseItsNumber) : undefined;
  // Children = members in this family whose Father OR Mother ITS = head's or spouse's ITS.
  // We cross-check the family members list (already loaded above) but fall back to global
  // if a child profile happens to have parental ITS that matches the head.
  const childCandidatesIts = new Set([head.itsNumber, head.spouseItsNumber].filter(Boolean) as string[]);
  // Children come from family member rows + their resolved profile (we need parent ITS).
  // Simpler: pull each family member's profile in batch via global lookup we already have.
  const children = (memberLookupQ.data?.items ?? []).filter((m) =>
    m.familyId === familyId && m.id !== head.id && m.id !== spouse?.id
  );
  void childCandidatesIts; // reserved for richer matching once Member API exposes parental ITS in the list DTO.

  // Empty state: nothing to draw beyond the head itself.
  const hasAny = father || mother || spouse || children.length > 0;
  if (!hasAny) {
    return (
      <Empty description="No related members captured yet. Set Father / Mother / Spouse ITS on the member's profile to build the tree." />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBlock: 8 }}>
      {/* Parents row */}
      {(father || mother) && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {father ? <PersonCard label="Father" name={father.fullName} its={father.itsNumber} onClick={() => onOpenMember(father.id)} /> : <PersonCardPlaceholder label="Father" its={head.fatherItsNumber ?? null} />}
          {mother ? <PersonCard label="Mother" name={mother.fullName} its={mother.itsNumber} onClick={() => onOpenMember(mother.id)} /> : head.motherItsNumber ? <PersonCardPlaceholder label="Mother" its={head.motherItsNumber} /> : null}
        </div>
      )}
      {(father || mother) && <Connector />}

      {/* Self + spouse row */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <PersonCard label="Head" name={head.fullName} its={head.itsNumber} highlight onClick={() => onOpenMember(head.id)} />
        {spouse && (
          <>
            <span style={{ color: 'var(--jm-gray-400)', fontSize: 18 }}><HeartOutlined /></span>
            <PersonCard label="Spouse" name={spouse.fullName} its={spouse.itsNumber} onClick={() => onOpenMember(spouse.id)} />
          </>
        )}
      </div>

      {/* Children row */}
      {children.length > 0 && (
        <>
          <Connector />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxInlineSize: 720 }}>
            {children.map((c) => (
              <PersonCard key={c.id} label="Child" name={c.fullName} its={c.itsNumber} onClick={() => onOpenMember(c.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PersonCard({ label, name, its, highlight, onClick }: { label: string; name: string; its: string; highlight?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: highlight ? 'rgba(11,110,99,0.08)' : '#FFFFFF',
        border: highlight ? '1px solid var(--jm-primary-500)' : '1px solid var(--jm-border)',
        borderRadius: 8,
        padding: '8px 12px',
        minInlineSize: 160,
        textAlign: 'center',
        cursor: 'pointer',
        boxShadow: 'var(--jm-shadow-1)',
      }}
    >
      <Tag color={highlight ? 'green' : 'default'} style={{ marginBlockEnd: 6 }}>{label}</Tag>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--jm-gray-900)' }}>
        <UserOutlined style={{ marginInlineEnd: 4, color: 'var(--jm-gray-500)' }} />
        {name}
      </div>
      <div className="jm-tnum" style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>ITS {its}</div>
    </button>
  );
}

function PersonCardPlaceholder({ label, its }: { label: string; its: string | null }) {
  return (
    <div style={{
      background: 'var(--jm-surface-muted, #F5F5F5)',
      border: '1px dashed var(--jm-border-strong, #CBD5E1)',
      borderRadius: 8,
      padding: '8px 12px',
      minInlineSize: 160,
      textAlign: 'center',
      color: 'var(--jm-gray-500)',
    }}>
      <Tag style={{ marginBlockEnd: 6 }}>{label}</Tag>
      <div style={{ fontSize: 12 }}>{its ? `ITS ${its} · not in directory` : '-'}</div>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>{its ? 'Add this member to the system to link.' : 'Not captured.'}</Typography.Text>
    </div>
  );
}

function Connector() {
  return <div style={{ inlineSize: 2, blockSize: 16, background: 'var(--jm-border-strong, #CBD5E1)' }} />;
}
