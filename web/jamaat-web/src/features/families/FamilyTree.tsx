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

  // Use the FamilyRole on each family-member row to slot people into the right tree level.
  // The role is a labelling field set when the member was added; we group by it so siblings
  // don't end up labelled as "Child" and grand-relatives are surfaced in their own row.
  // Roles ref: 1=Head, 2=Spouse, 3=Father, 4=Mother, 5=Son, 6=Daughter, 7=Brother, 8=Sister,
  //  9=GrandFather, 10=GrandMother, 11=GrandSon, 12=GrandDaughter, 13=SonInLaw,
  //  14=DaughterInLaw, 15=Uncle, 16=Aunt, 17=Nephew, 18=Niece, 99=Other.
  const exclude = new Set([head.id, spouse?.id].filter(Boolean) as string[]);
  const inFamily = familyMembers.filter((m) => !exclude.has(m.id));

  const childRoles = new Set<number>([5, 6, 13, 14]);          // Son / Daughter / SonInLaw / DaughterInLaw
  const siblingRoles = new Set<number>([7, 8]);                 // Brother / Sister
  const grandchildRoles = new Set<number>([11, 12]);            // GrandSon / GrandDaughter
  const olderRoles = new Set<number>([3, 4, 9, 10]);            // Father / Mother / Grandparents - handled via ITS above
  const otherRoles = new Set<number>([15, 16, 17, 18, 99]);     // Uncle / Aunt / Nephew / Niece / Other

  const children = inFamily.filter((m) => childRoles.has(m.familyRole ?? 99));
  const siblings = inFamily.filter((m) => siblingRoles.has(m.familyRole ?? 99));
  const grandchildren = inFamily.filter((m) => grandchildRoles.has(m.familyRole ?? 99));
  const others = inFamily.filter((m) => otherRoles.has(m.familyRole ?? 99) && !olderRoles.has(m.familyRole ?? 99));

  // Empty state: nothing to draw beyond the head itself.
  const hasAny = father || mother || spouse || children.length > 0
    || siblings.length > 0 || grandchildren.length > 0 || others.length > 0;
  if (!hasAny) {
    return (
      <Empty description="No related members captured yet. Set Father / Mother / Spouse ITS on the member's profile to build the tree." />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBlock: 8 }}>
      {/* Parents row (resolved via head's ITS refs) */}
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

      {/* Siblings row - same generation as the head */}
      {siblings.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxInlineSize: 720, marginBlockStart: 4 }}>
          {siblings.map((s) => (
            <PersonCard key={s.id} label={s.familyRole === 7 ? 'Brother' : 'Sister'} name={s.fullName} its={s.itsNumber} onClick={() => onOpenMember(s.id)} />
          ))}
        </div>
      )}

      {/* Children row */}
      {children.length > 0 && (
        <>
          <Connector />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxInlineSize: 720 }}>
            {children.map((c) => (
              <PersonCard key={c.id}
                label={c.familyRole === 5 ? 'Son' : c.familyRole === 6 ? 'Daughter' : c.familyRole === 13 ? 'Son-in-Law' : 'Daughter-in-Law'}
                name={c.fullName} its={c.itsNumber} onClick={() => onOpenMember(c.id)} />
            ))}
          </div>
        </>
      )}

      {/* Grandchildren row */}
      {grandchildren.length > 0 && (
        <>
          <Connector />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxInlineSize: 720 }}>
            {grandchildren.map((g) => (
              <PersonCard key={g.id} label={g.familyRole === 11 ? 'Grandson' : 'Granddaughter'}
                name={g.fullName} its={g.itsNumber} onClick={() => onOpenMember(g.id)} />
            ))}
          </div>
        </>
      )}

      {/* Other / extended-family row - kept separate so the main tree stays clean */}
      {others.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxInlineSize: 720, marginBlockStart: 8, paddingBlockStart: 12, borderBlockStart: '1px dashed var(--jm-border)' }}>
          {others.map((o) => (
            <PersonCard key={o.id}
              label={o.familyRole === 15 ? 'Uncle' : o.familyRole === 16 ? 'Aunt' : o.familyRole === 17 ? 'Nephew' : o.familyRole === 18 ? 'Niece' : 'Other'}
              name={o.fullName} its={o.itsNumber} onClick={() => onOpenMember(o.id)} />
          ))}
        </div>
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
