import { useEffect } from 'react';
import { Drawer, Form, Input, Button, Space, Switch, Checkbox, Select, App as AntdApp, Divider, Typography, Alert } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { extractProblem } from '../../../../shared/api/client';
import { PaymentModeLabel } from '../shared';
import { fundTypesApi, FundCategoryLabel, type FundType, type FundCategory } from './fundTypesApi';
import { fundCategoriesApi, FundCategoryKindLabel } from '../fund-categories/fundCategoriesApi';
import { eventsApi } from '../../../events/eventsApi';
import { accountsApi } from '../chart-of-accounts/accountsApi';

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
  // New fund-management classification fields:
  fundCategoryId: z.string().optional(),
  fundSubCategoryId: z.string().optional(),
  isReturnable: z.boolean(),
  requiresAgreement: z.boolean(),
  requiresMaturityTracking: z.boolean(),
  requiresNiyyath: z.boolean(),
  // Batch-6: optional event link for Function-based funds.
  eventId: z.string().optional(),
  // Batch-7: per-fund liability account so returnable contributions can be split across
  // QH-returnable, scheme-temporary, and other-returnable buckets in the GL.
  liabilityAccountId: z.string().optional(),
  isActive: z.boolean().optional(),
});
type Form = z.infer<typeof schema>;

export function FundTypeFormDrawer({ open, onClose, fundType }: { open: boolean; onClose: () => void; fundType?: FundType | null }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const isEdit = !!fundType;

  const categoriesQ = useQuery({ queryKey: ['fund-categories'], queryFn: () => fundCategoriesApi.list(true), enabled: open });
  const subsQ = useQuery({ queryKey: ['fund-sub-categories'], queryFn: () => fundCategoriesApi.listSubs(undefined, true), enabled: open });
  // Function-based funds need to pick an event - pull a small list when the form opens.
  const eventsQ = useQuery({ queryKey: ['events', 'for-fund-type'], queryFn: () => eventsApi.list({ pageSize: 200 }), enabled: open });
  // Liability accounts for the returnable-liability picker. Filter to Liability type only -
  // crediting an Asset/Income/Expense account here would break the GL.
  const liabilityAccountsQ = useQuery({
    queryKey: ['accounts', 'liability'],
    queryFn: () => accountsApi.list({ page: 1, pageSize: 200, active: true, type: 2 /* Liability */ }),
    enabled: open,
  });

  const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (!open) return;
    if (fundType) {
      reset({
        code: fundType.code, nameEnglish: fundType.nameEnglish,
        nameArabic: fundType.nameArabic ?? '', nameHindi: fundType.nameHindi ?? '', nameUrdu: fundType.nameUrdu ?? '',
        description: fundType.description ?? '',
        requiresItsNumber: fundType.requiresItsNumber, requiresPeriodReference: fundType.requiresPeriodReference,
        allowedPaymentModes: fundType.allowedPaymentModes, category: fundType.category,
        fundCategoryId: fundType.fundCategoryId ?? undefined,
        fundSubCategoryId: fundType.fundSubCategoryId ?? undefined,
        isReturnable: fundType.isReturnable ?? false,
        requiresAgreement: fundType.requiresAgreement ?? false,
        requiresMaturityTracking: fundType.requiresMaturityTracking ?? false,
        requiresNiyyath: fundType.requiresNiyyath ?? false,
        eventId: fundType.eventId ?? undefined,
        liabilityAccountId: fundType.liabilityAccountId ?? undefined,
        isActive: fundType.isActive,
      });
    } else {
      reset(defaults());
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
        fundCategoryId: data.fundCategoryId || undefined,
        fundSubCategoryId: data.fundSubCategoryId || undefined,
        isReturnable: data.isReturnable,
        requiresAgreement: data.requiresAgreement,
        requiresMaturityTracking: data.requiresMaturityTracking,
        requiresNiyyath: data.requiresNiyyath,
        eventId: data.eventId || undefined,
        liabilityAccountId: data.liabilityAccountId || null,
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
  const selectedCategoryId = watch('fundCategoryId');
  const selectedCategory = (categoriesQ.data ?? []).find((c) => c.id === selectedCategoryId);
  const subOptions = (subsQ.data ?? []).filter((s) => !selectedCategoryId || s.fundCategoryId === selectedCategoryId);
  const isLoanFund = selectedCategory?.kind === 3;
  const isTempIncome = selectedCategory?.kind === 2;
  const isFunctionBased = selectedCategory?.kind === 5;

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

        <Divider orientation="left" style={{ marginBlock: 8, fontSize: 13 }}>Classification</Divider>

        <Form.Item label="Fund category" required tooltip="Admin-managed master classification - drives whether contributions post to income, create a return obligation, or sit in a loan fund.">
          <Controller name="fundCategoryId" control={control} render={({ field }) => (
            <Select {...field} placeholder="Select category"
              loading={categoriesQ.isLoading}
              showSearch optionFilterProp="label"
              options={(categoriesQ.data ?? []).map((c) => ({
                value: c.id,
                label: `${c.name} - ${FundCategoryKindLabel[c.kind]}`,
              }))}
              onChange={(v) => { field.onChange(v); setValue('fundSubCategoryId', undefined, { shouldDirty: true }); }}
              allowClear
            />
          )} />
        </Form.Item>

        <Form.Item label="Sub-category" help={selectedCategoryId ? undefined : 'Pick a category first'}>
          <Controller name="fundSubCategoryId" control={control} render={({ field }) => (
            <Select {...field} placeholder="Optional second-tier classification"
              disabled={!selectedCategoryId}
              showSearch optionFilterProp="label" allowClear
              options={subOptions.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            />
          )} />
        </Form.Item>

        {(isLoanFund || isTempIncome) && (
          <Alert
            type={isLoanFund ? 'info' : 'warning'}
            showIcon
            style={{ marginBlockEnd: 12 }}
            message={isLoanFund
              ? 'This is a Loan Fund - it can both receive returnable contributions and issue loans. Enable the relevant behaviour flags below.'
              : 'This is a Temporary Income category - receipts under this fund will be tracked as a return obligation, not as income.'}
          />
        )}

        {isFunctionBased && (
          <Form.Item label="Bound to event" tooltip="Function-based funds collect against a specific event/majlis. Receipts on this fund implicitly tie to it.">
            <Controller name="eventId" control={control} render={({ field }) => (
              <Select {...field} placeholder="Pick the event"
                allowClear showSearch optionFilterProp="label"
                loading={eventsQ.isLoading}
                options={(eventsQ.data?.items ?? []).map((ev) => ({ value: ev.id, label: `${ev.name} · ${ev.eventDate}` }))}
              />
            )} />
          </Form.Item>
        )}

        <Form.Item label="Returnable contributions" tooltip="When ON, the fund accepts contributions where the contributor expects the money back. Maturity / agreement tracking applies.">
          <Controller name="isReturnable" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>
        {watch('isReturnable') && (
          <Form.Item label="Liability account (returnables)"
            tooltip="The GL account that returnable receipts on this fund credit. Pick a dedicated account to keep this fund's obligations separate from other returnable buckets. Leave blank to fall back to the global Qarzan Hasana liability account.">
            <Controller name="liabilityAccountId" control={control} render={({ field }) => (
              <Select {...field}
                allowClear showSearch optionFilterProp="label" placeholder="Use default (3500)"
                options={(liabilityAccountsQ.data?.items ?? []).map((a) => ({
                  value: a.id, label: `${a.code} - ${a.name}`,
                }))}
              />
            )} />
          </Form.Item>
        )}
        <Form.Item label="Requires agreement" tooltip="When ON, contributions/loans on this fund must reference an attached agreement document.">
          <Controller name="requiresAgreement" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>
        <Form.Item label="Requires maturity tracking" tooltip="When ON, returnable contributions track a maturity date - returns before maturity require special approval.">
          <Controller name="requiresMaturityTracking" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>
        <Form.Item label="Requires Niyyath capture" tooltip="When ON, the contribution form must capture the contributor's Niyyath (intention) - not as a free-text remark, but as a structured field.">
          <Controller name="requiresNiyyath" control={control} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} />
        </Form.Item>

        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBlockEnd: 12 }}>
          Legacy enum (kept while callers migrate):
        </Typography.Text>
        <Form.Item label="Legacy category" help="Loans block Commitment pledges and Fund Enrollments. Will be replaced by the master classification above in a future release.">
          <Controller name="category" control={control} render={({ field }) => (
            <Select {...field} options={Object.entries(FundCategoryLabel).map(([v, l]) => ({ value: Number(v) as FundCategory, label: l }))} />
          )} />
        </Form.Item>

        <Divider orientation="left" style={{ marginBlock: 8, fontSize: 13 }}>Naming</Divider>
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

/// Form default values - kept as a function so each open of a "create" drawer starts fresh.
function defaults(): Form {
  return {
    code: '', nameEnglish: '', nameArabic: '', nameHindi: '', nameUrdu: '', description: '',
    requiresItsNumber: true, requiresPeriodReference: false,
    allowedPaymentModes: 7, // Cash + Cheque + BankTransfer
    category: 1,
    fundCategoryId: undefined, fundSubCategoryId: undefined,
    isReturnable: false, requiresAgreement: false, requiresMaturityTracking: false, requiresNiyyath: false,
    eventId: undefined,
    isActive: true,
  };
}
