import { useEffect, useMemo, useState } from 'react';
import {
  Tabs, Table, Button, Space, Modal, Form, Input, Select, Switch, Popconfirm,
  Typography, Tag, App as AntdApp, Drawer, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  cmsApi, sectionLabel,
  type CmsBlock, type CmsPage as CmsPageDto, type CmsPageListItem, type CmsPageSection,
} from '../cms/cmsApi';
import { extractProblem } from '../../shared/api/client';

const SECTION_OPTIONS: { value: CmsPageSection; label: 'Legal' | 'Help' | 'Marketing' }[] = [
  { value: 0, label: 'Legal' },
  { value: 1, label: 'Help' },
  { value: 2, label: 'Marketing' },
];

export function CmsAdminPage() {
  return (
    <div>
      <PageHeader
        title="Content Management"
        subtitle="Login screen copy, legal pages (Terms, Privacy), help articles, FAQ — all editable here."
      />
      <Tabs
        defaultActiveKey="pages"
        items={[
          { key: 'pages', label: 'Pages', children: <PagesTab /> },
          { key: 'blocks', label: 'Login & Footer Snippets', children: <BlocksTab /> },
        ]}
      />
    </div>
  );
}

// ---------- Pages tab -----------------------------------------------------

function PagesTab() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [editing, setEditing] = useState<CmsPageDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<CmsPageDto | null>(null);

  const listQ = useQuery({
    queryKey: ['cms-admin-pages'],
    queryFn: () => cmsApi.adminListPages(),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => cmsApi.deletePage(id),
    onSuccess: () => { message.success('Page deleted'); qc.invalidateQueries({ queryKey: ['cms-admin-pages'] }); },
    onError: (err) => { message.error(extractProblem(err).detail ?? 'Delete failed'); },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlockEnd: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>New Page</Button>
      </div>
      <Table<CmsPageListItem>
        loading={listQ.isLoading}
        dataSource={listQ.data ?? []}
        rowKey="id"
        size="middle"
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'Title', dataIndex: 'title', sorter: (a, b) => a.title.localeCompare(b.title) },
          {
            title: 'Slug', dataIndex: 'slug', width: 200,
            render: (slug: string) => <code style={{ fontSize: 12 }}>{slug}</code>,
          },
          {
            title: 'Section', dataIndex: 'section', width: 120,
            filters: SECTION_OPTIONS.map((s) => ({ text: s.label, value: s.value })),
            onFilter: (val, row) => row.section === val,
            render: (s: CmsPageSection) => <Tag color={sectionColor(s)}>{sectionLabel(s)}</Tag>,
          },
          {
            title: 'Status', dataIndex: 'isPublished', width: 110,
            filters: [{ text: 'Published', value: true }, { text: 'Draft', value: false }],
            onFilter: (val, row) => row.isPublished === val,
            render: (b: boolean) => b ? <Tag color="green">Published</Tag> : <Tag color="default">Draft</Tag>,
          },
          {
            title: 'Updated', dataIndex: 'updatedAtUtc', width: 160,
            render: (d: string | null) => d ? new Date(d).toLocaleString() : '—',
          },
          {
            title: 'Actions', key: 'actions', width: 200, align: 'end',
            render: (_, row) => (
              <Space size="small">
                <Button size="small" icon={<EyeOutlined />} onClick={async () => {
                  const full = await cmsApi.adminGetPage(row.id);
                  setPreviewing(full);
                }}>Preview</Button>
                <Button size="small" icon={<EditOutlined />} onClick={async () => {
                  const full = await cmsApi.adminGetPage(row.id);
                  setEditing(full);
                }}>Edit</Button>
                <Popconfirm
                  title="Delete this page?"
                  description={`Slug "${row.slug}" will return 404 to anyone who has the link.`}
                  okType="danger"
                  okText="Delete"
                  onConfirm={() => delMut.mutate(row.id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      {(creating || editing) && (
        <PageEditor
          page={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cms-admin-pages'] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      {previewing && (
        <Drawer
          open
          title={previewing.title}
          onClose={() => setPreviewing(null)}
          width={720}
        >
          <Typography.Paragraph type="secondary">
            <code>{previewing.slug}</code> · {sectionLabel(previewing.section)} · {previewing.isPublished ? 'Published' : 'Draft'}
          </Typography.Paragraph>
          <Divider />
          <div className="jm-cms-body">
            <ReactMarkdown>{previewing.body}</ReactMarkdown>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function PageEditor({ page, onClose, onSaved }: { page: CmsPageDto | null; onClose: () => void; onSaved: () => void }) {
  const isCreate = !page;
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [body, setBody] = useState(page?.body ?? '');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      slug: page?.slug ?? '',
      title: page?.title ?? '',
      section: page?.section ?? 0,
      isPublished: page?.isPublished ?? false,
    });
    setBody(page?.body ?? '');
  }, [page, form]);

  const saveMut = useMutation({
    mutationFn: async (values: { slug: string; title: string; section: CmsPageSection; isPublished: boolean }) => {
      if (isCreate) {
        return cmsApi.createPage({
          slug: values.slug, title: values.title, body, section: values.section, isPublished: values.isPublished,
        });
      }
      return cmsApi.updatePage(page!.id, {
        title: values.title, body, section: values.section, isPublished: values.isPublished,
      });
    },
    onSuccess: () => { message.success(isCreate ? 'Page created' : 'Page saved'); onSaved(); },
    onError: (err) => { message.error(extractProblem(err).detail ?? 'Save failed'); },
  });

  return (
    <Modal
      open
      title={isCreate ? 'New CMS Page' : `Edit: ${page!.title}`}
      width={900}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isCreate ? 'Create' : 'Save'}
      confirmLoading={saveMut.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => saveMut.mutate(values)}
      >
        <Space.Compact style={{ display: 'flex', gap: 12 }}>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true },
              { pattern: /^[a-z0-9][a-z0-9-]*$/, message: 'Lowercase, digits, hyphens only.' },
              { max: 128 },
            ]}
            style={{ flex: 1 }}
          >
            <Input placeholder="terms" disabled={!isCreate} />
          </Form.Item>
          <Form.Item name="section" label="Section" style={{ inlineSize: 160 }}>
            <Select options={SECTION_OPTIONS} />
          </Form.Item>
          <Form.Item name="isPublished" label="Published" valuePropName="checked" style={{ inlineSize: 120 }}>
            <Switch />
          </Form.Item>
        </Space.Compact>
        <Form.Item name="title" label="Title" rules={[{ required: true, max: 200 }]}>
          <Input placeholder="Terms of Service" />
        </Form.Item>
        <Form.Item label="Body (Markdown)" required>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlockEnd: 4 }}>
            <Button size="small" type="link" onClick={() => setShowPreview((p) => !p)}>
              {showPreview ? 'Hide preview' : 'Show preview'}
            </Button>
          </div>
          {showPreview ? (
            <div className="jm-cms-body" style={{ minBlockSize: 300, padding: 16, background: '#FAFAFA', borderRadius: 6 }}>
              <ReactMarkdown>{body || '_(empty)_'}</ReactMarkdown>
            </div>
          ) : (
            <Input.TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              placeholder="## Section heading&#10;&#10;Use Markdown - **bold**, _italic_, [links](https://...), lists, etc."
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13 }}
            />
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------- Blocks tab ----------------------------------------------------

function BlocksTab() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');

  const blocksQ = useQuery({
    queryKey: ['cms-admin-blocks'],
    queryFn: () => cmsApi.adminListBlocks(),
  });

  const upsertMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => cmsApi.upsertBlock(key, value),
    onSuccess: () => {
      message.success('Saved');
      qc.invalidateQueries({ queryKey: ['cms-admin-blocks'] });
      setEditingKey(null);
    },
    onError: (err) => { message.error(extractProblem(err).detail ?? 'Save failed'); },
  });

  const knownKeys = useMemo(() => [
    'login.eyebrow', 'login.title', 'login.subtitle',
    'login.feature.1', 'login.feature.2', 'login.feature.3',
    'footer.tagline',
  ], []);

  // Show all known keys even if not yet stored, plus any extra keys persisted under
  // unfamiliar prefixes (admins can add their own).
  const rows = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of knownKeys) map.set(k, '');
    for (const b of blocksQ.data ?? []) map.set(b.key, b.value);
    return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  }, [blocksQ.data, knownKeys]);

  return (
    <div>
      <Typography.Paragraph type="secondary">
        Short text snippets used by the login screen and footer. Empty blocks fall back to the
        built-in default copy. Edit in place - changes apply on next page load (no deploy).
      </Typography.Paragraph>
      <Table<CmsBlock>
        dataSource={rows}
        rowKey="key"
        size="middle"
        pagination={false}
        loading={blocksQ.isLoading}
        columns={[
          {
            title: 'Key', dataIndex: 'key', width: 220,
            render: (k: string) => <code style={{ fontSize: 12 }}>{k}</code>,
          },
          {
            title: 'Value', dataIndex: 'value',
            render: (v: string, row) => (
              editingKey === row.key
                ? <Input.TextArea autoSize value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
                : <span style={{ color: v ? undefined : '#9CA3AF' }}>{v || '(uses default)'}</span>
            ),
          },
          {
            title: 'Actions', key: 'actions', width: 200, align: 'end',
            render: (_, row) => editingKey === row.key ? (
              <Space size="small">
                <Button size="small" type="primary" loading={upsertMut.isPending}
                        onClick={() => upsertMut.mutate({ key: row.key, value: draftValue })}>
                  Save
                </Button>
                <Button size="small" onClick={() => setEditingKey(null)}>Cancel</Button>
              </Space>
            ) : (
              <Button size="small" icon={<EditOutlined />} onClick={() => {
                setEditingKey(row.key);
                setDraftValue(row.value);
              }}>Edit</Button>
            ),
          },
        ]}
      />
    </div>
  );
}

function sectionColor(s: CmsPageSection): string {
  switch (s) {
    case 0: return 'volcano';
    case 1: return 'blue';
    case 2: return 'gold';
    default: return 'default';
  }
}
