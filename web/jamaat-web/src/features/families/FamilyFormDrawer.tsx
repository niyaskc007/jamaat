import { useEffect, useMemo, useState } from 'react';
import { Drawer, Form, Input, Button, Space, Alert, Select, Spin, Switch } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp } from 'antd';
import type { Family } from './familiesApi';
import { familiesApi } from './familiesApi';
import { membersApi, type Member } from '../members/membersApi';
import { extractProblem } from '../../shared/api/client';

const createSchema = z.object({
  familyName: z.string().min(1, 'Family name is required').max(200),
  headMemberId: z.string().uuid('Pick the head of this family'),
  contactPhone: z.string().max(32).optional().or(z.literal('')),
  contactEmail: z.string().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

const updateSchema = z.object({
  familyName: z.string().min(1).max(200),
  contactPhone: z.string().max(32).optional().or(z.literal('')),
  contactEmail: z.string().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  isActive: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;
type UpdateForm = z.infer<typeof updateSchema>;

type Props = { open: boolean; onClose: () => void; family?: Family | null };

export function FamilyFormDrawer({ open, onClose, family }: Props) {
  return family
    ? <EditForm open={open} onClose={onClose} family={family} />
    : <CreateForm open={open} onClose={onClose} />;
}

function CreateForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { control, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { familyName: '', headMemberId: '' },
  });
  useEffect(() => { if (open) reset({ familyName: '', headMemberId: '' }); }, [open, reset]);

  const mutation = useMutation({
    mutationFn: familiesApi.create,
    onSuccess: (f) => {
      message.success(`Family ${f.familyName} (${f.code}) created.`);
      void qc.invalidateQueries({ queryKey: ['families'] });
      onClose();
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? p.title ?? 'Failed to create family'); },
  });

  const onSubmit = (d: CreateForm) => mutation.mutate({
    familyName: d.familyName, headMemberId: d.headMemberId,
    contactPhone: d.contactPhone || undefined,
    contactEmail: d.contactEmail || undefined,
    address: d.address || undefined,
    notes: d.notes || undefined,
  });

  return (
    <Drawer
      title="Add family"
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit(onSubmit)}>Add family</Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Family name" required validateStatus={errors.familyName ? 'error' : ''} help={errors.familyName?.message}>
          <Controller name="familyName" control={control} render={({ field }) => <Input {...field} placeholder="e.g., Mohammedi Family" autoFocus />} />
        </Form.Item>
        <Form.Item label="Head of family" required validateStatus={errors.headMemberId ? 'error' : ''} help={errors.headMemberId?.message ?? 'Start typing ITS or name to find the member.'}>
          <Controller name="headMemberId" control={control} render={({ field }) => <MemberPicker value={field.value} onChange={field.onChange} />} />
        </Form.Item>
        <Form.Item label="Contact phone">
          <Controller name="contactPhone" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Contact email" validateStatus={errors.contactEmail ? 'error' : ''} help={errors.contactEmail?.message}>
          <Controller name="contactEmail" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Address">
          <Controller name="address" control={control} render={({ field }) => <Input.TextArea {...field} rows={2} />} />
        </Form.Item>
        <Form.Item label="Notes">
          <Controller name="notes" control={control} render={({ field }) => <Input.TextArea {...field} rows={2} />} />
        </Form.Item>
        <Alert type="info" showIcon message="Family code is auto-generated (F-00001 format). Add other members after creating the family." />
      </Form>
    </Drawer>
  );
}

function EditForm({ open, onClose, family }: { open: boolean; onClose: () => void; family: Family }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { control, handleSubmit, reset, formState: { errors } } = useForm<UpdateForm>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      familyName: family.familyName,
      contactPhone: family.contactPhone ?? '',
      contactEmail: family.contactEmail ?? '',
      address: family.address ?? '',
      notes: family.notes ?? '',
      isActive: family.isActive,
    },
  });

  useEffect(() => {
    if (open) reset({
      familyName: family.familyName,
      contactPhone: family.contactPhone ?? '',
      contactEmail: family.contactEmail ?? '',
      address: family.address ?? '',
      notes: family.notes ?? '',
      isActive: family.isActive,
    });
  }, [open, family, reset]);

  const mutation = useMutation({
    mutationFn: (input: UpdateForm) => familiesApi.update(family.id, {
      familyName: input.familyName,
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      address: input.address || null,
      notes: input.notes || null,
      isActive: input.isActive,
    }),
    onSuccess: (f) => {
      message.success(`Family ${f.familyName} updated.`);
      void qc.invalidateQueries({ queryKey: ['families'] });
      void qc.invalidateQueries({ queryKey: ['family', family.id] });
      onClose();
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? p.title ?? 'Failed to update family'); },
  });

  return (
    <Drawer
      title={`Edit family · ${family.code}`}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit((d) => mutation.mutate(d))}>Save changes</Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Family name" required validateStatus={errors.familyName ? 'error' : ''} help={errors.familyName?.message}>
          <Controller name="familyName" control={control} render={({ field }) => <Input {...field} autoFocus />} />
        </Form.Item>
        <Form.Item label="Contact phone">
          <Controller name="contactPhone" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Contact email" validateStatus={errors.contactEmail ? 'error' : ''} help={errors.contactEmail?.message}>
          <Controller name="contactEmail" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Address">
          <Controller name="address" control={control} render={({ field }) => <Input.TextArea {...field} rows={2} />} />
        </Form.Item>
        <Form.Item label="Notes">
          <Controller name="notes" control={control} render={({ field }) => <Input.TextArea {...field} rows={2} />} />
        </Form.Item>
        <Form.Item label="Active">
          <Controller name="isActive" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>
        <Alert type="info" showIcon message="To change the head of family, use Transfer Headship from the family detail view." />
      </Form>
    </Drawer>
  );
}

export function MemberPicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Member[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (search.length < 2) { setOptions([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      membersApi.list({ page: 1, pageSize: 10, search, status: 1 })
        .then((r) => { if (!cancelled) setOptions(r.items); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const items = useMemo(() => options.map((m) => ({
    value: m.id,
    label: `${m.itsNumber} — ${m.fullName}`,
  })), [options]);

  return (
    <Select
      showSearch
      disabled={disabled}
      value={value || undefined}
      onChange={onChange}
      filterOption={false}
      onSearch={setSearch}
      notFoundContent={loading ? <Spin size="small" /> : search.length < 2 ? 'Type at least 2 characters…' : 'No matching members'}
      options={items}
      placeholder="Search members by ITS or name"
      style={{ inlineSize: '100%' }}
    />
  );
}
