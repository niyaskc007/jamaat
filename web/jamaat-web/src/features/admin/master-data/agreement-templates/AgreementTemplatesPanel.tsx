import { useEffect, useState } from 'react';
import { Button, Card, Input, Space, Table, Tag, Dropdown, App as AntdApp, Empty, Drawer, Form, Select, Switch, Alert } from 'antd';
import type { TableProps, MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, MoreOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, CopyOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { agreementTemplatesApi, type AgreementTemplate } from '../../../commitments/commitmentsApi';
import { fundTypesApi } from '../fund-types/fundTypesApi';
import { extractProblem } from '../../../../shared/api/client';
import { formatDate } from '../../../../shared/format/format';

export function AgreementTemplatesPanel() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ page: 1, pageSize: 25 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AgreementTemplate | null>(null);

  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['agreement-templates', query, search],
    queryFn: () => agreementTemplatesApi.list({ ...query, search }),
    placeholderData: keepPreviousData,
  });

  const placeholdersQ = useQuery({ queryKey: ['agreement-placeholders'], queryFn: agreementTemplatesApi.placeholders });

  const removeMut = useMutation({
    mutationFn: (id: string) => agreementTemplatesApi.remove(id),
    onSuccess: () => { message.success('Template removed / deactivated.'); void qc.invalidateQueries({ queryKey: ['agreement-templates'] }); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to remove template'); },
  });

  const columns: TableProps<AgreementTemplate>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 120, render: (v: string) => <span className="jm-tnum">{v}</span> },
    {
      title: 'Name', dataIndex: 'name',
      render: (v: string, row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 500 }}>{v}{row.isDefault && <Tag color="gold" style={{ marginInlineStart: 8 }}>Default</Tag>}</span>
          <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>v{row.version} · {row.language}</span>
        </div>
      ),
    },
    {
      title: 'Fund', dataIndex: 'fundTypeCode', width: 160,
      render: (c: string | null | undefined, row) =>
        c ? <span>{c}{row.fundTypeName ? ` — ${row.fundTypeName}` : ''}</span>
          : <span style={{ color: 'var(--jm-gray-400)' }}>Any fund</span>,
    },
    {
      title: 'Status', dataIndex: 'isActive', width: 110,
      render: (a: boolean) => <Tag color={a ? 'green' : 'default'} style={{ margin: 0 }}>{a ? 'Active' : 'Inactive'}</Tag>,
    },
    { title: 'Created', dataIndex: 'createdAtUtc', width: 140, render: (v: string) => formatDate(v) },
    {
      key: 'actions', width: 64, fixed: 'right',
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setEditing(row); setDrawerOpen(true); } },
          { type: 'divider' },
          {
            key: 'delete', icon: <DeleteOutlined />, danger: true, label: 'Delete / deactivate',
            onClick: () => modal.confirm({
              title: 'Remove this template?',
              content: 'If the template is referenced by any commitments it will be deactivated instead of deleted.',
              okText: 'Remove', okButtonProps: { danger: true },
              onOk: () => removeMut.mutateAsync(row.id),
            }),
          },
        ];
        return <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"><Button type="text" icon={<MoreOutlined />} /></Dropdown>;
      },
    },
  ];

  const empty = !isLoading && (data?.total ?? 0) === 0;

  return (
    <Card
      style={{ border: '1px solid var(--jm-border)' }}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBlockEnd: '1px solid var(--jm-border)' }}>
        <Input
          placeholder="Search code or name"
          prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => setQuery((q) => ({ ...q, page: 1 }))}
          style={{ inlineSize: 320 }}
        />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>
          New template
        </Button>
      </div>

      <Table<AgreementTemplate>
        rowKey="id" size="middle" loading={isLoading}
        columns={columns} dataSource={data?.items ?? []}
        onChange={(p) => setQuery((q) => ({ ...q, page: p.current ?? 1, pageSize: p.pageSize ?? 25 }))}
        pagination={{
          current: query.page, pageSize: query.pageSize, total: data?.total ?? 0,
          showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100],
        }}
        locale={{
          emptyText: empty ? (
            <Empty
              image={<FileTextOutlined style={{ fontSize: 40, color: 'var(--jm-gray-300)' }} />}
              styles={{ image: { blockSize: 56 } }}
              description="No agreement templates defined yet."
            />
          ) : undefined,
        }}
      />

      <TemplateFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        template={editing}
        placeholders={placeholdersQ.data ?? []}
      />
    </Card>
  );
}

function TemplateFormDrawer({ open, onClose, template, placeholders }: {
  open: boolean; onClose: () => void; template: AgreementTemplate | null; placeholders: string[]
}) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const isEdit = !!template;

  const fundsQ = useQuery({ queryKey: ['fund-types-all'], queryFn: () => fundTypesApi.list({ page: 1, pageSize: 200 }) });

  const [code, setCode] = useState(template?.code ?? '');
  const [name, setName] = useState(template?.name ?? '');
  const [language, setLanguage] = useState(template?.language ?? 'en');
  const [fundTypeId, setFundTypeId] = useState<string | undefined>(template?.fundTypeId ?? undefined);
  const [body, setBody] = useState(template?.bodyMarkdown ?? '');
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [isActive, setIsActive] = useState(template?.isActive ?? true);

  // Reset when opened on a different template
  useEffect(() => {
    if (!open) return;
    setCode(template?.code ?? '');
    setName(template?.name ?? '');
    setLanguage(template?.language ?? 'en');
    setFundTypeId(template?.fundTypeId ?? undefined);
    setBody(template?.bodyMarkdown ?? '');
    setIsDefault(template?.isDefault ?? false);
    setIsActive(template?.isActive ?? true);
  }, [open, template]);

  const createMut = useMutation({
    mutationFn: agreementTemplatesApi.create,
    onSuccess: () => { message.success('Template created.'); void qc.invalidateQueries({ queryKey: ['agreement-templates'] }); onClose(); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to create'); },
  });
  const updateMut = useMutation({
    mutationFn: (id: string) => agreementTemplatesApi.update(id, {
      name, bodyMarkdown: body, language, fundTypeId: fundTypeId ?? null, isDefault, isActive,
    }),
    onSuccess: () => { message.success('Template updated.'); void qc.invalidateQueries({ queryKey: ['agreement-templates'] }); onClose(); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to update'); },
  });

  const submit = () => {
    if (isEdit) updateMut.mutate(template.id);
    else createMut.mutate({ code, name, bodyMarkdown: body, language, fundTypeId: fundTypeId ?? null, isDefault });
  };

  const insertToken = (token: string) => setBody((b) => b + (b.endsWith('\n') || b === '' ? '' : ' ') + `{{${token}}}`);

  return (
    <Drawer
      title={isEdit ? `Edit template · ${template!.code}` : 'New agreement template'}
      open={open}
      onClose={onClose}
      width={760}
      destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary"
            loading={createMut.isPending || updateMut.isPending}
            disabled={!name || !body || (!isEdit && !code)}
            onClick={submit}
          >{isEdit ? 'Save changes' : 'Create'}</Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        {!isEdit && (
          <Form.Item label="Code" required help="Unique identifier — cannot be changed later.">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., MADRASA_PLEDGE" />
          </Form.Item>
        )}
        <Form.Item label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Form.Item>
        <Space wrap>
          <Form.Item label="Language" style={{ inlineSize: 160 }}>
            <Select value={language} onChange={setLanguage}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ar', label: 'Arabic' },
                { value: 'hi', label: 'Hindi' },
                { value: 'ur', label: 'Urdu' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Fund type (optional)" style={{ inlineSize: 320 }} help="Leave blank to apply as a generic default.">
            <Select allowClear
              value={fundTypeId}
              onChange={setFundTypeId}
              placeholder="Any fund"
              showSearch optionFilterProp="label"
              options={(fundsQ.data?.items ?? []).map((f) => ({ value: f.id, label: `${f.code} — ${f.nameEnglish}` }))}
            />
          </Form.Item>
          <Form.Item label="Default">
            <Switch checked={isDefault} onChange={setIsDefault} />
          </Form.Item>
          {isEdit && (
            <Form.Item label="Active">
              <Switch checked={isActive} onChange={setIsActive} />
            </Form.Item>
          )}
        </Space>

        <Alert
          type="info" showIcon
          style={{ marginBlockEnd: 12 }}
          message="Placeholders — click to insert at the end"
          description={
            <Space wrap size={4} style={{ marginBlockStart: 8 }}>
              {placeholders.map((p) => (
                <Tag key={p}
                  style={{ cursor: 'pointer', background: 'var(--jm-surface-muted)' }}
                  onClick={() => insertToken(p)}
                ><CopyOutlined /> {p}</Tag>
              ))}
            </Space>
          }
        />

        <Form.Item label="Body (markdown)" required>
          <Input.TextArea
            autoSize={{ minRows: 14, maxRows: 30 }}
            value={body} onChange={(e) => setBody(e.target.value)}
            style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
            placeholder="# Pledge Agreement&#10;&#10;I, {{party_name}}, pledge…"
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
