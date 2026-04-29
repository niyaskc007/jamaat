import { useEffect } from 'react';
import { Drawer, Form, Input, Button, Space, Switch, App as AntdApp } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { bankAccountsApi, type BankAccount } from './bankAccountsApi';

const schema = z.object({
  name: z.string().min(1).max(200),
  bankName: z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(64),
  branch: z.string().max(200).optional().or(z.literal('')),
  ifsc: z.string().max(32).optional().or(z.literal('')),
  swiftCode: z.string().max(32).optional().or(z.literal('')),
  currency: z.string().length(3, 'Use a 3-letter ISO code e.g. INR'),
  isActive: z.boolean().optional(),
});
type Form = z.infer<typeof schema>;

export function BankAccountFormDrawer({ open, onClose, entity }: { open: boolean; onClose: () => void; entity?: BankAccount | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const isEdit = !!entity;

  const { control, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', bankName: '', accountNumber: '', branch: '', ifsc: '', swiftCode: '', currency: 'INR', isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    reset(entity ? {
      name: entity.name, bankName: entity.bankName, accountNumber: entity.accountNumber,
      branch: entity.branch ?? '', ifsc: entity.ifsc ?? '', swiftCode: entity.swiftCode ?? '',
      currency: entity.currency, isActive: entity.isActive,
    } : { name: '', bankName: '', accountNumber: '', branch: '', ifsc: '', swiftCode: '', currency: 'INR', isActive: true });
  }, [open, entity, reset]);

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      const payload = {
        name: data.name, bankName: data.bankName, accountNumber: data.accountNumber,
        branch: data.branch || undefined, ifsc: data.ifsc || undefined, swiftCode: data.swiftCode || undefined,
        currency: data.currency.toUpperCase(),
        isActive: data.isActive ?? true,
      };
      return isEdit && entity ? bankAccountsApi.update(entity.id, payload) : bankAccountsApi.create(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Bank account updated' : 'Bank account created');
      void qc.invalidateQueries({ queryKey: ['bankAccounts'] });
      onClose();
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed'); },
  });

  return (
    <Drawer
      title={isEdit ? `Edit bank account · ${entity?.name}` : 'New bank account'}
      open={open} onClose={onClose} width={520} destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit((d) => mutation.mutate(d))}>
            {isEdit ? 'Save changes' : 'Create bank account'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Display name" required tooltip="Short label shown in dropdowns and on receipt PDFs (e.g. 'Main Operating')." validateStatus={errors.name ? 'error' : ''} help={errors.name?.message}>
          <Controller name="name" control={control} render={({ field }) => <Input {...field} autoFocus placeholder="Jamaat Main Account" />} />
        </Form.Item>
        <Form.Item label="Bank name" required tooltip="Full legal name of the bank - used on cheque deposit slips." validateStatus={errors.bankName ? 'error' : ''} help={errors.bankName?.message}>
          <Controller name="bankName" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Account number" required tooltip="The actual bank account number. Stored as-is - make sure to mask in screenshots." validateStatus={errors.accountNumber ? 'error' : ''} help={errors.accountNumber?.message}>
          <Controller name="accountNumber" control={control} render={({ field }) => <Input {...field} className="jm-tnum" />} />
        </Form.Item>
        <Form.Item label="Branch" tooltip="Branch name or code - handy when there are multiple branches of the same bank."><Controller name="branch" control={control} render={({ field }) => <Input {...field} />} /></Form.Item>
        <Form.Item label="IFSC" tooltip="Indian Financial System Code (11 chars) - required for India interbank transfers."><Controller name="ifsc" control={control} render={({ field }) => <Input {...field} />} /></Form.Item>
        <Form.Item label="SWIFT" tooltip="SWIFT/BIC code - required for international wires."><Controller name="swiftCode" control={control} render={({ field }) => <Input {...field} />} /></Form.Item>
        <Form.Item label="Currency" required tooltip="ISO 4217 code (e.g. AED, INR, USD). Receipts in another currency will be FX-converted to base on confirm." validateStatus={errors.currency ? 'error' : ''} help={errors.currency?.message}>
          <Controller name="currency" control={control} render={({ field }) => <Input {...field} maxLength={3} style={{ inlineSize: 120, textTransform: 'uppercase' }} />} />
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
