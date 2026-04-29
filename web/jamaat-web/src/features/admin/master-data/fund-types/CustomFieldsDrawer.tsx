import { useState } from 'react';
import { Drawer, Table, Button, Modal, Form, Input, Select, Switch, InputNumber, Space, Tag, Typography, Popconfirm, App as AntdApp } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { fundTypeCustomFieldsApi, CustomFieldTypeLabel, type CustomFieldType, type FundTypeCustomField } from './customFieldsApi';

/// Drawer that lets an admin author the dynamic fields a receipt form will render when a
/// given fund type is chosen. The receipt form reads /active-custom-fields and serialises
/// the captured values into the receipt's CustomFieldsJson on confirm.
export function CustomFieldsDrawer({ open, onClose, fundTypeId, fundTypeCode }: {
  open: boolean; onClose: () => void; fundTypeId: string | null; fundTypeCode?: string;
}) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const fields = useQuery({
    queryKey: ['fund-type-custom-fields', fundTypeId],
    queryFn: () => fundTypeId ? fundTypeCustomFieldsApi.list(fundTypeId) : Promise.resolve([]),
    enabled: !!fundTypeId && open,
  });
  const [editing, setEditing] = useState<FundTypeCustomField | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      fundTypeId ? fundTypeCustomFieldsApi.remove(fundTypeId, id) : Promise.reject(),
    onSuccess: () => { message.success('Removed.'); void qc.invalidateQueries({ queryKey: ['fund-type-custom-fields', fundTypeId] }); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Custom fields · ${fundTypeCode ?? ''}`}
      width={760}
      destroyOnHidden
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New field</Button>}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Fields you author here render automatically on the New Receipt form when this fund is chosen.
        Required fields block submit if empty. <strong>Field key</strong> is the stable internal id -
        change-it-and-old-receipts-no-longer-find-the-value, so be deliberate.
      </Typography.Paragraph>

      <Table<FundTypeCustomField>
        rowKey="id"
        size="small"
        loading={fields.isLoading}
        dataSource={fields.data ?? []}
        pagination={false}
        columns={[
          { title: 'Order', dataIndex: 'sortOrder', width: 60, render: (v: number) => <span className="jm-tnum">{v}</span> },
          { title: 'Key', dataIndex: 'fieldKey', width: 140, render: (v) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>{v}</span> },
          { title: 'Label', dataIndex: 'label', render: (v, row) => <div><div style={{ fontWeight: 500 }}>{v}</div>{row.helpText && <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>{row.helpText}</div>}</div> },
          { title: 'Type', dataIndex: 'fieldType', width: 110, render: (t: CustomFieldType) => CustomFieldTypeLabel[t] },
          { title: 'Required', dataIndex: 'isRequired', width: 90, render: (v: boolean) => v ? <Tag color="red" style={{ margin: 0 }}>Required</Tag> : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
          { title: 'Status', dataIndex: 'isActive', width: 90, render: (v: boolean) => v ? <Tag color="green" style={{ margin: 0 }}>Active</Tag> : <Tag style={{ margin: 0 }}>Inactive</Tag> },
          { title: '', key: 'a', width: 90, render: (_, row) => (
            <Space size={4}>
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)} />
              <Popconfirm title="Delete this field?" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate({ id: row.id })}>
                <Button size="small" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            </Space>
          ) },
        ]}
        locale={{ emptyText: <div style={{ padding: 24, textAlign: 'center', color: 'var(--jm-gray-500)' }}>No custom fields yet</div> }}
      />

      <FieldModal open={createOpen} onClose={() => setCreateOpen(false)} fundTypeId={fundTypeId} />
      <FieldModal open={!!editing} onClose={() => setEditing(null)} fundTypeId={fundTypeId} entity={editing} />
    </Drawer>
  );
}

function FieldModal({ open, onClose, fundTypeId, entity }: { open: boolean; onClose: () => void; fundTypeId: string | null; entity?: FundTypeCustomField | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!entity;

  const mut = useMutation({
    mutationFn: async (v: { fieldKey: string; label: string; fieldType: CustomFieldType; isRequired?: boolean; helpText?: string; optionsCsv?: string; defaultValue?: string; sortOrder?: number; isActive?: boolean }) => {
      if (!fundTypeId) throw new Error('fund type id missing');
      return isEdit && entity
        ? fundTypeCustomFieldsApi.update(fundTypeId, entity.id, {
            label: v.label, fieldType: v.fieldType, isRequired: v.isRequired ?? false,
            helpText: v.helpText, optionsCsv: v.optionsCsv, defaultValue: v.defaultValue,
            sortOrder: v.sortOrder ?? 0, isActive: v.isActive ?? true,
          })
        : fundTypeCustomFieldsApi.create(fundTypeId, v);
    },
    onSuccess: () => { message.success(isEdit ? 'Saved.' : 'Created.'); void qc.invalidateQueries({ queryKey: ['fund-type-custom-fields', fundTypeId] }); onClose(); form.resetFields(); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed.'),
  });

  return (
    <Modal title={isEdit ? `Edit field · ${entity!.fieldKey}` : 'New custom field'} open={open} onCancel={onClose} destroyOnHidden
      onOk={() => form.submit()} okText={isEdit ? 'Save' : 'Create'} confirmLoading={mut.isPending}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={entity ? { ...entity } : { fieldType: 1, isRequired: false, sortOrder: 0, isActive: true }}
        onFinish={(v) => mut.mutate(v)}>
        <Form.Item name="fieldKey" label="Field key" rules={[{ required: true, max: 64, pattern: /^[A-Za-z][A-Za-z0-9_]*$/, message: 'Letters/digits/underscore; must start with a letter' }]}
          tooltip="Stable internal identifier - captured values key off this. Don't rename later or old receipts won't find the value.">
          <Input disabled={isEdit} placeholder="agreement_reference" />
        </Form.Item>
        <Form.Item name="label" label="Label" rules={[{ required: true, max: 200 }]}><Input placeholder="Agreement reference" /></Form.Item>
        <Form.Item name="fieldType" label="Type" rules={[{ required: true }]}>
          <Select options={Object.entries(CustomFieldTypeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
        </Form.Item>
        <Form.Item name="isRequired" label="Required" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="helpText" label="Help text"><Input.TextArea rows={2} maxLength={500} placeholder="Optional - shown beneath the field on the receipt form." /></Form.Item>
        <Form.Item name="optionsCsv" label="Dropdown options (CSV)" tooltip="Only used for the Dropdown field type. Comma-separated, e.g. 'Local, International, LQ'.">
          <Input placeholder="Local, International, LQ" />
        </Form.Item>
        <Form.Item name="defaultValue" label="Default value"><Input /></Form.Item>
        <Form.Item name="sortOrder" label="Sort order"><InputNumber min={0} max={9999} style={{ inlineSize: 120 }} /></Form.Item>
        {isEdit && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Modal>
  );
}
