import { useEffect, useState } from 'react';
import {
  Card, Form, Input, InputNumber, Select, DatePicker, Button, Space, App as AntdApp,
  Alert, Row, Col, Tooltip, Checkbox, Collapse, Typography, Divider, Tag, Upload, Statistic,
} from 'antd';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import {
  InfoCircleOutlined, SafetyCertificateOutlined, FileTextOutlined, TeamOutlined,
  BankOutlined, ArrowRightOutlined, CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  UploadOutlined, GoldOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { MemberPicker } from '../families/FamilyFormDrawer';
import { extractProblem } from '../../shared/api/client';
import {
  qarzanHasanaApi, QhSchemeLabel, IncomeSourceOptions,
  type QhScheme,
} from './qarzanHasanaApi';

/// Tooltip-rendered label. Pulls a label string + a help string into one component so the
/// new-loan form stays scannable.
function LabelWithHelp({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <span>
      {children}
      <Tooltip title={help}>
        <InfoCircleOutlined style={{ color: 'var(--jm-gray-400)', marginInlineStart: 6, fontSize: 12 }} />
      </Tooltip>
    </span>
  );
}

/// Inline panel that fires the eligibility probe when a guarantor is picked. Hard failures
/// turn the panel red and feed back to the parent via `onEligibilityChange` so submit can
/// be gated. Soft warnings show in yellow but allow.
function GuarantorEligibility({
  memberId, borrowerId, otherGuarantorId, onEligibilityChange,
}: {
  memberId: string;
  borrowerId: string;
  otherGuarantorId: string;
  onEligibilityChange: (eligible: boolean) => void;
}) {
  const enabled = !!memberId && !!borrowerId;
  const q = useQuery({
    queryKey: ['qh-guarantor-elig', memberId, borrowerId, otherGuarantorId],
    queryFn: () => qarzanHasanaApi.checkGuarantor({ memberId, borrowerId, otherGuarantorId: otherGuarantorId || undefined }),
    enabled,
    staleTime: 30_000,
  });

  // Push eligibility upward to the parent so it can gate submission.
  useEffect(() => {
    if (!enabled) { onEligibilityChange(false); return; }
    if (q.isLoading) { onEligibilityChange(false); return; }
    onEligibilityChange(q.data?.eligible ?? false);
  }, [enabled, q.isLoading, q.data?.eligible, onEligibilityChange]);

  if (!enabled) return null;
  if (q.isLoading) return <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 4 }}>Checking eligibility...</div>;
  if (q.isError || !q.data) return <Alert type="error" showIcon message="Could not verify guarantor" style={{ marginBlockStart: 8 }} />;

  const d = q.data;
  const failingHard = d.checks.filter((c) => c.hard && !c.passed);
  const failingSoft = d.checks.filter((c) => !c.hard && !c.passed);

  return (
    <div style={{ marginBlockStart: 8 }}>
      {d.eligible && !d.hasSoftWarnings && (
        <Tag color="green" icon={<CheckCircleOutlined />}>Eligible to act as kafil</Tag>
      )}
      {d.eligible && d.hasSoftWarnings && (
        <Alert
          type="warning" showIcon
          message="Eligible with warnings"
          description={
            <ul style={{ paddingInlineStart: 18, marginBlock: 4, fontSize: 12 }}>
              {failingSoft.map((c) => <li key={c.key}>{c.detail}</li>)}
            </ul>
          }
        />
      )}
      {!d.eligible && (
        <Alert
          type="error" showIcon icon={<CloseCircleOutlined />}
          message="Not eligible to act as kafil"
          description={
            <ul style={{ paddingInlineStart: 18, marginBlock: 4, fontSize: 12 }}>
              {failingHard.map((c) => <li key={c.key}>{c.detail}</li>)}
            </ul>
          }
        />
      )}
    </div>
  );
}

export function NewQarzanHasanaPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  // Identity + terms
  const [memberId, setMemberId] = useState('');
  const [scheme, setScheme] = useState<QhScheme>(1);
  const [amount, setAmount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(12);
  const [currency, setCurrency] = useState('AED');
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().add(1, 'month').startOf('month'));

  // Guarantors + acknowledgment
  const [g1, setG1] = useState('');
  const [g2, setG2] = useState('');
  const [g1Eligible, setG1Eligible] = useState(false);
  const [g2Eligible, setG2Eligible] = useState(false);
  const [guarantorsAcknowledged, setGuarantorsAcknowledged] = useState(false);

  // Borrower's case
  const [purpose, setPurpose] = useState('');
  const [repaymentPlan, setRepaymentPlan] = useState('');
  const [sourceOfIncome, setSourceOfIncome] = useState('');
  const [otherObligations, setOtherObligations] = useState('');

  // Structured cashflow
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(null);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number | null>(null);
  const [monthlyEmis, setMonthlyEmis] = useState<number | null>(null);

  // Gold (structured)
  const [goldAmount, setGoldAmount] = useState<number | null>(null);
  const [goldWeight, setGoldWeight] = useState<number | null>(null);
  const [goldPurity, setGoldPurity] = useState<number | null>(null);
  const [goldHeldAt, setGoldHeldAt] = useState('');

  // Income sources (multi-select)
  const [incomeSources, setIncomeSources] = useState<string[]>([]);

  // Pending file uploads (deferred until after the loan is created)
  const [cashflowFile, setCashflowFile] = useState<File | null>(null);
  const [goldSlipFile, setGoldSlipFile] = useState<File | null>(null);

  const guarantorsPicked = !!g1 && !!g2;
  const guarantorsValid = guarantorsPicked && g1 !== g2 && g1 !== memberId && g2 !== memberId && g1Eligible && g2Eligible;
  const goldRequired = (goldAmount ?? 0) > 0;
  const goldStructValid = !goldRequired || (
    !!goldWeight && goldWeight > 0
    && !!goldPurity && goldPurity > 0 && goldPurity <= 24
    && goldHeldAt.trim().length > 0
  );
  const netSurplus = (monthlyIncome ?? 0) - (monthlyExpenses ?? 0) - (monthlyEmis ?? 0);

  const canSubmit = !!memberId
    && guarantorsValid
    && amount > 0
    && installments > 0
    && purpose.trim().length > 0
    && repaymentPlan.trim().length > 0
    && incomeSources.length > 0
    && goldStructValid
    && guarantorsAcknowledged;

  const mut = useMutation({
    mutationFn: async () => {
      // Create the draft first; documents need a loan id, so they upload after.
      const loan = await qarzanHasanaApi.create({
        memberId, scheme,
        amountRequested: amount, instalmentsRequested: installments,
        currency, startDate: startDate.format('YYYY-MM-DD'),
        guarantor1MemberId: g1, guarantor2MemberId: g2,
        goldAmount: goldAmount ?? undefined,
        // Document URLs come from the upload-after-create chain; not from the user's input here.
        purpose: purpose.trim() || undefined,
        repaymentPlan: repaymentPlan.trim() || undefined,
        sourceOfIncome: sourceOfIncome.trim() || undefined,
        otherObligations: otherObligations.trim() || undefined,
        guarantorsAcknowledged,
        monthlyIncome: monthlyIncome ?? undefined,
        monthlyExpenses: monthlyExpenses ?? undefined,
        monthlyExistingEmis: monthlyEmis ?? undefined,
        goldWeightGrams: goldRequired ? (goldWeight ?? undefined) : undefined,
        goldPurityKarat: goldRequired ? (goldPurity ?? undefined) : undefined,
        goldHeldAt: goldRequired ? (goldHeldAt.trim() || undefined) : undefined,
        incomeSources: incomeSources.join(','),
      });

      // Best-effort upload chain. If either upload fails the loan is still saved; the user
      // can retry from the detail page. We surface the failure but don't roll the loan back.
      try {
        if (cashflowFile) await qarzanHasanaApi.uploadCashflow(loan.id, cashflowFile);
      } catch (e) {
        message.warning('Loan saved but cashflow document upload failed - retry from the detail page.');
      }
      try {
        if (goldSlipFile) await qarzanHasanaApi.uploadGoldSlip(loan.id, goldSlipFile);
      } catch (e) {
        message.warning('Loan saved but gold-slip upload failed - retry from the detail page.');
      }
      return loan;
    },
    onSuccess: (loan) => {
      message.success(`Loan ${loan.code} created as Draft.`);
      navigate(`/qarzan-hasana/${loan.id}`);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  return (
    <div className="jm-stack" style={{ gap: 16 }}>
      <PageHeader title="New Qarzan Hasana application"
        subtitle="Interest-free loan request. Drafted at the counter, then routed for two-level approval."
        actions={<Button onClick={() => navigate('/qarzan-hasana')}>Cancel</Button>} />

      <ProcessDocCard />

      <Card className="jm-card">
        <Form layout="vertical" requiredMark={false}>
          <Typography.Title level={5} style={{ marginBlockStart: 0 }}>
            <TeamOutlined /> Borrower &amp; loan terms
          </Typography.Title>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The member taking the loan. Must be in good standing.">Borrower</LabelWithHelp>} required>
                <MemberPicker value={memberId} onChange={(v) => { setMemberId(v); setG1Eligible(false); setG2Eligible(false); }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Different schemes have specific eligibility - pick the closest match; the approver can adjust.">Scheme</LabelWithHelp>}>
                <Select value={scheme} onChange={(v) => setScheme(v as QhScheme)}
                  options={Object.entries(QhSchemeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Default is the jamaat's base currency.">Currency</LabelWithHelp>}>
                <Select value={currency} onChange={setCurrency}
                  options={['AED', 'USD', 'INR', 'SAR'].map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="Total amount you're requesting. The L1 approver may approve a different amount.">Amount requested</LabelWithHelp>} required>
                <InputNumber value={amount} onChange={(v) => setAmount(Number(v ?? 0))} min={1} style={{ inlineSize: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={<LabelWithHelp help="How many monthly payments you'd like to spread the repayment over. Up to 240.">Instalments</LabelWithHelp>}>
                <InputNumber value={installments} onChange={(v) => setInstallments(Number(v ?? 1))} min={1} max={240} style={{ inlineSize: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The first repayment will be due about a month after this date. Default: first of next month.">Start date</LabelWithHelp>}>
                <DatePicker value={startDate} onChange={(v) => v && setStartDate(v)} style={{ inlineSize: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Borrower's case */}
          <Divider orientation="left" plain>
            <Typography.Title level={5} style={{ margin: 0 }}>
              <FileTextOutlined /> Borrower's case
            </Typography.Title>
          </Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="What will the funds be used for? The clearer the purpose, the faster the approval.">Purpose of the loan</LabelWithHelp>} required>
                <Input.TextArea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={4}
                  placeholder="e.g., To cover hospital bills for my mother's surgery scheduled next month..."
                  maxLength={2000} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Be concrete about how you'll pay each instalment - salary, business income, bonus etc.">Repayment plan</LabelWithHelp>} required>
                <Input.TextArea value={repaymentPlan} onChange={(e) => setRepaymentPlan(e.target.value)} rows={4}
                  placeholder="e.g., AED 1,500 monthly from my salary. Bonus in March will reduce the balance further..."
                  maxLength={2000} showCount />
              </Form.Item>
            </Col>
          </Row>

          {/* Income sources (multi-select) + free-text details */}
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Tick every category that applies. Pick at least one.">Income sources</LabelWithHelp>} required>
                <Select mode="multiple" value={incomeSources} onChange={setIncomeSources}
                  placeholder="Select all that apply"
                  options={IncomeSourceOptions}
                  style={{ inlineSize: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Optional - elaborate on the selected income categories (employer name, business type, monthly net etc.).">Income details</LabelWithHelp>}>
                <Input.TextArea value={sourceOfIncome} onChange={(e) => setSourceOfIncome(e.target.value)} rows={2}
                  placeholder="e.g., Salaried at ABC Co. since 2018, monthly net AED 8,000."
                  maxLength={1000} showCount />
              </Form.Item>
            </Col>
          </Row>

          {/* Cashflow - structured + optional document upload */}
          <Divider orientation="left" plain>
            <Typography.Title level={5} style={{ margin: 0 }}>
              <DollarOutlined /> Monthly cashflow
            </Typography.Title>
          </Divider>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item label={<LabelWithHelp help="Total monthly income across all sources, in your loan currency.">Monthly income</LabelWithHelp>}>
                <InputNumber value={monthlyIncome ?? undefined} onChange={(v) => setMonthlyIncome(v === null || v === undefined ? null : Number(v))}
                  min={0} style={{ inlineSize: '100%' }} placeholder="e.g., 8000" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label={<LabelWithHelp help="Rent, utilities, household, school fees etc.">Monthly expenses</LabelWithHelp>}>
                <InputNumber value={monthlyExpenses ?? undefined} onChange={(v) => setMonthlyExpenses(v === null || v === undefined ? null : Number(v))}
                  min={0} style={{ inlineSize: '100%' }} placeholder="e.g., 4500" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label={<LabelWithHelp help="Other loans / EMIs you're already paying outside this jamaat.">Other monthly EMIs</LabelWithHelp>}>
                <InputNumber value={monthlyEmis ?? undefined} onChange={(v) => setMonthlyEmis(v === null || v === undefined ? null : Number(v))}
                  min={0} style={{ inlineSize: '100%' }} placeholder="e.g., 1200" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Net monthly surplus">
                <Card size="small" style={{ background: netSurplus >= 0 ? 'rgba(11,110,99,0.08)' : 'rgba(220,38,38,0.08)', border: '1px solid var(--jm-border)' }}>
                  <Statistic value={netSurplus} precision={2} suffix={currency}
                    valueStyle={{ fontSize: 16, color: netSurplus >= 0 ? '#0E5C40' : '#DC2626', fontWeight: 700 }} />
                  <div style={{ fontSize: 11, color: 'var(--jm-gray-500)' }}>Income - Expenses - EMIs</div>
                </Card>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Optional - upload a supporting document (PDF or image, up to 10 MB). Speeds approval for amounts above your usual range.">Cashflow document (optional)</LabelWithHelp>}>
                <Upload
                  accept="application/pdf,image/*"
                  maxCount={1}
                  beforeUpload={(file: RcFile) => { setCashflowFile(file); return false; }}
                  onRemove={() => { setCashflowFile(null); return true; }}
                  fileList={cashflowFile ? [{ uid: '-1', name: cashflowFile.name, status: 'done' } as UploadFile] : []}
                >
                  <Button icon={<UploadOutlined />}>Choose file</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>

          {/* Gold - structured (only when amount > 0) + optional slip upload */}
          <Divider orientation="left" plain>
            <Typography.Title level={5} style={{ margin: 0 }}>
              <GoldOutlined /> Gold collateral (optional)
            </Typography.Title>
          </Divider>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item label={<LabelWithHelp help="Assessed monetary value of the gold being pledged. Leave blank if none.">Gold amount</LabelWithHelp>}>
                <InputNumber value={goldAmount ?? undefined} onChange={(v) => setGoldAmount(v === null || v === undefined ? null : Number(v))}
                  min={0} style={{ inlineSize: '100%' }} placeholder="e.g., 12000" />
              </Form.Item>
            </Col>
            {goldRequired && (
              <>
                <Col xs={24} md={6}>
                  <Form.Item label={<LabelWithHelp help="Total weight in grams.">Weight (g)</LabelWithHelp>} required>
                    <InputNumber value={goldWeight ?? undefined} onChange={(v) => setGoldWeight(v === null || v === undefined ? null : Number(v))}
                      min={0} step={0.1} style={{ inlineSize: '100%' }} placeholder="e.g., 22.5" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label={<LabelWithHelp help="Purity in karat - 18 / 22 / 24 etc.">Purity (karat)</LabelWithHelp>} required>
                    <Select value={goldPurity ?? undefined} onChange={(v) => setGoldPurity(v ?? null)}
                      placeholder="Select"
                      options={[18, 20, 22, 24].map((k) => ({ value: k, label: `${k} K` }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label={<LabelWithHelp help="Where is the gold currently held? Borrower / locker / vault / etc.">Held at</LabelWithHelp>} required>
                    <Input value={goldHeldAt} onChange={(e) => setGoldHeldAt(e.target.value)}
                      placeholder="e.g., ABC Jewellers vault, Dubai" maxLength={200} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label={<LabelWithHelp help="Optional - assessor's slip / certificate (PDF or image, up to 10 MB).">Gold slip (optional)</LabelWithHelp>}>
                    <Upload
                      accept="application/pdf,image/*"
                      maxCount={1}
                      beforeUpload={(file: RcFile) => { setGoldSlipFile(file); return false; }}
                      onRemove={() => { setGoldSlipFile(null); return true; }}
                      fileList={goldSlipFile ? [{ uid: '-1', name: goldSlipFile.name, status: 'done' } as UploadFile] : []}
                    >
                      <Button icon={<UploadOutlined />}>Choose file</Button>
                    </Upload>
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>

          {/* Other obligations (free text) */}
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item label={<LabelWithHelp help="Any other active loans / commitments outside this jamaat. Disclosing strengthens trust.">Other current obligations (optional)</LabelWithHelp>}>
                <Input.TextArea value={otherObligations} onChange={(e) => setOtherObligations(e.target.value)} rows={2}
                  placeholder="e.g., Car loan with HSBC - AED 1,200/mo, ends Dec 2026."
                  maxLength={1000} showCount />
              </Form.Item>
            </Col>
          </Row>

          {/* Guarantors */}
          <Divider orientation="left" plain>
            <Typography.Title level={5} style={{ margin: 0 }}>
              <SafetyCertificateOutlined /> Guarantors (kafil)
            </Typography.Title>
          </Divider>
          <Alert type="info" showIcon style={{ marginBlockEnd: 16 }}
            message="Two guarantors are required. Each must be a member, not the borrower, and not currently in default. Eligibility is checked the moment you pick a member." />
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The first kafil. Eligibility is checked live the moment you pick a member.">Guarantor 1</LabelWithHelp>} required>
                <MemberPicker value={g1} onChange={(v) => { setG1(v); setGuarantorsAcknowledged(false); }} />
                {!!memberId && !!g1 && (
                  <GuarantorEligibility memberId={g1} borrowerId={memberId} otherGuarantorId={g2}
                    onEligibilityChange={setG1Eligible} />
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The second kafil. Different from Guarantor 1 and from the borrower.">Guarantor 2</LabelWithHelp>} required>
                <MemberPicker value={g2} onChange={(v) => { setG2(v); setGuarantorsAcknowledged(false); }} />
                {!!memberId && !!g2 && (
                  <GuarantorEligibility memberId={g2} borrowerId={memberId} otherGuarantorId={g1}
                    onEligibilityChange={setG2Eligible} />
                )}
              </Form.Item>
            </Col>
          </Row>

          {/* Guarantor consent block */}
          {guarantorsValid && (
            <Alert
              type="warning" showIcon
              style={{ marginBlockEnd: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}
              message={<strong>Guarantor consent (required)</strong>}
              description={
                <div>
                  <Typography.Paragraph style={{ marginBlock: 4, fontSize: 13 }}>
                    Both guarantors must be physically present at the counter and verbally agree to act
                    as kafil for this loan. The system records this acknowledgment with your name + the
                    timestamp; the L1 approver may verify directly with each guarantor before deciding.
                  </Typography.Paragraph>
                  <Checkbox
                    checked={guarantorsAcknowledged}
                    onChange={(e) => setGuarantorsAcknowledged(e.target.checked)}
                    style={{ marginBlockStart: 6 }}
                  >
                    <strong>I confirm that both guarantors are present and have agreed to act as kafil for this loan.</strong>
                  </Checkbox>
                </div>
              }
            />
          )}

          <Space style={{ display: 'flex', justifyContent: 'flex-end', marginBlockStart: 16 }}>
            <Button onClick={() => navigate('/qarzan-hasana')}>Cancel</Button>
            <Tooltip title={!canSubmit ? 'Fill in all required fields, ensure both guarantors are eligible, and tick the consent checkbox.' : ''}>
              <Button type="primary" loading={mut.isPending} disabled={!canSubmit}
                icon={<ArrowRightOutlined />} onClick={() => mut.mutate()}>
                Create as Draft
              </Button>
            </Tooltip>
          </Space>
        </Form>
      </Card>
    </div>
  );
}

function ProcessDocCard() {
  return (
    <Collapse defaultActiveKey={['about']} ghost
      items={[
        {
          key: 'about',
          label: (
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              <InfoCircleOutlined style={{ marginInlineEnd: 8 }} />
              About Qarzan Hasana - read this before submitting
            </span>
          ),
          children: (
            <Card size="small" style={{ background: 'var(--jm-surface-muted)', border: '1px solid var(--jm-border)' }}>
              <Row gutter={[24, 16]}>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    <BankOutlined /> What is Qarzan Hasana?
                  </Typography.Title>
                  <Typography.Paragraph style={{ marginBlock: 8, fontSize: 13 }}>
                    An interest-free loan from the jamaat's QH fund. The borrower repays the
                    principal in monthly instalments. No interest, no fees - the money you
                    repay goes back into the fund to help the next borrower.
                  </Typography.Paragraph>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    <TeamOutlined /> Eligibility
                  </Typography.Title>
                  <ul style={{ paddingInlineStart: 18, marginBlockStart: 8, marginBlockEnd: 0, fontSize: 13, lineHeight: 1.7 }}>
                    <li>Active member in good standing</li>
                    <li>Two guarantors (kafil) - members, not the borrower</li>
                    <li>Neither guarantor in default on another QH loan</li>
                    <li>A clear purpose and a believable repayment plan</li>
                  </ul>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    <ArrowRightOutlined /> The process
                  </Typography.Title>
                  <ol style={{ paddingInlineStart: 18, marginBlockStart: 8, marginBlockEnd: 0, fontSize: 13, lineHeight: 1.7 }}>
                    <li><strong>Draft</strong> - this form. Borrower + guarantors at the counter.</li>
                    <li><strong>L1 approval</strong> - first approver reviews the case + reliability profile.</li>
                    <li><strong>L2 approval</strong> - second approver gives final sign-off.</li>
                    <li><strong>Disbursement</strong> - voucher issued; funds go out to the borrower.</li>
                    <li><strong>Repayment</strong> - monthly instalments collected via Receipts.</li>
                  </ol>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    <FileTextOutlined /> Bring with you
                  </Typography.Title>
                  <ul style={{ paddingInlineStart: 18, marginBlockStart: 8, marginBlockEnd: 0, fontSize: 13, lineHeight: 1.7 }}>
                    <li>ITS card / ID for borrower + both guarantors</li>
                    <li>Cashflow document (last 3 months income/expenses) - optional but speeds approval</li>
                    <li>Gold assessor's slip - only if pledging gold</li>
                    <li>Both guarantors physically present to acknowledge their kafalah</li>
                  </ul>
                </Col>
              </Row>
              <div style={{ marginBlockStart: 12, paddingBlockStart: 12, borderBlockStart: '1px solid var(--jm-border)', fontSize: 12, color: 'var(--jm-gray-600)' }}>
                Typical timeline: same-day submission, 1-3 working days for L1+L2 approval, disbursement same day as L2 approval. Reach out if your need is urgent and we'll prioritise.
              </div>
            </Card>
          ),
        },
      ]}
    />
  );
}
