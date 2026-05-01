import { useState } from 'react';
import { Card, Empty, Tag, Space, Spin, Button } from 'antd';
import {
  UserOutlined, HeartOutlined, ApartmentOutlined, BranchesOutlined,
  DownOutlined, UpOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { familiesApi, type FamilyTreePerson } from './familiesApi';

/// Extended family tree for a household. Walks parents up via the head's ITS pointers and
/// descendants down via reverse-ITS lookup + household-roster fallback, crossing household
/// boundaries: a son who has spun off into his own family still appears under his father's
/// tree, with a "lives in F-002" tag linking to the new household.
///
/// When a descendant has spun off into their own family, a "View family" button on their
/// card lets the user expand the linked family inline. The expand model is **mutually
/// exclusive with the outer-tree descendants of that branch** — when Idris's family is open,
/// his children move INTO the F-00010 box and disappear from the outer tree's "Grandchild"
/// row. When closed, the grandchildren are back in the outer tree. So Test Child1 only ever
/// shows up in one place at a time, depending on whether his father's family is expanded.
export function FamilyTree({ familyId }: { familyId: string }) {
  const navigate = useNavigate();
  const treeQ = useQuery({
    queryKey: ['family-extended-tree', familyId],
    queryFn: () => familiesApi.extendedTree(familyId),
    enabled: !!familyId,
  });

  const cardHeader = (
    <Space><ApartmentOutlined /> Family tree</Space>
  );

  if (treeQ.isLoading || !treeQ.data) {
    return (
      <Card title={cardHeader} size="small" style={{ border: '1px solid var(--jm-border)' }}>
        <div style={{ paddingBlock: 24, textAlign: 'center' }}><Spin /></div>
      </Card>
    );
  }

  const tree = treeQ.data;
  if (!tree.head) {
    return (
      <Card title={cardHeader} size="small" style={{ border: '1px solid var(--jm-border)' }}>
        <Empty description="No head set on this family - assign a head to render the tree." />
      </Card>
    );
  }

  const hasAnyDescendant = tree.head.descendants.length > 0;
  const hasAncestor = !!(tree.father || tree.mother);
  const onOpenMember = (id: string) => navigate(`/members/${id}`);

  return (
    <Card
      title={cardHeader}
      size="small"
      style={{ border: '1px solid var(--jm-border)' }}
      extra={hasAnyDescendant ? (
        <Tag color="default" style={{ margin: 0 }}>
          <BranchesOutlined style={{ marginInlineEnd: 4 }} />
          Lineage spans households
        </Tag>
      ) : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, paddingBlock: 8 }}>
        {/* Parents (head's father + mother). Resolved via head's Father/Mother ITS, may live
            in any family. Drawn as a couple bracket bar that drops down to the head row. */}
        {hasAncestor && (
          <>
            <CoupleRow
              left={tree.father ?? null}
              right={tree.mother ?? null}
              familyId={familyId}
              onOpenMember={onOpenMember}
            />
            <DropConnector />
          </>
        )}

        {/* Head + spouse pair. Highlighted - this is the focus of the family. */}
        <CoupleRow
          left={tree.head}
          right={tree.spouse ?? null}
          familyId={familyId}
          highlightLeft
          onOpenMember={onOpenMember}
        />

        {/* Descendants under the head couple. Each child's card has a tail connecting up to a
            shared sibling bar, which itself has a tail up to the head/spouse pair. */}
        {hasAnyDescendant && (
          <>
            <DropConnector />
            <SiblingRow>
              {tree.head.descendants.map((d) => (
                <DescendantBranch key={d.memberId} person={d} familyId={familyId} onOpenMember={onOpenMember} />
              ))}
            </SiblingRow>
          </>
        )}

        {!hasAncestor && !hasAnyDescendant && !tree.spouse && (
          <Empty
            description={
              <div style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>
                <div>The tree is empty for this family.</div>
                <div style={{ marginBlockStart: 6 }}>
                  Add a Son / Daughter / Father / Mother via <strong>Add member</strong>, or set Father / Mother / Spouse ITS
                  on the head's profile - the tree builds itself from those relationships.
                </div>
              </div>
            }
          />
        )}
      </div>
    </Card>
  );
}

/// A row showing a married couple - or a single person when one half is missing. Used for
/// parents (top), the head + spouse (middle), and any couple in a recursive sub-tree.
function CoupleRow({ left, right, familyId, highlightLeft, onOpenMember }: {
  left: FamilyTreePerson | null;
  right: FamilyTreePerson | null;
  familyId: string;
  /// When true, the left card gets the green "current focus" highlight - used for the head.
  highlightLeft?: boolean;
  onOpenMember: (id: string) => void;
}) {
  if (!left && !right) return null;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
      {left && <PersonCard person={left} familyId={familyId} highlight={!!highlightLeft} onOpenMember={onOpenMember} />}
      {left && right && (
        <span style={{ color: 'var(--jm-gray-400)', fontSize: 16 }}><HeartOutlined /></span>
      )}
      {right && <PersonCard person={right} familyId={familyId} onOpenMember={onOpenMember} />}
    </div>
  );
}

/// Wrapper that turns its children (descendant branches) into a siblings row joined by a
/// horizontal bar. The bar is a CSS pseudo-element drawn through the row at vertical center;
/// each child card renders its own short stub up to that bar via DescendantBranch's top stub.
/// Falls back to a simple flex row when there's only one child (no bar needed).
function SiblingRow({ children }: { children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  const isMultiple = items.length > 1;

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      gap: 24,
      flexWrap: 'wrap',
      justifyContent: 'center',
      paddingBlockStart: 16,
      maxInlineSize: 1100,
    }}>
      {/* Horizontal sibling bar. Only drawn when there are 2+ siblings - a single child sits
          directly under the parents and doesn't need the spreader. */}
      {isMultiple && (
        <div style={{
          position: 'absolute',
          insetBlockStart: 0,
          insetInlineStart: '50%',
          transform: 'translateX(-50%)',
          inlineSize: 'calc(100% - 96px)',
          blockSize: 2,
          background: 'var(--jm-border-strong, #CBD5E1)',
        }} />
      )}
      {children}
    </div>
  );
}

/// One descendant subtree: the person's card on top with a stub up to the sibling bar, then
/// either:
///   - their own children inline (when the linked-family expansion is collapsed), or
///   - the linked-family expansion box (when expanded) — which itself contains the same
///     descendants AND the linked family's spouse + sibling-of-the-couple etc.
/// The two are mutually exclusive: a member is shown in one or the other, never both, so
/// Test Child1 doesn't appear twice on screen.
function DescendantBranch({ person, familyId, onOpenMember }: {
  person: FamilyTreePerson;
  familyId: string;
  onOpenMember: (id: string) => void;
}) {
  const hasKids = person.descendants.length > 0;
  const livesElsewhere = !person.isInThisFamily && !!person.currentFamilyId && person.currentFamilyId !== familyId;
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, paddingInline: 4, position: 'relative' }}>
      {/* Stub from card top up to the sibling bar (when this branch sits in a SiblingRow with
          multiple siblings). When alone or top-level, the stub still draws but harmless. */}
      <div style={{
        inlineSize: 2,
        blockSize: 16,
        background: 'var(--jm-border-strong, #CBD5E1)',
      }} />

      <PersonCard
        person={person}
        familyId={familyId}
        onOpenMember={onOpenMember}
        canExpandFamily={livesElsewhere}
        isExpanded={expanded}
        onToggleExpand={() => setExpanded((v) => !v)}
      />

      {/* When expanded: pull this person's descendants INTO the expansion. Outer tree drops
          the inline grandchild row below to avoid showing the same people in two places. */}
      {expanded && person.currentFamilyId && (
        <ExpandedFamilyView
          linkedFamilyId={person.currentFamilyId}
          familyCode={person.currentFamilyCode ?? ''}
          familyName={person.currentFamilyName ?? ''}
          onOpenMember={onOpenMember}
        />
      )}

      {/* When collapsed: descendants show inline as siblings of one another beneath this card.
          Standard genealogy-tree layout. */}
      {!expanded && hasKids && (
        <>
          <DropConnector />
          <SiblingRow>
            {person.descendants.map((d) => (
              <DescendantBranch key={d.memberId} person={d} familyId={familyId} onOpenMember={onOpenMember} />
            ))}
          </SiblingRow>
        </>
      )}
    </div>
  );
}

/// Lazy-loaded inline view of a linked family's full tree. Renders the linked household
/// exactly the way <FamilyTree> would render it as a top-level page, just inside a tinted
/// Card to make the recursion boundary obvious. Includes the head, spouse, and every
/// descendant generation in the linked family - the user explicitly wants these grouped
/// together when they click "View family" on the parent card.
function ExpandedFamilyView({ linkedFamilyId, familyCode, familyName, onOpenMember }: {
  linkedFamilyId: string;
  familyCode: string;
  familyName: string;
  onOpenMember: (id: string) => void;
}) {
  const treeQ = useQuery({
    queryKey: ['family-extended-tree', linkedFamilyId],
    queryFn: () => familiesApi.extendedTree(linkedFamilyId),
  });

  const cardStyle = {
    marginBlockStart: 8,
    inlineSize: '100%',
    minInlineSize: 280,
    borderColor: 'var(--jm-primary-500)',
    borderInlineStartWidth: 3,
    background: 'var(--jm-surface-muted, #F8FAFC)',
  } as const;

  if (treeQ.isLoading) {
    return (
      <Card size="small" style={cardStyle} styles={{ body: { padding: 12, textAlign: 'center' } }}>
        <Spin size="small" />
      </Card>
    );
  }
  if (!treeQ.data) return null;

  const tree = treeQ.data;
  const hasContent = !!(tree.head || tree.spouse);

  return (
    <Card size="small" style={cardStyle} styles={{ body: { padding: 12 } }}>
      <div style={{
        fontSize: 10, color: 'var(--jm-primary-600, #0B6E63)',
        textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
        marginBlockEnd: 8, textAlign: 'center',
      }}>
        <BranchesOutlined style={{ marginInlineEnd: 4 }} />
        {familyCode}{familyName ? ` · ${familyName}` : ''}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {/* Linked family's couple - head + spouse. Head is highlighted because they're the
            focus of this sub-tree. */}
        {(tree.head || tree.spouse) && (
          <CoupleRow
            left={tree.head ?? null}
            right={tree.spouse ?? null}
            familyId={linkedFamilyId}
            highlightLeft
            onOpenMember={onOpenMember}
          />
        )}

        {/* Linked family's children - rendered in the linked family's context (familyId =
            linkedFamilyId) so each child's `livesElsewhere` check uses the linked family as
            the baseline. Children whose currentFamilyId === linkedFamilyId don't get a
            recursive "View family" button, avoiding same-family loops. */}
        {tree.head && tree.head.descendants.length > 0 && (
          <>
            <DropConnector />
            <SiblingRow>
              {tree.head.descendants.map((d) => (
                <DescendantBranch key={d.memberId} person={d} familyId={linkedFamilyId} onOpenMember={onOpenMember} />
              ))}
            </SiblingRow>
          </>
        )}

        {!hasContent && (
          <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', paddingBlock: 8, textAlign: 'center' }}>
            No head set on <strong>{familyCode}</strong> yet.
          </div>
        )}
      </div>
    </Card>
  );
}

function PersonCard({ person, familyId, highlight, onOpenMember, canExpandFamily, isExpanded, onToggleExpand }: {
  person: FamilyTreePerson;
  familyId: string;
  highlight?: boolean;
  onOpenMember: (id: string) => void;
  /// True for descendants who've spun off into their own family - shows the inline-expand toggle.
  canExpandFamily?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  /// A descendant who's spun off into their own family carries a "→ F-002" tag so the user
  /// understands the lineage edge crosses households. Clicking the tag NAVIGATES to that
  /// family's full page; clicking the inline-expand button keeps them on this page.
  const livesElsewhere = !person.isInThisFamily && person.currentFamilyId && person.currentFamilyId !== familyId;
  const navigate = useNavigate();

  // Inline spouse badge - useful when the spouse isn't being shown alongside the card already.
  const showSpouseBadge = !!person.spouseName;

  return (
    <button
      type="button"
      onClick={() => onOpenMember(person.memberId)}
      style={{
        background: highlight ? 'rgba(11,110,99,0.08)' : '#FFFFFF',
        border: highlight ? '1px solid var(--jm-primary-500)' : '1px solid var(--jm-border)',
        borderRadius: 8,
        padding: '8px 12px',
        minInlineSize: 180,
        textAlign: 'center',
        cursor: 'pointer',
        boxShadow: 'var(--jm-shadow-1)',
      }}
    >
      <Tag color={highlight ? 'green' : 'default'} style={{ marginBlockEnd: 6 }}>{person.relation}</Tag>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--jm-gray-900)' }}>
        <UserOutlined style={{ marginInlineEnd: 4, color: 'var(--jm-gray-500)' }} />
        {person.fullName}
      </div>
      <div className="jm-tnum" style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>ITS {person.itsNumber}</div>

      {showSpouseBadge && (
        <div style={{
          fontSize: 11, color: 'var(--jm-gray-600)',
          marginBlockStart: 6, paddingBlockStart: 4,
          borderBlockStart: '1px dashed var(--jm-border)',
        }}>
          <HeartOutlined style={{ fontSize: 10, color: '#E11D48', marginInlineEnd: 4 }} />
          {person.spouseName}
        </div>
      )}

      {livesElsewhere && person.currentFamilyCode && (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center', marginBlockStart: 6, flexWrap: 'wrap' }}>
          {/* Existing navigation tag - opens the linked family in its own page. */}
          <Tag
            color="purple"
            style={{ margin: 0, fontSize: 10, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/families?focus=${person.currentFamilyId}`);
            }}
          >
            → {person.currentFamilyCode}
          </Tag>
          {/* Inline-expand toggle. Lazy-loads the linked family's tree below this card without
              navigating away. */}
          {canExpandFamily && onToggleExpand && (
            <Button
              type="text"
              size="small"
              style={{ fontSize: 10, padding: '0 4px', height: 18, color: 'var(--jm-gray-600)' }}
              icon={isExpanded ? <UpOutlined style={{ fontSize: 9 }} /> : <DownOutlined style={{ fontSize: 9 }} />}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              {isExpanded ? 'Hide family' : 'View family'}
            </Button>
          )}
        </div>
      )}
    </button>
  );
}

/// Vertical 2-px line connecting one row of the tree to the next. Used between the parents
/// row, the head row, and the descendants block.
function DropConnector() {
  return <div style={{ inlineSize: 2, blockSize: 16, background: 'var(--jm-border-strong, #CBD5E1)' }} />;
}
