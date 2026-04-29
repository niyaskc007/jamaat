import { useState } from 'react';
import { Drawer, Spin, Card, Space, Tag, Button, Table, Descriptions, Select, Empty, App as AntdApp, Modal, Alert } from 'antd';
import type { TableProps } from 'antd';
import { CrownOutlined, DeleteOutlined, PlusOutlined, SwapOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { familiesApi, type FamilyMember, type FamilyRole, FamilyRoleLabel } from './familiesApi';
import { MemberPicker } from './FamilyFormDrawer';
import { FamilyTree } from './FamilyTree';
import { extractProblem } from '../../shared/api/client';
import { formatDate } from '../../shared/format/format';

export function FamilyDetailDrawer({ familyId, onClose }: { familyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['family', familyId],
    queryFn: () => familiesApi.get(familyId),
    enabled: !!familyId,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const removeMemberMut = useMutation({
    mutationFn: (memberId: string) => familiesApi.removeMember(familyId, memberId),
    onSuccess: () => { message.success('Member removed from family.'); void refetch(); void qc.invalidateQueries({ queryKey: ['families'] }); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to remove member'); },
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

          <Card
            title={<span><TeamOutlined style={{ marginInlineEnd: 8 }} />Members</span>}
            size="small"
            style={{ border: '1px solid var(--jm-border)' }}
            extra={
              <Space>
                <Button icon={<SwapOutlined />} onClick={() => setTransferOpen(true)} disabled={data.members.length <= 1}>
                  Transfer headship
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add member</Button>
              </Space>
            }
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

          {/* Auto-built relationship tree from each member's Father/Mother/Spouse ITS refs.
              Shows parents → self+spouse → children for the head; auditors can scan family
              structure without clicking through every profile. */}
          <FamilyTree familyId={familyId} headMemberId={data.family.headMemberId} members={data.members} />
        </Space>
      )}

      {addOpen && data && (
        <AddMemberModal familyId={familyId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); void refetch(); }} />
      )}
      {transferOpen && data && (
        <TransferHeadModal familyId={familyId} members={data.members} onClose={() => setTransferOpen(false)} onDone={() => { setTransferOpen(false); void refetch(); }} />
      )}
    </Drawer>
  );
}

function AddMemberModal({ familyId, onClose, onDone }: { familyId: string; onClose: () => void; onDone: () => void }) {
  const { message } = AntdApp.useApp();
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState<FamilyRole>(99);

  const mut = useMutation({
    mutationFn: () => familiesApi.assignMember(familyId, { memberId, role }),
    onSuccess: () => { message.success('Member added to family.'); onDone(); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to add member'); },
  });

  return (
    <Modal
      title="Add member to family"
      open
      onCancel={onClose}
      onOk={() => mut.mutate()}
      confirmLoading={mut.isPending}
      okText="Add"
      okButtonProps={{ disabled: !memberId }}
    >
      <Space direction="vertical" size={12} style={{ inlineSize: '100%' }}>
        <div>
          <div style={{ fontSize: 13, marginBlockEnd: 4 }}>Member</div>
          <MemberPicker value={memberId} onChange={setMemberId} />
        </div>
        <div>
          <div style={{ fontSize: 13, marginBlockEnd: 4 }}>Role in family</div>
          <Select value={role} onChange={setRole} style={{ inlineSize: '100%' }}
            options={Object.entries(FamilyRoleLabel)
              .filter(([v]) => v !== '1') /* Head is reserved for transfer-headship */
              .map(([v, l]) => ({ value: Number(v), label: l }))}
          />
        </div>
        <Alert type="info" showIcon message="Use Transfer headship to replace the family head." />
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
