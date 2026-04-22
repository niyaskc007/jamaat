import { useEffect } from 'react';
import { Drawer, Form, Input, Button, Space, Switch, Checkbox, Select, App as AntdApp } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { PaymentModeLabel } from '../shared';
import { fundTypesApi, FundCategoryLabel, type FundType, type FundCategory } from './fundTypesApi';

const schema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, _ and - only'),
  nameEnglish: z.string().min(1).max(200),
  nameArabic: z.string().max(200).optional().or(z.literal('')),
  nameHindi: z.string().max(200).optional().or(z.literal('')),
  nameUrdu: z.string().max(200).optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  requiresItsNumber: z.boolean(),
  requiresPeriodReference: z.boolean(),
  allowedPaymentModes: z.number().int().min(0),
  category: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(99)]),
  isActive: z.boolean().optional(),
});
type Form = z.infer<typeof schema>;

export function FundTypeFormDrawer({ open, onClose, fundType }: { open: boolean; onClose: () => void; fundType?: FundType | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const isEdit = !!fundType;

  const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', nameEnglish: '', requiresItsNumber: true, requiresPeriodReference: false, allowedPaymentModes: 7, category: 1, isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    if (fundType) {
      reset({
        code: fundType.code, nameEnglish: fundType.nameEnglish,
        nameArabic: fundType.nameArabic ?? '', nameHindi: fundType.nameHindi ?? '', nameUrdu: fundType.nameUrdu ?? '',
        description: fundType.description ?? '',
        requiresItsNumber: fundType.requiresItsNumber, requiresPeriodReference: fundType.requiresPeriodReference,
        allowedPaymentModes: fundType.allowedPaymentModes, category: fundType.category, isActive: fundType.isActive,
      });
    } else {
      reset({ code: '', nameEnglish: '', requiresItsNumber: true, requiresPeriodReference: false, allowedPaymentModes: 7, category: 1, isActive: true });
    }
  }, [open, fundType, reset]);

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      const payload = {
        nameEnglish: data.nameEnglish,
        nameArabic: data.nameArabic || undefined,
        nameHindi: data.nameHindi || undefined,
        nameUrdu: data.nameUrdu || undefined,
        description: data.description || undefined,
        requiresItsNumber: data.requiresItsNumber,
        requiresPeriodReference: data.requiresPeriodReference,
        allowedPaymentModes: data.allowedPaymentModes,
        category: data.category,
      };
      if (isEdit && fundType) {
        return fundTypesApi.update(fundType.id, { ...payload, isActive: data.isActive ?? true });
      }
      return fundTypesApi.create({ ...payload, code: data.code });
    },
    onSuccess: () => {
      message.success(isEdit ? 'Fund type updated' : 'Fund type created');
      void qc.invalidateQueries({ queryKey: ['fundTypes'] });
      onClose();
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? p.title ?? 'Failed'); },
  });

  const currentModes = watch('allowedPaymentModes');
  const toggleMode = (flag: number) => setValue('allowedPaymentModes', (currentModes ^ flag) >>> 0, { shouldDirty: true });

  return (
    <Drawer
      title={isEdit ? `Edit fund type · ${fundType?.code}` : 'New fund type'}
      open={open} onClose={onClose} width={560} destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit((d) => mutation.mutate(d))}>
            {isEdit ? 'Save changes' : 'Create fund type'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Code" required validateStatus={errors.code ? 'error' : ''} help={errors.code?.message}>
          <Controller name="code" control={control} render={({ field }) => <Input {...field} disabled={isEdit} placeholder="NIYAZ" autoFocus />} />
        </Form.Item>
        <Form.Item label="Category" required help="Loans block Commitment pledges and Fund Enrollments. Only Qarzan Hasana operates on Loan funds.">
          <Controller name="category" control={control} render={({ field }) => (
            <Select {...field} options={Object.entries(FundCategoryLabel).map(([v, l]) => ({ value: Number(v) as FundCategory, label: l }))} />
          )} />
        </Form.Item>
        <Form.Item label="Name (English)" required validateStatus={errors.nameEnglish ? 'error' : ''} help={errors.nameEnglish?.message}>
          <Controller name="nameEnglish" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Name (Arabic)"><Controller name="nameArabic" control={control} render={({ field }) => <Input {...field} dir="rtl" />} /></Form.Item>
        <Form.Item label="Name (Hindi)"><Controller name="nameHindi" control={control} render={({ field }) => <Input {...field} />} /></Form.Item>
        <Form.Item label="Name (Urdu)"><Controller name="nameUrdu" control={control} render={({ field }) => <Input {...field} dir="rtl" />} /></Form.Item>
        <Form.Item label="Description"><Controller name="description" control={control} render={({ field }) => <Input.TextArea {...field} rows={2} />} /></Form.Item>
        <Form.Item label="Allowed payment modes" tooltip="Receipts for this fund can only use one of these modes. Turn off Cheque/Transfer here if you want a cash-only fund (e.g., Sila Fitra).">
          <Space wrap>
            {Object.entries(PaymentModeLabel).map(([v, l]) => {
              const flag = Number(v);
              return <Checkbox key={v} checked={(currentModes & flag) !== 0} onChange={() => toggleMode(flag)}>{l}</Checkbox>;
            })}
          </Space>
        </Form.Item>
        <Form.Item label="Requires ITS number" tooltip="When ON, a receipt for this fund must be tied to a specific ITS-numbered member. Turn OFF for anonymous funds like General Charity.">
          <Controller name="requiresItsNumber" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>
        <Form.Item label="Requires period reference (month/year)" tooltip="When ON, the receipt line must specify a month/year (e.g., Madrasa fees for Rabi-ul-Awwal 1447). Used for contribution history reports.">
          <Controller name="requiresPeriodReference" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
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
