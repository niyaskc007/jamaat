import { useState } from 'react';
import { Card, Table, Tag, Button, App as AntdApp, Modal, Form, Input, Select, InputNumber, Switch, Tabs, Typography, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { formatDateTime } from '../../../../shared/format/format';
import { fundCategoriesApi, FundCategoryKindLabel, type FundCategory, type FundCategoryKind, type FundSubCategory } from './fundCategoriesApi';

/// Master-data panel for the new admin-managed fund classification.
/// Two tabs:
///   1. Categories (e.g. Permanent Income / Loan Fund) - every fund type belongs to exactly one.
///   2. Sub-categories (e.g. Mohammedi Scheme under Permanent Income) - optional second tier.
/// Both are tenant-scoped and behave like reference data: deactivate rather than delete once
/// any FundType references them; the API enforces that.
export function FundCategoriesPanel() {
  return (
    <Tabs
      items={[
        { key: 'cats', label: 'Categories', children: <CategoriesTab /> },
        { key: 'subs', label: 'Sub-categories', children: <SubCategoriesTab /> },
      ]}
    />
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const { data, isLoading } = useQuery({ queryKey: ['fund-categories'], queryFn: () => fundCategoriesApi.list() });
  const [editing, setEditing] = useState<FundCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => fundCategoriesApi.remove(id),
    onSuccess: () => { message.success('Removed.'); void qc.invalidateQueries({ queryKey: ['fund-categories'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12, alignItems: 'center' }}>
        <Typography.Text type="secondary" style={{ flex: 1, fontSize: 13 }}>
          Top-level classification - Permanent Income, Loan Fund, etc. Each category carries a <strong>kind</strong> that
          drives system behaviour (income vs liability, loan-issuing capability).
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New category</Button>
      </div>

      <Card style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
        <Table<FundCategory>
          rowKey="id" size="middle" loading={isLoading} dataSource={data ?? []} pagination={false}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 140, render: (v) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 500 }}>{v}</span> },
            { title: 'Name', dataIndex: 'name', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
            { title: 'Kind', dataIndex: 'kind', width: 160, render: (k: FundCategoryKind) => <Tag color={kindColor(k)}>{FundCategoryKindLabel[k]}</Tag> },
            { title: 'Description', dataIndex: 'description', render: (v?: string | null) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
            { title: 'Fund types', dataIndex: 'fundTypeCount', width: 110, align: 'right', render: (v: number) => <span className="jm-tnum">{v}</span> },
            { title: 'Subs', dataIndex: 'subCategoryCount', width: 80, align: 'right', render: (v: number) => <span className="jm-tnum">{v}</span> },
            { title: 'Status', dataIndex: 'isActive', width: 100, render: (a: boolean) => a ? <Tag color="green" style={{ margin: 0 }}>Active</Tag> : <Tag style={{ margin: 0 }}>Inactive</Tag> },
            { title: 'Created', dataIndex: 'createdAtUtc', width: 180, render: (v: string) => formatDateTime(v) },
            { title: '', key: 'a', width: 110, render: (_, row) => (
              <Space size={4}>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)} />
                <Button size="small" icon={<DeleteOutlined />} danger
                  disabled={row.fundTypeCount > 0 || row.subCategoryCount > 0}
                  title={row.fundTypeCount > 0 || row.subCategoryCount > 0 ? 'In use - deactivate instead' : 'Delete'}
                  onClick={() => modal.confirm({
                    title: `Delete category "${row.name}"?`,
                    content: 'Permanent. Use only when nothing references this category.',
                    okText: 'Delete', okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(row.id),
                  })} />
              </Space>
            ) },
          ]}
          locale={{ emptyText: <div style={{ padding: 32, textAlign: 'center', color: 'var(--jm-gray-500)' }}><AppstoreOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No categories yet</div> }}
        />
      </Card>

      <CategoryModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <CategoryModal open={!!editing} onClose={() => setEditing(null)} entity={editing} />
    </>
  );
}

function CategoryModal({ open, onClose, entity }: { open: boolean; onClose: () => void; entity?: FundCategory | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!entity;

  const mut = useMutation({
    mutationFn: async (v: { code: string; name: string; kind: FundCategoryKind; description?: string; sortOrder?: number; isActive?: boolean }) =>
      isEdit && entity
        ? fundCategoriesApi.update(entity.id, { name: v.name, kind: v.kind, description: v.description, sortOrder: v.sortOrder ?? 0, isActive: v.isActive ?? true })
        : fundCategoriesApi.create(v),
    onSuccess: () => { message.success(isEdit ? 'Saved.' : 'Created.'); void qc.invalidateQueries({ queryKey: ['fund-categories'] }); onClose(); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  return (
    <Modal title={isEdit ? `Edit category · ${entity!.name}` : 'New fund category'} open={open} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} okText={isEdit ? 'Save' : 'Create'} confirmLoading={mut.isPending}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={entity ? { ...entity } : { kind: 1, sortOrder: 0, isActive: true }}
        onFinish={(v) => mut.mutate(v)}>
        <Form.Item name="code" label="Code" rules={[{ required: true, max: 32, pattern: /^[A-Z0-9_-]+$/i, message: 'Letters, digits, underscore, hyphen' }]}
          tooltip="Internal identifier - uppercased on save (e.g. PERM_INCOME, MOHAMMEDI_SCHEME).">
          <Input disabled={isEdit} placeholder="PERM_INCOME" />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 200 }]}><Input placeholder="Permanent Income" /></Form.Item>
        <Form.Item name="kind" label="Kind" rules={[{ required: true }]}
          tooltip="Drives system behaviour. PermanentIncome→receipts post to income. TemporaryIncome→returnable obligation. LoanFund→can also issue loans.">
          <Select options={Object.entries(FundCategoryKindLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
        </Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <Form.Item name="sortOrder" label="Sort order"><InputNumber min={0} max={9999} style={{ inlineSize: 120 }} /></Form.Item>
        {isEdit && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Modal>
  );
}

function SubCategoriesTab() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const cats = useQuery({ queryKey: ['fund-categories'], queryFn: () => fundCategoriesApi.list() });
  const subs = useQuery({ queryKey: ['fund-sub-categories'], queryFn: () => fundCategoriesApi.listSubs() });
  const [editing, setEditing] = useState<FundSubCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => fundCategoriesApi.removeSub(id),
    onSuccess: () => { message.success('Removed.'); void qc.invalidateQueries({ queryKey: ['fund-sub-categories'] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBlockEnd: 12, alignItems: 'center' }}>
        <Typography.Text type="secondary" style={{ flex: 1, fontSize: 13 }}>
          Optional second tier under a category - e.g. Mohammedi Scheme + Hussaini Scheme under different income categories.
          Many fund types can map to the same sub-category.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} disabled={!cats.data || cats.data.length === 0}>
          New sub-category
        </Button>
      </div>

      <Card style={{ border: '1px solid var(--jm-border)' }} styles={{ body: { padding: 0 } }}>
        <Table<FundSubCategory>
          rowKey="id" size="middle" loading={subs.isLoading} dataSource={subs.data ?? []} pagination={false}
          columns={[
            { title: 'Category', dataIndex: 'fundCategoryName', width: 200, render: (v: string, row) => <span style={{ fontWeight: 500 }}>{v} <span style={{ color: 'var(--jm-gray-400)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>· {row.fundCategoryCode}</span></span> },
            { title: 'Code', dataIndex: 'code', width: 140, render: (v) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 500 }}>{v}</span> },
            { title: 'Name', dataIndex: 'name', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
            { title: 'Description', dataIndex: 'description', render: (v?: string | null) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
            { title: 'Fund types', dataIndex: 'fundTypeCount', width: 110, align: 'right', render: (v: number) => <span className="jm-tnum">{v}</span> },
            { title: 'Status', dataIndex: 'isActive', width: 100, render: (a: boolean) => a ? <Tag color="green" style={{ margin: 0 }}>Active</Tag> : <Tag style={{ margin: 0 }}>Inactive</Tag> },
            { title: '', key: 'a', width: 110, render: (_, row) => (
              <Space size={4}>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)} />
                <Button size="small" icon={<DeleteOutlined />} danger
                  disabled={row.fundTypeCount > 0}
                  title={row.fundTypeCount > 0 ? 'In use - deactivate instead' : 'Delete'}
                  onClick={() => modal.confirm({
                    title: `Delete sub-category "${row.name}"?`,
                    okText: 'Delete', okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(row.id),
                  })} />
              </Space>
            ) },
          ]}
          locale={{ emptyText: <div style={{ padding: 32, textAlign: 'center', color: 'var(--jm-gray-500)' }}><AppstoreOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No sub-categories yet</div> }}
        />
      </Card>

      <SubCategoryModal open={createOpen} onClose={() => setCreateOpen(false)} categories={cats.data ?? []} />
      <SubCategoryModal open={!!editing} onClose={() => setEditing(null)} entity={editing} categories={cats.data ?? []} />
    </>
  );
}

function SubCategoryModal({ open, onClose, entity, categories }: { open: boolean; onClose: () => void; entity?: FundSubCategory | null; categories: FundCategory[] }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!entity;

  const mut = useMutation({
    mutationFn: async (v: { fundCategoryId: string; code: string; name: string; description?: string; sortOrder?: number; isActive?: boolean }) =>
      isEdit && entity
        ? fundCategoriesApi.updateSub(entity.id, { fundCategoryId: v.fundCategoryId, name: v.name, description: v.description, sortOrder: v.sortOrder ?? 0, isActive: v.isActive ?? true })
        : fundCategoriesApi.createSub(v),
    onSuccess: () => { message.success(isEdit ? 'Saved.' : 'Created.'); void qc.invalidateQueries({ queryKey: ['fund-sub-categories'] }); onClose(); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  return (
    <Modal title={isEdit ? `Edit sub-category · ${entity!.name}` : 'New fund sub-category'} open={open} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} okText={isEdit ? 'Save' : 'Create'} confirmLoading={mut.isPending}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={entity ? { ...entity } : { sortOrder: 0, isActive: true }}
        onFinish={(v) => mut.mutate(v)}>
        <Form.Item name="fundCategoryId" label="Parent category" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label"
            options={categories.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} />
        </Form.Item>
        <Form.Item name="code" label="Code" rules={[{ required: true, max: 32, pattern: /^[A-Z0-9_-]+$/i, message: 'Letters, digits, underscore, hyphen' }]}>
          <Input disabled={isEdit} placeholder="MOHAMMEDI" />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 200 }]}><Input placeholder="Mohammedi Scheme" /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <Form.Item name="sortOrder" label="Sort order"><InputNumber min={0} max={9999} style={{ inlineSize: 120 }} /></Form.Item>
        {isEdit && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Modal>
  );
}

function kindColor(k: FundCategoryKind): string {
  return k === 1 ? 'green' : k === 2 ? 'gold' : k === 3 ? 'blue' : k === 4 ? 'purple' : k === 5 ? 'cyan' : 'default';
}
