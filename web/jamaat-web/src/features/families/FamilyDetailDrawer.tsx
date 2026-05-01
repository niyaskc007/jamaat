import { useState } from 'react';
import { Drawer, Spin, Card, Space, Tag, Button, Table, Descriptions, Select, Empty, App as AntdApp, Modal, Alert, Input, Tabs, Switch, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { CrownOutlined, DeleteOutlined, PlusOutlined, SwapOutlined, TeamOutlined, BranchesOutlined, ApartmentOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { familiesApi, type FamilyMember, type FamilyExtendedLink, type FamilyRole, FamilyRoleLabel } from './familiesApi';
import { MemberPicker } from './FamilyFormDrawer';
import { FamilyTree } from './FamilyTree';
import { extractProblem } from '../../shared/api/client';
import { formatDate } from '../../shared/format/format';
import { useNavigate } from 'react-router-dom';

export function FamilyDetailDrawer({ familyId, onClose }: { familyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['family', familyId],
    queryFn: () => familiesApi.get(familyId),
    enabled: !!familyId,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [spinOffOpen, setSpinOffOpen] = useState(false);

  const removeMemberMut = useMutation({
    mutationFn: (memberId: string) => familiesApi.removeMember(familyId, memberId),
    onSuccess: () => { message.success('Member removed from family.'); void refetch(); void qc.invalidateQueries({ queryKey: ['families'] }); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to remove member'); },
  });

  const removeLinkMut = useMutation({
    mutationFn: (linkId: string) => familiesApi.removeLink(familyId, linkId),
    onSuccess: () => { message.success('Extended-family link removed.'); void refetch(); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to remove link'); },
  });

  const columns: TableProps<FamilyMember>['columns'] = [
    { title: 'ITS', dataIndex: 'itsNumber', width: 110, render: (v: string) => <span className="jm-tnum">{v}</span> },
    {
      title: 'Member',
      dataIndex: 'fullName',
      render: (v: string, row) => (
        <span style={{ fontWeight: 500 }}>
          {v}{row.isHead && <Tag color="gold" style={{ marginInlineStart: 8 }}><CrownOutlined /> Head</Tag>}
        </span>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'familyRole',
      width: 160,
      render: (r: FamilyRole | null | undefined) =>
        r ? <span>{FamilyRoleLabel[r]}</span> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span>,
    },
    {
      key: 'actions',
      width: 120,
      align: 'end',
      render: (_: unknown, row) =>
        row.isHead ? null : (
          <Button size="small" danger type="text" icon={<DeleteOutlined />}
            onClick={() => Modal.confirm({
              title: 'Remove from family?',
              content: `${row.fullName} will no longer be linked to this family.`,
              okText: 'Remove', okButtonProps: { danger: true },
              onOk: () => removeMemberMut.mutateAsync(row.id),
            })}
          >Remove</Button>
        ),
    },
  ];

  return (
    <Drawer
      title={data ? <span><TeamOutlined style={{ marginInlineEnd: 8 }} />{data.family.familyName} <span style={{ color: 'var(--jm-gray-500)', fontWeight: 400 }}>· {data.family.code}</span></span> : 'Family'}
      open
      onClose={onClose}
      width={760}
      destroyOnHidden
    >
      {isLoading || !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBlock: 40 }}><Spin /></div>
      ) : (
        <Space direction="vertical" size={16} style={{ inlineSize: '100%' }}>
          <Descriptions size="small" column={2} bordered
            items={[
              { key: 'h', label: 'Head', children: data.family.headName ?? '-' },
              { key: 'm', label: 'Members', children: data.family.memberCount },
              { key: 'p', label: 'Phone', children: data.family.contactPhone ?? '-' },
              { key: 'e', label: 'Email', children: data.family.contactEmail ?? '-' },
              { key: 'a', label: 'Address', children: data.family.address ?? '-', span: 2 },
              { key: 'n', label: 'Notes', children: data.family.notes ?? '-', span: 2 },
              { key: 'c', label: 'Created', children: formatDate(data.family.createdAtUtc) },
              { key: 's', label: 'Status', children: data.family.isActive ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
            ]}
          />

          {/* Two-tab split: Household = current `FamilyId == this` roster (the financial unit);
              Family tree = the extended descendant + ancestor graph that crosses household
              boundaries. Spinning a son off into his own family removes him from the Household
              tab but keeps him in the Family tree, with a tag showing his new household. */}
          <Tabs
            defaultActiveKey="household"
            items={[
              {
                key: 'household',
                label: <span><TeamOutlined style={{ marginInlineEnd: 6 }} />Household ({data.members.length})</span>,
                children: (
                  <Space direction="vertical" size={12} style={{ inlineSize: '100%' }}>
                    <Card
                      size="small"
                      style={{ border: '1px solid var(--jm-border)' }}
                      extra={(() => {
                        // Both Branch off and Transfer headship need at least one non-head
                        // member: branch off takes a non-head member and makes them head of
                        // the new family; transfer needs somebody else to hand the role to.
                        // Tooltip-explain the disabled state instead of leaving the user to
                        // guess - especially relevant on freshly-spun-off single-member households.
                        const onlyHead = data.members.length <= 1;
                        const onlyHeadTip = 'Add at least one more member to this family first - both actions need a non-head member to operate on.';
                        return (
                          <Space>
                            <Tooltip title={onlyHead ? onlyHeadTip : 'Move a member out into a new family with them as head. Lineage stays connected.'}>
                              <Button icon={<BranchesOutlined />} onClick={() => setSpinOffOpen(true)} disabled={onlyHead}>
                                Branch off as new family
                              </Button>
                            </Tooltip>
                            <Tooltip title={onlyHead ? onlyHeadTip : 'Hand the head role to another member of this family.'}>
                              <Button icon={<SwapOutlined />} onClick={() => setTransferOpen(true)} disabled={onlyHead}>
                                Transfer headship
                              </Button>
                            </Tooltip>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add member</Button>
                          </Space>
                        );
                      })()}
                    >
                      {data.members.length === 0 ? (
                        <Empty description="No members in this family yet." />
                      ) : (
                        <Table<FamilyMember>
                          rowKey="id" size="small" pagination={false}
                          columns={columns} dataSource={data.members}
                        />
                      )}
                    </Card>

                    {/* Extended family - relatives whose primary household is elsewhere. The
                        "Add member" modal can create these via the "Record relationship only"
                        toggle. Each row shows the linked member's actual household (if any) so
                        the operator can jump to it. */}
                    <Card
                      size="small"
                      style={{ border: '1px solid var(--jm-border)' }}
                      title={<span><BranchesOutlined style={{ marginInlineEnd: 6 }} />Extended family ({data.extendedLinks.length})</span>}
                    >
                      {data.extendedLinks.length === 0 ? (
                        <Empty
                          description="No extended-family links yet. Use 'Add member' with 'Record relationship only' on to capture relatives who live elsewhere."
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                      ) : (
                        <Table<FamilyExtendedLink>
                          rowKey="linkId" size="small" pagination={false}
                          dataSource={data.extendedLinks}
                          columns={[
                            { title: 'ITS', dataIndex: 'itsNumber', width: 110, render: (v: string) => <span className="jm-tnum">{v}</span> },
                            {
                              title: 'Member',
                              dataIndex: 'fullName',
                              render: (v: string, row) => (
                                <Button type="link" size="small" style={{ padding: 0 }} icon={<UserOutlined />}
                                  onClick={() => navigate(`/members/${row.memberId}`)}>{v}</Button>
                              ),
                            },
                            {
                              title: 'Role',
                              dataIndex: 'role',
                              width: 140,
                              render: (r: FamilyRole) => <Tag>{FamilyRoleLabel[r]}</Tag>,
                            },
                            {
                              title: 'Lives in',
                              key: 'household',
                              render: (_: unknown, row) => row.currentFamilyId ? (
                                <Button type="link" size="small" style={{ padding: 0 }}
                                  onClick={() => navigate(`/families?focus=${row.currentFamilyId}`)}>
                                  {row.currentFamilyCode}{row.currentFamilyName ? ` · ${row.currentFamilyName}` : ''}
                                </Button>
                              ) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span>,
                            },
                            {
                              key: 'actions',
                              width: 100,
                              align: 'end',
                              render: (_: unknown, row) => (
                                <Button size="small" danger type="text" icon={<DeleteOutlined />}
                                  onClick={() => Modal.confirm({
                                    title: 'Remove link?',
                                    content: `Remove the ${FamilyRoleLabel[row.role]} link to ${row.fullName}? Their primary household is unaffected.`,
                                    okText: 'Remove', okButtonProps: { danger: true },
                                    onOk: () => removeLinkMut.mutateAsync(row.linkId),
                                  })}
                                >Remove</Button>
                              ),
                            },
                          ]}
                        />
                      )}
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'tree',
                label: <span><ApartmentOutlined style={{ marginInlineEnd: 6 }} />Family tree</span>,
                children: <FamilyTree familyId={familyId} />,
              },
            ]}
          />
        </Space>
      )}

      {addOpen && data && (
        <AddMemberModal familyId={familyId}
          existingMemberIds={data.members.map((m) => m.id)}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); void refetch(); }} />
      )}
      {transferOpen && data && (
        <TransferHeadModal familyId={familyId} members={data.members} onClose={() => setTransferOpen(false)} onDone={() => { setTransferOpen(false); void refetch(); }} />
      )}
      {spinOffOpen && data && (
        <SpinOffModal
          familyId={familyId}
          members={data.members}
          onClose={() => setSpinOffOpen(false)}
          onDone={() => {
            setSpinOffOpen(false);
            void refetch();
            void qc.invalidateQueries({ queryKey: ['families'] });
            void qc.invalidateQueries({ queryKey: ['family-extended-tree', familyId] });
          }}
        />
      )}
    </Drawer>
  );
}

function AddMemberModal({ familyId, existingMemberIds, onClose, onDone }: {
  familyId: string;
  /// Members already in this family (head + everyone else). Filtered out of the picker only
  /// when adding to the household; for extended-link entries the picker stays open since the
  /// linked member's primary household is irrelevant - they can live anywhere.
  existingMemberIds: readonly string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState<FamilyRole>(99);
  /// LinkOnly = create an extended-kinship link without moving the member's household.
  /// Default off so the long-standing "add to household" behaviour is unchanged for users
  /// who don't notice the toggle.
  const [linkOnly, setLinkOnly] = useState(false);

  const mut = useMutation({
    mutationFn: () => familiesApi.assignMember(familyId, { memberId, role, linkOnly }),
    onSuccess: () => {
      message.success(linkOnly ? 'Extended-family link added.' : 'Member added to family.');
      onDone();
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to add member'); },
  });

  return (
    <Modal
      title="Add member to family"
      open
      onCancel={onClose}
      onOk={() => mut.mutate()}
      confirmLoading={mut.isPending}
      okText={linkOnly ? 'Record link' : 'Add'}
      okButtonProps={{ disabled: !memberId }}
    >
      <Space direction="vertical" size={12} style={{ inlineSize: '100%' }}>
        {/* Primary mode toggle. Lives at the top so the operator decides "what kind of add?"
            before picking the role - the role list and downstream copy adjust to match. */}
        <Card size="small" style={{ background: 'var(--jm-surface-muted, #F8FAFC)' }} styles={{ body: { padding: 12 } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Switch checked={linkOnly} onChange={setLinkOnly} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Record relationship only (don't move household)</div>
              <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 2 }}>
                {linkOnly
                  ? 'An extended-kinship link is created. The member stays in their current household.'
                  : 'The member is moved into this family as part of the household roster.'}
              </div>
            </div>
          </div>
        </Card>

        <div>
          <div style={{ fontSize: 13, marginBlockEnd: 4 }}>Member</div>
          {/* When linking, don't filter by existingMemberIds - a member already in a different
              household is the most common reason to use the link path. We do still filter the
              current household members to avoid a redundant link to someone who's already on
              the roster (the backend rejects this with a friendly error too). */}
          <MemberPicker value={memberId} onChange={setMemberId} excludeIds={existingMemberIds} />
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
            {linkOnly
              ? 'Pick anyone, including a member who lives in another family.'
              : 'The head and current members of this family are filtered out automatically.'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, marginBlockEnd: 4 }}>Role in family</div>
          <Select value={role} onChange={setRole} style={{ inlineSize: '100%' }}
            options={Object.entries(FamilyRoleLabel)
              .filter(([v]) => v !== '1') /* Head is reserved for transfer-headship */
              .map(([v, l]) => ({ value: Number(v), label: l }))}
          />
        </div>
        {!linkOnly && (
          <Alert type="info" showIcon message="Use Transfer headship to replace the family head." />
        )}
        {linkOnly && (
          <Alert type="info" showIcon
            message="Lineage stays connected"
            description="The member's primary household and family-tree position are unchanged. This row records the relationship for reporting and will appear in the Extended family section." />
        )}
      </Space>
    </Modal>
  );
}

function TransferHeadModal({ familyId, members, onClose, onDone }: {
  familyId: string; members: FamilyMember[]; onClose: () => void; onDone: () => void
}) {
  const { message } = AntdApp.useApp();
  const [newHead, setNewHead] = useState<string>('');
  const candidates = members.filter((m) => !m.isHead);

  const mut = useMutation({
    mutationFn: () => familiesApi.transferHeadship(familyId, newHead),
    onSuccess: () => { message.success('Headship transferred.'); onDone(); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to transfer headship'); },
  });

  return (
    <Modal
      title="Transfer headship"
      open
      onCancel={onClose}
      onOk={() => mut.mutate()}
      confirmLoading={mut.isPending}
      okText="Transfer"
      okButtonProps={{ disabled: !newHead }}
    >
      <Space direction="vertical" size={12} style={{ inlineSize: '100%' }}>
        <Alert type="warning" showIcon message="The current head will become a regular member." />
        <Select value={newHead || undefined} onChange={setNewHead} placeholder="Pick the new head" style={{ inlineSize: '100%' }}
          options={candidates.map((m) => ({ value: m.id, label: `${m.itsNumber} - ${m.fullName}` }))}
        />
      </Space>
    </Modal>
  );
}

/// Spin a member out of this family into a new household. Single transaction on the server -
/// it creates the new Family, moves the new head and (optionally) their spouse, and stamps
/// the mutual SpouseItsNumber link if either side was missing it. Lineage ITS pointers
/// (Father/Mother) are preserved so the extended-tree view threads the new family back to
/// this one.
function SpinOffModal({ familyId, members, onClose, onDone }: {
  familyId: string; members: FamilyMember[]; onClose: () => void; onDone: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [newHeadMemberId, setNewHeadMemberId] = useState<string>('');
  const [spouseMemberId, setSpouseMemberId] = useState<string>('');
  const [familyName, setFamilyName] = useState<string>('');

  // The new head must be a current member of this family; the source family's head
  // can't be the new head (they ARE the source family - the backend rejects this too).
  const candidates = members.filter((m) => !m.isHead);

  // Auto-suggest a family name from the picked member's last name. The operator can
  // overwrite, but this saves a step in the common case (Son1's surname → "Son1's family").
  const handlePickHead = (id: string) => {
    setNewHeadMemberId(id);
    if (!familyName) {
      const member = candidates.find((m) => m.id === id);
      const lastName = member?.fullName.trim().split(/\s+/).slice(-1)[0];
      if (lastName) setFamilyName(`${lastName} family`);
    }
  };

  const mut = useMutation({
    mutationFn: () => familiesApi.spinOff(familyId, {
      newHeadMemberId,
      familyName,
      spouseMemberId: spouseMemberId || null,
    }),
    onSuccess: (created) => { message.success(`Branched off into ${created.code}.`); onDone(); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to branch off into new family'); },
  });

  return (
    <Modal
      title="Branch off as a new family"
      open
      onCancel={onClose}
      onOk={() => mut.mutate()}
      confirmLoading={mut.isPending}
      okText="Branch off"
      okButtonProps={{ disabled: !newHeadMemberId || !familyName.trim() }}
      width={520}
    >
      <Space direction="vertical" size={12} style={{ inlineSize: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Lineage stays connected"
          description="The branching member's parent ITS pointers are preserved, so the new family still appears under the source family in the Family tree view."
        />

        <div>
          <div style={{ fontSize: 13, marginBlockEnd: 4 }}>New head (from this family) <span style={{ color: 'var(--jm-danger)' }}>*</span></div>
          <Select
            value={newHeadMemberId || undefined}
            onChange={handlePickHead}
            placeholder="Pick the member who'll head the new household"
            style={{ inlineSize: '100%' }}
            options={candidates.map((m) => ({ value: m.id, label: `${m.itsNumber} - ${m.fullName}` }))}
          />
        </div>

        <div>
          <div style={{ fontSize: 13, marginBlockEnd: 4 }}>Spouse (optional)</div>
          <MemberPicker
            value={spouseMemberId}
            onChange={setSpouseMemberId}
            excludeIds={newHeadMemberId ? [newHeadMemberId] : []}
          />
          <div style={{ fontSize: 11, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>
            Pick anyone - including a daughter or son in another family. They'll be moved to this new household; their lineage to their parents stays intact, so the source family's tree still shows them tagged with the new household. Blocked only if they're already the head, or already a spouse, of a different active family.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, marginBlockEnd: 4 }}>New family name <span style={{ color: 'var(--jm-danger)' }}>*</span></div>
          <Input
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="e.g. Saifuddin family"
            maxLength={200}
          />
        </div>
      </Space>
    </Modal>
  );
}
