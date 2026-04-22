import { useEffect } from 'react';
import { Drawer, Form, Input, Select, Button, Space, Alert } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp } from 'antd';
import type { Member } from './membersApi';
import { MemberStatusLabel, membersApi, type CreateMemberInput, type UpdateMemberInput } from './membersApi';
import { extractProblem } from '../../shared/api/client';

const baseSchema = {
  fullName: z.string().min(1, 'Full name is required').max(200),
  fullNameArabic: z.string().max(200).optional().or(z.literal('')),
  fullNameHindi: z.string().max(200).optional().or(z.literal('')),
  fullNameUrdu: z.string().max(200).optional().or(z.literal('')),
  phone: z.string().max(32).optional().or(z.literal('')),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().max(500).optional().or(z.literal('')),
};

const createSchema = z.object({
  itsNumber: z.string().regex(/^\d{8}$/, 'ITS number must be exactly 8 digits'),
  ...baseSchema,
});

const updateSchema = z.object({
  ...baseSchema,
  status: z.number().int().min(1).max(4),
});

type CreateForm = z.infer<typeof createSchema>;
type UpdateForm = z.infer<typeof updateSchema>;

type Props = {
  open: boolean;
  onClose: () => void;
  member?: Member | null;
};

export function MemberFormDrawer({ open, onClose, member }: Props) {
  const isEdit = !!member;
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  return isEdit && member
    ? <EditForm open={open} onClose={onClose} member={member} qc={qc} message={message} />
    : <CreateForm open={open} onClose={onClose} qc={qc} message={message} />;
}

function CreateForm({ open, onClose, qc, message }: { open: boolean; onClose: () => void; qc: ReturnType<typeof useQueryClient>; message: ReturnType<typeof AntdApp.useApp>['message'] }) {
  const { control, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { itsNumber: '', fullName: '' },
  });

  useEffect(() => { if (open) reset({ itsNumber: '', fullName: '' }); }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (input: CreateMemberInput) => membersApi.create(input),
    onSuccess: (m) => {
      message.success(`Member ${m.fullName} added.`);
      void qc.invalidateQueries({ queryKey: ['members'] });
      onClose();
    },
    onError: (err) => {
      const p = extractProblem(err);
      message.error(p.detail ?? p.title ?? 'Failed to create member');
    },
  });

  const onSubmit = (data: CreateForm) => {
    mutation.mutate({
      itsNumber: data.itsNumber,
      fullName: data.fullName,
      fullNameArabic: data.fullNameArabic || undefined,
      fullNameHindi: data.fullNameHindi || undefined,
      fullNameUrdu: data.fullNameUrdu || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
    });
  };

  return (
    <Drawer
      title="Add member"
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit(onSubmit)}>Add member</Button>
        </Space>
      }
    >
      <Form layout="vertical" onFinish={handleSubmit(onSubmit)} requiredMark={false}>
        <Form.Item label="ITS number" required validateStatus={errors.itsNumber ? 'error' : ''} help={errors.itsNumber?.message}>
          <Controller name="itsNumber" control={control}
            render={({ field }) => <Input {...field} placeholder="12345678" maxLength={8} autoFocus />}
          />
        </Form.Item>
        <Form.Item label="Full name (English)" required validateStatus={errors.fullName ? 'error' : ''} help={errors.fullName?.message}>
          <Controller name="fullName" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Full name (Arabic)" help="Optional — populated in Phase 2 bilingual rollout">
          <Controller name="fullNameArabic" control={control} render={({ field }) => <Input {...field} dir="rtl" />} />
        </Form.Item>
        <Form.Item label="Full name (Hindi)">
          <Controller name="fullNameHindi" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Full name (Urdu)">
          <Controller name="fullNameUrdu" control={control} render={({ field }) => <Input {...field} dir="rtl" />} />
        </Form.Item>
        <Form.Item label="Phone">
          <Controller name="phone" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Email" validateStatus={errors.email ? 'error' : ''} help={errors.email?.message}>
          <Controller name="email" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Address">
          <Controller name="address" control={control} render={({ field }) => <Input.TextArea {...field} rows={2} />} />
        </Form.Item>
        <Alert type="info" showIcon message="New members start as Active. Use Edit to change status later." />
      </Form>
    </Drawer>
  );
}

function EditForm({ open, onClose, member, qc, message }: { open: boolean; onClose: () => void; member: Member; qc: ReturnType<typeof useQueryClient>; message: ReturnType<typeof AntdApp.useApp>['message'] }) {
  const { control, handleSubmit, reset, formState: { errors } } = useForm<UpdateForm>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      fullName: member.fullName,
      fullNameArabic: member.fullNameArabic ?? '',
      fullNameHindi: member.fullNameHindi ?? '',
      fullNameUrdu: member.fullNameUrdu ?? '',
      phone: member.phone ?? '',
      email: member.email ?? '',
      address: member.address ?? '',
      status: member.status,
    },
  });

  useEffect(() => {
    if (open) reset({
      fullName: member.fullName,
      fullNameArabic: member.fullNameArabic ?? '',
      fullNameHindi: member.fullNameHindi ?? '',
      fullNameUrdu: member.fullNameUrdu ?? '',
      phone: member.phone ?? '',
      email: member.email ?? '',
      address: member.address ?? '',
      status: member.status,
    });
  }, [open, member, reset]);

  const mutation = useMutation({
    mutationFn: (input: UpdateMemberInput) => membersApi.update(member.id, input),
    onSuccess: (m) => {
      message.success(`Member ${m.fullName} updated.`);
      void qc.invalidateQueries({ queryKey: ['members'] });
      onClose();
    },
    onError: (err) => {
      const p = extractProblem(err);
      message.error(p.detail ?? p.title ?? 'Failed to update member');
    },
  });

  const onSubmit = (data: UpdateForm) => {
    mutation.mutate({
      fullName: data.fullName,
      fullNameArabic: data.fullNameArabic || undefined,
      fullNameHindi: data.fullNameHindi || undefined,
      fullNameUrdu: data.fullNameUrdu || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
      status: data.status as 1 | 2 | 3 | 4,
    });
  };

  return (
    <Drawer
      title={`Edit member · ${member.itsNumber}`}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit(onSubmit)}>Save changes</Button>
        </Space>
      }
    >
      <Form layout="vertical" onFinish={handleSubmit(onSubmit)} requiredMark={false}>
        <Form.Item label="Full name (English)" required validateStatus={errors.fullName ? 'error' : ''} help={errors.fullName?.message}>
          <Controller name="fullName" control={control} render={({ field }) => <Input {...field} autoFocus />} />
        </Form.Item>
        <Form.Item label="Status">
          <Controller name="status" control={control}
            render={({ field }) => (
              <Select {...field}
                options={Object.entries(MemberStatusLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
            )}
          />
        </Form.Item>
        <Form.Item label="Full name (Arabic)">
          <Controller name="fullNameArabic" control={control} render={({ field }) => <Input {...field} dir="rtl" />} />
        </Form.Item>
        <Form.Item label="Full name (Hindi)">
          <Controller name="fullNameHindi" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Full name (Urdu)">
          <Controller name="fullNameUrdu" control={control} render={({ field }) => <Input {...field} dir="rtl" />} />
        </Form.Item>
        <Form.Item label="Phone">
          <Controller name="phone" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Email" validateStatus={errors.email ? 'error' : ''} help={errors.email?.message}>
          <Controller name="email" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Address">
          <Controller name="address" control={control} render={({ field }) => <Input.TextArea {...field} rows={2} />} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
