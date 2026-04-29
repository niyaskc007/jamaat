import { useEffect } from 'react';
import { Drawer, Form, Input, Button, Space, Switch, InputNumber, Select, App as AntdApp } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { NumberingScopeLabel } from '../shared';
import { numberingSeriesApi, type NumberingSeries } from './numberingSeriesApi';

const schema = z.object({
  scope: z.number().int().min(1).max(3),
  name: z.string().min(1).max(100),
  prefix: z.string().min(1).max(32),
  padLength: z.number().int().min(1).max(12),
  yearReset: z.boolean(),
  isActive: z.boolean().optional(),
});
type Form = z.infer<typeof schema>;

export function NumberingSeriesFormDrawer({ open, onClose, entity }: { open: boolean; onClose: () => void; entity?: NumberingSeries | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const isEdit = !!entity;

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { scope: 1, name: '', prefix: 'R-', padLength: 6, yearReset: true, isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    reset(entity
      ? { scope: entity.scope, name: entity.name, prefix: entity.prefix, padLength: entity.padLength, yearReset: entity.yearReset, isActive: entity.isActive }
      : { scope: 1, name: '', prefix: 'R-', padLength: 6, yearReset: true, isActive: true });
  }, [open, entity, reset]);

  const values = watch();
  const preview = (() => {
    const next = '1'.padStart(values.padLength ?? 6, '0');
    const yy = (new Date().getFullYear() % 100).toString().padStart(2, '0');
    return values.yearReset ? `${values.prefix ?? ''}${yy}-${next}` : `${values.prefix ?? ''}${next}`;
  })();

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      if (isEdit && entity) return numberingSeriesApi.update(entity.id, {
        name: data.name, prefix: data.prefix, padLength: data.padLength, yearReset: data.yearReset, isActive: data.isActive ?? true,
      });
      return numberingSeriesApi.create({ scope: data.scope, name: data.name, prefix: data.prefix, padLength: data.padLength, yearReset: data.yearReset });
    },
    onSuccess: () => {
      message.success(isEdit ? 'Series updated' : 'Series created');
      void qc.invalidateQueries({ queryKey: ['numberingSeries'] });
      onClose();
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed'); },
  });

  return (
    <Drawer
      title={isEdit ? `Edit numbering series · ${entity?.name}` : 'New numbering series'}
      open={open} onClose={onClose} width={480} destroyOnHidden
      footer={
        <Space style={{ inlineSize: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSubmit((d) => mutation.mutate(d))}>
            {isEdit ? 'Save changes' : 'Create series'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Scope" required tooltip="What this series numbers - Receipt, Voucher, or Journal. Each scope can only have one active series at a time.">
          <Controller name="scope" control={control}
            render={({ field }) => (
              <Select {...field} disabled={isEdit}
                options={Object.entries(NumberingScopeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
            )}
          />
        </Form.Item>
        <Form.Item label="Name" required tooltip="Internal label so admins can tell two series apart (e.g. 'Main counter' vs 'Special drives')." validateStatus={errors.name ? 'error' : ''} help={errors.name?.message}>
          <Controller name="name" control={control} render={({ field }) => <Input {...field} placeholder="Default receipt series" autoFocus />} />
        </Form.Item>
        <Form.Item label="Prefix" required tooltip="Goes at the start of every generated number (e.g. 'R-' produces 'R-000123'). Keep short - it appears on every receipt." validateStatus={errors.prefix ? 'error' : ''} help={errors.prefix?.message}>
          <Controller name="prefix" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Pad length" required tooltip="How many digits the running number is padded to. 6 digits = up to 999,999 receipts before rollover.">
          <Controller name="padLength" control={control} render={({ field }) => <InputNumber min={1} max={12} {...field} style={{ inlineSize: 120 }} />} />
        </Form.Item>
        <Form.Item label="Year reset" tooltip="When ON, the counter resets on Jan 1 and the year suffix (YY) is included in the number - e.g. R-26-000001. When OFF, the counter runs forever.">
          <Controller name="yearReset" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>
        <Form.Item label="Preview">
          <div className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 16, fontWeight: 600, color: 'var(--jm-primary-500)' }}>{preview}</div>
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
