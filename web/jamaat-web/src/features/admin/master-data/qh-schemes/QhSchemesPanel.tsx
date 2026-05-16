import { useMemo, useState } from 'react';
import { Card, Table, Tag, Button, App as AntdApp, Modal, Form, Input, Select, InputNumber, Switch, Typography, Space } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { qhSchemesApi, type QhScheme, type CreateQhScheme, type UpdateQhScheme } from './qhSchemesApi';
import { useSuperAdminDelete } from '../../trash/useSuperAdminDelete';

/// Admin master-data CRUD for Qarzan Hasana schemes. Replaces the legacy
/// two-value enum so a Jamaat can author 10+ schemes (with one level of
/// subcategories) without code changes. The form's conditional "gold
/// collateral details" panel is driven by `requiresGoldCollateral` on the
/// scheme, so a new gold-backed scheme is a single CRUD create away.
export function QhSchemesPanel() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { data, isLoading } = useQuery({ queryKey: ['qh-schemes'], queryFn: () => qhSchemesApi.list(true) });
  const [editing, setEditing] = useState<QhScheme | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const sa = useSuperAdminDelete<QhScheme>({
    entityType: 'QhScheme',
    invalidateKey: ['qh-schemes'],
    labelFor: (r) => `${r.code} - ${r.name}`,
  });

  // Top-level schemes only (no parent). Used to populate the parent picker on
  // create/edit and to derive an indented display order for the table.
  const parents = useMemo(() => (data ?? []).filter((s) => !s.parentSchemeId), [data]);

  // Build a render order that puts each top-level scheme followed by its
  // children. Cheaper than recursively rendering nested tables; keeps a flat
  // AntD Table with an "Under" column.
  const ordered = useMemo(() => {
    const rows = [...(data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const top = rows.filter((s) => !s.parentSchemeId);
    const out: QhScheme[] = [];
    for (const p of top) {
      out.push(p);
      out.push(...rows.filter((s) => s.parentSchemeId === p.id));
    }
    return out;
  }, [data]);

  const remove = useMutation({
    mutationFn: (id: string) => qhSchemesApi.remove(id),
    onSuccess: () => { message.success('Scheme removed.'); void qc.invalidateQueries({ queryKey: ['qh-schemes'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  const cols: TableProps<QhScheme>['columns'] = [
    {
      title: 'Code', dataIndex: 'code', width: 160,
      render: (v: string, r) => (
        <span style={{ paddingInlineStart: r.parentSchemeId ? 20 : 0 }}>
          {r.parentSchemeId && <span style={{ color: 'var(--jm-gray-400)', marginInlineEnd: 4 }}>↳</span>}
          <code style={{ fontSize: 12 }}>{v}</code>
        </span>
      ),
    },
    { title: 'Name', dataIndex: 'name' },
    {
      title: 'Under', dataIndex: 'parentSchemeName',
      render: (v: string | null) => v ? <Tag color="default">{v}</Tag> : <Tag color="blue">Top-level</Tag>,
    },
    {
      title: 'Gold required', dataIndex: 'requiresGoldCollateral', align: 'center', width: 130,
      render: (v: boolean) => v
        ? <Tag color="gold" icon={<BankOutlined />}>Yes</Tag>
        : <Tag color="default">No</Tag>,
    },
    { title: 'Sort', dataIndex: 'sortOrder', align: 'right', width: 80 },
    {
      title: 'Legacy', dataIndex: 'legacySchemeValue', align: 'center', width: 80,
      render: (v: number) => v > 0
        ? <Tag color="default" style={{ fontFamily: 'monospace' }}>{v}</Tag>
        : <span style={{ color: 'var(--jm-gray-400)' }}>—</span>,
    },
    {
      title: 'Status', dataIndex: 'isActive', align: 'center', width: 100,
      render: (v: boolean) => v ? <Tag color="green">Active</Tag> : <Tag color="default">Inactive</Tag>,
    },
    {
      title: '', key: 'actions', width: 150, align: 'right',
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label="Edit" />
          <Button size="small" danger icon={<DeleteOutlined />}
            onClick={() => modal.confirm({
              title: `Delete ${r.code}?`,
              content: 'Hard-delete only works if no loans exist under this scheme and it has no subcategories. Toggle inactive otherwise.',
              okType: 'danger', okText: 'Delete', onOk: () => remove.mutate(r.id),
            })} aria-label="Delete" />
          {sa.canSoftDelete && (
            <Button size="small" danger icon={<DeleteOutlined />}
              title="SuperAdmin delete (impact preview + 30-day retention)"
              onClick={() => sa.trigger(r)}>SA</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12, alignItems: 'center' }}>
        <Typography.Text type="secondary" style={{ flex: 1, fontSize: 13 }}>
          Schemes drive the Qarzan Hasana application form. Members pick a scheme when
          applying; if the scheme has <strong>Gold required</strong> set, the form asks for
          gold weight / karat / held-at + a slip URL. Subcategories let you split a parent
          like &quot;Mohammadi&quot; into &quot;Mohammadi - Gold&quot; / &quot;Mohammadi - Silver&quot;.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New scheme</Button>
      </div>

      <Card className="jm-card" styles={{ body: { padding: 0 } }}>
        <Table<QhScheme>
          rowKey="id" size="middle" loading={isLoading} columns={cols}
          dataSource={ordered}
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      </Card>

      {(createOpen || editing) && (
        <SchemeFormModal
          open={createOpen || !!editing}
          editing={editing}
          parents={parents}
          onClose={() => { setCreateOpen(false); setEditing(null); }}
        />
      )}
      {sa.modal}
    </>
  );
}

function SchemeFormModal({
  open, editing, parents, onClose,
}: { open: boolean; editing: QhScheme | null; parents: QhScheme[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!editing;

  // Pre-fill values when editing; reset when creating.
  // Antd resets via initialValues + form key change.
  const initial = isEdit ? {
    code: editing.code,
    name: editing.name,
    description: editing.description ?? '',
    parentSchemeId: editing.parentSchemeId,
    requiresGoldCollateral: editing.requiresGoldCollateral,
    sortOrder: editing.sortOrder,
    isActive: editing.isActive,
    legacySchemeValue: editing.legacySchemeValue,
  } : {
    requiresGoldCollateral: false, sortOrder: 100, isActive: true, legacySchemeValue: 0,
  };

  const save = useMutation({
    mutationFn: async (v: Record<string, unknown>) => {
      if (isEdit) {
        return qhSchemesApi.update(editing!.id, {
          name: v.name as string,
          description: (v.description as string) || null,
          parentSchemeId: (v.parentSchemeId as string) || null,
          requiresGoldCollateral: !!v.requiresGoldCollateral,
          sortOrder: Number(v.sortOrder ?? 100),
          isActive: !!v.isActive,
          legacySchemeValue: Number(v.legacySchemeValue ?? 0),
        } satisfies UpdateQhScheme);
      }
      return qhSchemesApi.create({
        code: v.code as string,
        name: v.name as string,
        description: (v.description as string) || null,
        parentSchemeId: (v.parentSchemeId as string) || null,
        requiresGoldCollateral: !!v.requiresGoldCollateral,
        sortOrder: Number(v.sortOrder ?? 100),
        legacySchemeValue: Number(v.legacySchemeValue ?? 0),
      } satisfies CreateQhScheme);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Scheme updated.' : 'Scheme created.');
      void qc.invalidateQueries({ queryKey: ['qh-schemes'] });
      onClose();
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Save failed.'),
  });

  return (
    <Modal
      title={isEdit ? `Edit scheme — ${editing!.code}` : 'New QH scheme'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save' : 'Create'}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={initial} onFinish={save.mutate}
        requiredMark={false}>
        <Form.Item label="Code"
          name="code" rules={[{ required: !isEdit, message: 'Required.' }]}
          extra="Short uppercase identifier. Members see the name, not this. Cannot change after create.">
          <Input disabled={isEdit} placeholder="e.g. MOH-GOLD" />
        </Form.Item>
        <Form.Item label="Display name" name="name" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="e.g. Mohammadi - Gold collateral" />
        </Form.Item>
        <Form.Item label="Description" name="description"
          extra="Shown as helper text on the QH form when this scheme is picked.">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="Parent scheme (optional)" name="parentSchemeId"
          extra="Only top-level schemes can be parents - max one level of nesting.">
          <Select allowClear options={parents
            .filter((p) => !editing || p.id !== editing.id)
            .map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
        </Form.Item>
        <Form.Item label="Requires gold collateral" name="requiresGoldCollateral" valuePropName="checked"
          extra="When ON, the QH form asks for gold weight, karat, held-at, and a slip URL.">
          <Switch />
        </Form.Item>
        <Space size={16}>
          <Form.Item label="Sort order" name="sortOrder">
            <InputNumber min={0} max={9999} />
          </Form.Item>
          <Form.Item label="Legacy int (for old reports)" name="legacySchemeValue"
            tooltip="Maps this scheme back to one of the original three: 1=Mohammadi, 2=Hussain, 0=Other. Leave 0 for new tenant-specific schemes.">
            <InputNumber min={0} max={99} />
          </Form.Item>
          {isEdit && (
            <Form.Item label="Active" name="isActive" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Space>
      </Form>
    </Modal>
  );
}
