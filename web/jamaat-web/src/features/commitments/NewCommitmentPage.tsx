import { useEffect, useMemo, useState } from 'react';
import {
  Card, Space, Form, Input, Select, InputNumber, DatePicker, Button, Table, Radio, Alert,
  Switch, Typography, App as AntdApp, Steps, Result, Tabs,
} from 'antd';
import { AgreementMarkdown } from '../../shared/ui/AgreementMarkdown';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { MemberPicker } from '../families/FamilyFormDrawer';
import { familiesApi } from '../families/familiesApi';
import { fundTypesApi } from '../admin/master-data/fund-types/fundTypesApi';
import {
  commitmentsApi, agreementTemplatesApi,
  FrequencyLabel, type CommitmentFrequency, type CommitmentPartyType, type ScheduleLine,
} from './commitmentsApi';
import { extractProblem } from '../../shared/api/client';
import { formatDate, money } from '../../shared/format/format';

const { Text } = Typography;

type PledgeForm = {
  partyType: CommitmentPartyType;
  memberId?: string;
  familyId?: string;
  fundTypeId?: string;
  currency: string;
  totalAmount: number;
  frequency: CommitmentFrequency;
  numberOfInstallments: number;
  startDate: Dayjs;
  allowPartialPayments: boolean;
  allowAutoAdvance: boolean;
  notes?: string;
  intention: 1 | 2;
};

export function NewCommitmentPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [step, setStep] = useState(0);

  const [form, setForm] = useState<PledgeForm>({
    partyType: 1,
    currency: 'AED',
    totalAmount: 0,
    frequency: 4,
    numberOfInstallments: 12,
    startDate: dayjs().startOf('month').add(1, 'month'),
    allowPartialPayments: true,
    allowAutoAdvance: true,
    intention: 1,
  });

  const fundsQ = useQuery({
    queryKey: ['fund-types-commitment-eligible'],
    queryFn: () => fundTypesApi.list({ page: 1, pageSize: 200, active: true }).then((r) => ({ ...r, items: r.items.filter((f) => !f.isLoan) })),
  });

  const [schedule, setSchedule] = useState<ScheduleLine[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const previewMut = useMutation({
    mutationFn: commitmentsApi.previewSchedule,
    onSuccess: (r) => setSchedule(r),
  });

  const createMut = useMutation({
    mutationFn: commitmentsApi.createDraft,
    onSuccess: (c) => { setCreatedId(c.id); setStep(2); },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? p.title ?? 'Failed to create commitment'); },
  });

  // Auto-preview schedule when relevant fields change
  useEffect(() => {
    if (step !== 1) return;
    if (!form.totalAmount || form.totalAmount <= 0) return;
    if (!form.numberOfInstallments || form.numberOfInstallments <= 0) return;
    previewMut.mutate({
      frequency: form.frequency,
      numberOfInstallments: form.numberOfInstallments,
      startDate: form.startDate.format('YYYY-MM-DD'),
      totalAmount: form.totalAmount,
    });
  }, [step, form.totalAmount, form.numberOfInstallments, form.frequency, form.startDate]);

  const canContinueStep0 =
    form.totalAmount > 0 &&
    form.fundTypeId &&
    form.numberOfInstallments > 0 &&
    ((form.partyType === 1 && form.memberId) || (form.partyType === 2 && form.familyId));

  const canCreate = schedule.length > 0 &&
    Math.abs(schedule.reduce((s, l) => s + l.scheduledAmount, 0) - form.totalAmount) < 0.005;

  const submit = () => {
    createMut.mutate({
      partyType: form.partyType,
      memberId: form.partyType === 1 ? form.memberId : undefined,
      familyId: form.partyType === 2 ? form.familyId : undefined,
      fundTypeId: form.fundTypeId!,
      currency: form.currency,
      totalAmount: form.totalAmount,
      frequency: form.frequency,
      numberOfInstallments: form.numberOfInstallments,
      startDate: form.startDate.format('YYYY-MM-DD'),
      allowPartialPayments: form.allowPartialPayments,
      allowAutoAdvance: form.allowAutoAdvance,
      notes: form.notes,
      intention: form.intention,
    });
  };

  return (
    <div>
      <PageHeader
        title="New commitment"
        subtitle="Create a pledge, preview the installment schedule, and send it to agreement acceptance."
        actions={<Button onClick={() => navigate('/commitments')}>Cancel</Button>}
      />

      <Steps
        current={step}
        style={{ marginBlockEnd: 24 }}
        items={[
          { title: 'Pledge details' },
          { title: 'Review schedule' },
          { title: 'Accept agreement' },
        ]}
      />

      {step === 0 && (
        <Card style={{ border: '1px solid var(--jm-border)' }}>
          <Form layout="vertical" requiredMark={false}>
            <Form.Item label="Pledge by">
              <Radio.Group
                value={form.partyType}
                onChange={(e) => setForm((f) => ({ ...f, partyType: e.target.value, memberId: undefined, familyId: undefined }))}
                options={[{ value: 1, label: 'Individual member' }, { value: 2, label: 'Family' }]}
                optionType="button"
              />
            </Form.Item>

            {form.partyType === 1 ? (
              <Form.Item label="Member" required>
                <MemberPicker value={form.memberId ?? ''} onChange={(v) => setForm((f) => ({ ...f, memberId: v }))} />
              </Form.Item>
            ) : (
              <Form.Item label="Family" required>
                <FamilyPicker value={form.familyId ?? ''} onChange={(v) => setForm((f) => ({ ...f, familyId: v }))} />
              </Form.Item>
            )}

            <Form.Item label="Fund type" required help="The commitment is bound to a specific fund. Payments must match this fund.">
              <Select
                showSearch
                optionFilterProp="label"
                value={form.fundTypeId}
                onChange={(v) => setForm((f) => ({ ...f, fundTypeId: v }))}
                placeholder="Select fund"
                options={(fundsQ.data?.items ?? []).map((x) => ({ value: x.id, label: `${x.code} - ${x.nameEnglish}` }))}
              />
            </Form.Item>

            <Space wrap size="large">
              <Form.Item label="Currency">
                <Select
                  value={form.currency}
                  onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  style={{ inlineSize: 120 }}
                  options={['AED', 'INR', 'USD', 'SAR', 'EUR', 'GBP', 'PKR', 'BHD', 'OMR', 'KWD', 'QAR'].map((c) => ({ value: c, label: c }))}
                />
              </Form.Item>
              <Form.Item label="Total pledge amount" required tooltip="The full commitment in the chosen currency. Each instalment = total / count. Receipts allocated against this pledge count towards closing instalments.">
                <InputNumber
                  style={{ inlineSize: 200 }} min={0.01} step={100}
                  value={form.totalAmount}
                  onChange={(v) => setForm((f) => ({ ...f, totalAmount: Number(v ?? 0) }))}
                />
              </Form.Item>
              <Form.Item label="Frequency" tooltip="How often instalments fall due. Weekly/Monthly generate a due date per instalment; Custom leaves dates manual.">
                <Select
                  value={form.frequency}
                  onChange={(v) => setForm((f) => ({ ...f, frequency: v as CommitmentFrequency }))}
                  style={{ inlineSize: 160 }}
                  options={Object.entries(FrequencyLabel).map(([v, l]) => ({ value: Number(v), label: l }))}
                />
              </Form.Item>
              <Form.Item label="# of installments" tooltip="How many equal parts to split the total into. Use 1 for a single-shot pledge.">
                <InputNumber
                  style={{ inlineSize: 140 }} min={1} max={600}
                  value={form.numberOfInstallments}
                  onChange={(v) => setForm((f) => ({ ...f, numberOfInstallments: Number(v ?? 1) }))}
                />
              </Form.Item>
              <Form.Item label="Start date" tooltip="The first instalment's due date. Subsequent instalments are spaced by the frequency.">
                <DatePicker
                  value={form.startDate}
                  onChange={(v) => v && setForm((f) => ({ ...f, startDate: v }))}
                />
              </Form.Item>
            </Space>

            <Space wrap size="large" style={{ marginBlockEnd: 12 }}>
              <Form.Item label="Returnable pledge" tooltip="When ON, contributions to this pledge are treated as returnable - a return obligation is created and the GL credits a liability account instead of income. Use for QH-style pledges where the contributor expects the money back.">
                <Switch checked={form.intention === 2} onChange={(v) => setForm((f) => ({ ...f, intention: v ? 2 : 1 }))} />
              </Form.Item>
              <Form.Item label="Allow partial payments" tooltip="When ON, a receipt smaller than the instalment amount is accepted and reduces the outstanding balance. When OFF, the receipt amount must exactly match.">
                <Switch checked={form.allowPartialPayments} onChange={(v) => setForm((f) => ({ ...f, allowPartialPayments: v }))} />
              </Form.Item>
              <Form.Item label="Auto-advance overflow" tooltip="When ON, any amount paid over an instalment automatically counts towards the next one. Useful when a member pays ahead.">
                <Switch checked={form.allowAutoAdvance} onChange={(v) => setForm((f) => ({ ...f, allowAutoAdvance: v }))} />
              </Form.Item>
            </Space>

            <Form.Item label="Notes">
              <Input.TextArea
                rows={2}
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional - any context for this pledge."
              />
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="primary" disabled={!canContinueStep0} onClick={() => setStep(1)}>
                Continue to schedule
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {step === 1 && (
        <Card style={{ border: '1px solid var(--jm-border)' }}>
          <Space direction="vertical" size={16} style={{ inlineSize: '100%' }}>
            <Alert
              type="info"
              showIcon
              message={
                <>
                  <strong>{form.numberOfInstallments}</strong> {FrequencyLabel[form.frequency].toLowerCase()} installments totalling{' '}
                  <strong>{money(form.totalAmount, form.currency)}</strong>, starting {formatDate(form.startDate.format('YYYY-MM-DD'))}.
                </>
              }
            />
            <Table<ScheduleLine>
              rowKey="installmentNo"
              size="small"
              pagination={false}
              loading={previewMut.isPending}
              dataSource={schedule}
              columns={[
                { title: '#', dataIndex: 'installmentNo', width: 70 },
                { title: 'Due date', dataIndex: 'dueDate', width: 140, render: (v: string) => formatDate(v) },
                { title: 'Scheduled amount', dataIndex: 'scheduledAmount', align: 'end', width: 180,
                  render: (v: number) => <span className="jm-tnum">{money(v, form.currency)}</span> },
              ]}
              summary={(rows) => {
                const sum = rows.reduce((s, r) => s + r.scheduledAmount, 0);
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} />
                    <Table.Summary.Cell index={2} align="end">
                      <Text strong className="jm-tnum">{money(sum, form.currency)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setStep(0)}>Back</Button>
              <Button type="primary" loading={createMut.isPending} disabled={!canCreate} onClick={submit}>
                Create commitment
              </Button>
            </div>
          </Space>
        </Card>
      )}

      {step === 2 && createdId && (
        <Card style={{ border: '1px solid var(--jm-border)' }}>
          <AcceptanceStep commitmentId={createdId} />
        </Card>
      )}
    </div>
  );
}

function AcceptanceStep({ commitmentId }: { commitmentId: string }) {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  const commitmentQ = useQuery({ queryKey: ['commitment', commitmentId], queryFn: () => commitmentsApi.get(commitmentId) });
  const templatesQ = useQuery({
    queryKey: ['agreement-templates-active'],
    queryFn: () => agreementTemplatesApi.list({ page: 1, pageSize: 50, active: true }),
  });

  const [templateId, setTemplateId] = useState<string | undefined>();
  const [preview, setPreview] = useState<string>('');

  const tenantName = 'Jamaat'; // Tenant name not yet surfaced via API - placeholder value

  useEffect(() => {
    // Default to the fund-specific template if any, else the default template
    const templates = templatesQ.data?.items ?? [];
    const c = commitmentQ.data?.commitment;
    if (!c || templates.length === 0) return;
    const fundMatch = templates.find((t) => t.fundTypeId === c.fundTypeId && t.isActive) ?? templates.find((t) => t.isDefault && t.isActive);
    if (fundMatch && !templateId) setTemplateId(fundMatch.id);
  }, [templatesQ.data, commitmentQ.data, templateId]);

  const renderMut = useMutation({
    mutationFn: agreementTemplatesApi.render,
    onSuccess: (r) => setPreview(r.renderedText),
  });

  const selectedTemplate = useMemo(
    () => (templatesQ.data?.items ?? []).find((t) => t.id === templateId),
    [templatesQ.data, templateId],
  );

  useEffect(() => {
    const c = commitmentQ.data?.commitment;
    const installments = commitmentQ.data?.installments ?? [];
    if (!c || !selectedTemplate) return;
    const installmentAmount = installments.length > 0 ? installments[0].scheduledAmount : c.totalAmount;
    renderMut.mutate({
      bodyMarkdown: selectedTemplate.bodyMarkdown,
      values: {
        party_name: c.partyName,
        party_type: c.partyType === 1 ? 'Member' : 'Family',
        fund_name: c.fundTypeName,
        fund_code: c.fundTypeCode,
        total_amount: money(c.totalAmount, c.currency),
        currency: c.currency,
        installments: String(c.numberOfInstallments),
        frequency: (FrequencyLabel[c.frequency]),
        installment_amount: money(installmentAmount, c.currency),
        start_date: formatDate(c.startDate),
        end_date: c.endDate ? formatDate(c.endDate) : '-',
        today: formatDate(new Date().toISOString()),
        jamaat_name: tenantName,
      },
    });
  }, [commitmentQ.data, selectedTemplate]);

  const { modal } = AntdApp.useApp();
  const acceptMut = useMutation({
    mutationFn: () => commitmentsApi.acceptAgreement(commitmentId, { templateId, renderedText: preview, acceptedByAdmin: true }),
    onSuccess: () => {
      message.success('Agreement accepted - commitment is now active.');
      navigate(`/commitments/${commitmentId}`);
    },
    onError: (err) => { const p = extractProblem(err); message.error(p.detail ?? 'Failed to accept agreement'); },
  });

  // Admin-on-behalf acceptance: today only staff have logins, so any "Accept" click is the
  // admin signing on behalf of the contributor. The system stamps the admin's name + IP +
  // device onto the commitment, so we make that explicit before the click is final.
  const confirmAndAccept = (partyName: string) => {
    modal.confirm({
      title: 'Accept agreement on behalf of contributor?',
      content: (
        <div style={{ marginBlockStart: 8 }}>
          <p style={{ margin: 0 }}>
            You are accepting this agreement <strong>on behalf of {partyName}</strong>.
          </p>
          <ul style={{ marginBlockStart: 8, paddingInlineStart: 18, color: 'var(--jm-gray-600)', fontSize: 13 }}>
            <li>The commitment becomes <strong>Active</strong> immediately and starts accepting payments.</li>
            <li>Your name, the timestamp, your IP address and device will be recorded as proof of acceptance.</li>
            <li>Make sure the contributor has reviewed and agreed to the text shown above.</li>
          </ul>
        </div>
      ),
      okText: 'Yes, accept on their behalf',
      okButtonProps: { type: 'primary' },
      cancelText: 'Not yet',
      width: 520,
      onOk: () => acceptMut.mutateAsync(),
    });
  };

  if (commitmentQ.isLoading || templatesQ.isLoading) return <div>Loading…</div>;
  if (!commitmentQ.data) return <Result status="404" title="Commitment not found" />;

  return (
    <Space direction="vertical" size={16} style={{ inlineSize: '100%' }}>
      <Alert
        type="success"
        showIcon
        message={`Commitment ${commitmentQ.data.commitment.code} created as draft.`}
        description="Accepting the agreement activates the commitment and locks the schedule."
      />

      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Agreement template">
          <Select
            value={templateId}
            onChange={setTemplateId}
            placeholder="Select agreement template"
            options={(templatesQ.data?.items ?? []).map((t) => ({
              value: t.id,
              label: `${t.name}${t.fundTypeCode ? ` (${t.fundTypeCode})` : ''}${t.isDefault ? ' · default' : ''}`,
            }))}
          />
        </Form.Item>

        <Form.Item label="Agreement (what will be snapshotted onto this commitment)"
          tooltip="Templates are authored in Markdown so headings/bold/lists render as formatted text. Use Preview to see how the contributor will see it; use Edit to tweak the rendered text before accepting (rare).">
          <Tabs
            defaultActiveKey="preview"
            items={[
              {
                key: 'preview', label: 'Preview',
                children: (
                  <div style={{ border: '1px solid var(--jm-border)', borderRadius: 6, padding: 16, background: 'var(--jm-gray-50, #FAFAFA)', maxBlockSize: 480, overflow: 'auto' }}>
                    {preview.trim()
                      ? <AgreementMarkdown source={preview} />
                      : <span style={{ color: 'var(--jm-gray-500)' }}>No preview yet - select a template above.</span>}
                  </div>
                ),
              },
              {
                key: 'source', label: 'Edit (Markdown)',
                children: (
                  <Input.TextArea
                    value={preview}
                    onChange={(e) => setPreview(e.target.value)}
                    autoSize={{ minRows: 10, maxRows: 24 }}
                    style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, whiteSpace: 'pre-wrap' }}
                  />
                ),
              },
            ]}
          />
        </Form.Item>
      </Form>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={() => navigate(`/commitments/${commitmentId}`)}>Skip - keep as draft</Button>
        <Button type="primary" loading={acceptMut.isPending} disabled={!preview.trim()}
          onClick={() => confirmAndAccept(commitmentQ.data?.commitment.partyName ?? 'this contributor')}>
          Accept agreement
        </Button>
      </div>
    </Space>
  );
}

function FamilyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['families-picker', search],
    queryFn: () => familiesApi.list({ page: 1, pageSize: 20, search, active: true }),
  });
  return (
    <Select
      showSearch
      value={value || undefined}
      onChange={onChange}
      filterOption={false}
      onSearch={setSearch}
      loading={isLoading}
      placeholder="Search families by name or code"
      options={(data?.items ?? []).map((f) => ({
        value: f.id,
        label: `${f.code} - ${f.familyName}${f.headName ? ` (Head: ${f.headName})` : ''}`,
      }))}
    />
  );
}
