import { useEffect } from 'react';
import { Drawer, Form, Input, Button, Space, Switch, Select, TreeSelect, App as AntdApp } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { AccountTypeLabel } from '../shared';
import { accountsApi, type Account, type AccountTreeNode, type AccountType } from './accountsApi';

const schema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  type: z.number().int().min(1).max(6),
  parentId: z.string().nullable().optional(),
  isControl: z.boolean(),
  isActive: z.boolean().optional(),
});
type Form = z.infer<typeof schema>;

export function AccountFormDrawer({ open, onClose, account }: { open: boolean; onClose: () => void; account?: Account | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const isEdit = !!account;

  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'], queryFn: accountsApi.tree,
    enabled: open,
  });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', type: 1, parentId: null, isControl: false, isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    reset(account ? {
      code: account.code, name: account.name, type: account.type,
      parentId: account.parentId ?? null, isControl: account.isControl, isActive: account.isActive,
    } : { code: '', name: '', type: 1, parentId: null, isControl: false, isActive: true });
  }, [open, account, reset]);

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      const payload = {
        code: data.code, name: data.name, type: data.type as AccountType,
        parentId: data.parentId ?? null, isControl: data.isControl, isActive: data.isActive ?? true,
      };
      return isEdit && account ? accountsApi.update(account.id, payload) : accountsApi.create(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Account updated' : 'Account created');
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed'); },
  });

  // Build TreeSelect data; exclude self + descendants when editing
  const treeData = useMemo(() => buildTreeSelect(treeQuery.data ?? [], account?.id), [treeQuery.data, account?.id]);

  return (
    <Drawer
      title={isEdit ? `Edit account · ${account?.code}` : 'New account'}
      open={open} onClose={onClose} width={480} destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit((d) => mutation.mutate(d))}>
            {isEdit ? 'Save changes' : 'Create account'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Code" required validateStatus={errors.code ? 'error' : ''} help={errors.code?.message}>
          <Controller name="code" control={control} render={({ field }) => <Input {...field} placeholder="1000" autoFocus />} />
        </Form.Item>
        <Form.Item label="Name" required validateStatus={errors.name ? 'error' : ''} help={errors.name?.message}>
          <Controller name="name" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Type" required>
          <Controller name="type" control={control}
            render={({ field }) => (
              <Select {...field}
                options={Object.entries(AccountTypeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
            )}
          />
        </Form.Item>
        <Form.Item label="Parent">
          <Controller name="parentId" control={control} render={({ field }) => (
            <TreeSelect
              {...field} allowClear showSearch treeNodeFilterProp="title" treeDefaultExpandAll
              placeholder="(None - top level)" value={field.value ?? undefined}
              onChange={(v) => field.onChange(v ?? null)} treeData={treeData}
            />
          )} />
        </Form.Item>
        <Form.Item label="Control account (groups only; postings happen on leaves)">
          <Controller name="isControl" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>
        {isEdit && (
          <Form.Item label="Active">
            <Controller name="isActive" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
          </Form.Item>
        )}
      </Form>
    </Drawer>
  );
}

// Map API tree to AntD TreeSelect data; skip the node being edited (can't parent yourself)
function buildTreeSelect(nodes: AccountTreeNode[], excludeId?: string | null): { value: string; title: string; children?: object[] }[] {
  return nodes
    .filter((n) => n.id !== excludeId)
    .map((n) => ({
      value: n.id,
      title: `${n.code} · ${n.name}`,
      children: buildTreeSelect(n.children, excludeId),
    }));
}

// Import useMemo at the top so TS doesn't complain
import { useMemo } from 'react';
