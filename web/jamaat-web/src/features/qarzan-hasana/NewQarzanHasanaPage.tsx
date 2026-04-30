import { useState } from 'react';
import {
  Card, Form, Input, InputNumber, Select, DatePicker, Button, Space, App as AntdApp,
  Alert, Row, Col, Tooltip, Checkbox, Collapse, Typography, Divider,
} from 'antd';
import {
  InfoCircleOutlined, SafetyCertificateOutlined, FileTextOutlined, TeamOutlined,
  BankOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { MemberPicker } from '../families/FamilyFormDrawer';
import { extractProblem } from '../../shared/api/client';
import { qarzanHasanaApi, QhSchemeLabel, type QhScheme } from './qarzanHasanaApi';

/// Tooltip-rendered label. Pulls a label string + a help string into one component so the
/// new-loan form stays scannable. The InfoCircle icon is the discoverable hint that the
/// label has more context behind it.
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

export function NewQarzanHasanaPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  // Form state. Default values match the existing behavior - first-of-next-month start,
  // 12-month repayment, AED currency. The new free-text fields default to empty strings.
  const [memberId, setMemberId] = useState('');
  const [scheme, setScheme] = useState<QhScheme>(1);
  const [amount, setAmount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(12);
  const [currency, setCurrency] = useState('AED');
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().add(1, 'month').startOf('month'));
  const [g1, setG1] = useState('');
  const [g2, setG2] = useState('');
  const [gold, setGold] = useState<number | null>(null);
  const [cashflowUrl, setCashflowUrl] = useState('');
  const [goldSlipUrl, setGoldSlipUrl] = useState('');
  // New: borrower's case
  const [purpose, setPurpose] = useState('');
  const [repaymentPlan, setRepaymentPlan] = useState('');
  const [sourceOfIncome, setSourceOfIncome] = useState('');
  const [otherObligations, setOtherObligations] = useState('');
  // New: operator-witnessed guarantor consent
  const [guarantorsAcknowledged, setGuarantorsAcknowledged] = useState(false);

  const mut = useMutation({
    mutationFn: () => qarzanHasanaApi.create({
      memberId, scheme, amountRequested: amount, instalmentsRequested: installments,
      currency, startDate: startDate.format('YYYY-MM-DD'),
      guarantor1MemberId: g1, guarantor2MemberId: g2,
      goldAmount: gold ?? undefined,
      cashflowDocumentUrl: cashflowUrl || undefined,
      goldSlipDocumentUrl: goldSlipUrl || undefined,
      purpose: purpose.trim() || undefined,
      repaymentPlan: repaymentPlan.trim() || undefined,
      sourceOfIncome: sourceOfIncome.trim() || undefined,
      otherObligations: otherObligations.trim() || undefined,
      guarantorsAcknowledged,
    }),
    onSuccess: (loan) => {
      message.success(`Loan ${loan.code} created as Draft.`);
      navigate(`/qarzan-hasana/${loan.id}`);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const guarantorsPicked = !!g1 && !!g2;
  // Submission gate: identity + amounts + new required free-text + acknowledgment.
  // The acknowledgment checkbox only matters once both guarantors are picked.
  const canSubmit = !!memberId
    && guarantorsPicked
    && g1 !== g2
    && g1 !== memberId && g2 !== memberId
    && amount > 0
    && installments > 0
    && purpose.trim().length > 0
    && repaymentPlan.trim().length > 0
    && guarantorsAcknowledged;

  return (
    <div className="jm-stack" style={{ gap: 16 }}>
      <PageHeader title="New Qarzan Hasana application"
        subtitle="Interest-free loan request. Drafted at the counter, then routed for two-level approval."
        actions={<Button onClick={() => navigate('/qarzan-hasana')}>Cancel</Button>} />

      {/* Documentation card - collapsible, default open. Walks the borrower (and the operator
          assisting them at the counter) through the process so there are no surprises. */}
      <ProcessDocCard />

      <Card style={{ border: '1px solid var(--jm-border)' }}>
        <Form layout="vertical" requiredMark={false}>
          <Typography.Title level={5} style={{ marginBlockStart: 0 }}>
            <TeamOutlined /> Borrower &amp; loan terms
          </Typography.Title>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The member taking the loan. Must be in good standing.">Borrower</LabelWithHelp>} required>
                <MemberPicker value={memberId} onChange={setMemberId} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Different schemes have specific eligibility (e.g., Education for school/college, Medical for treatment, Business for trade). Pick the closest match - the approver can adjust.">Scheme</LabelWithHelp>}>
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
              <Form.Item label={<LabelWithHelp help="How many monthly payments you'd like to spread the repayment over. Up to 240 (20 years).">Instalments</LabelWithHelp>}>
                <InputNumber value={installments} onChange={(v) => setInstallments(Number(v ?? 1))} min={1} max={240} style={{ inlineSize: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The first repayment will be due about a month after this date. Default: first of next month.">Start date</LabelWithHelp>}>
                <DatePicker value={startDate} onChange={(v) => v && setStartDate(v)} style={{ inlineSize: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="If pledging gold as security, enter its assessed value. Optional but strengthens the application.">Gold amount (optional)</LabelWithHelp>}>
                <InputNumber value={gold ?? undefined} onChange={(v) => setGold(v === null || v === undefined ? null : Number(v))}
                  min={0} style={{ inlineSize: '100%' }} placeholder="Value of gold collateral" />
              </Form.Item>
            </Col>
          </Row>

          {/* Borrower's case - the key qualitative inputs the L1 approver reads to decide. */}
          <Divider orientation="left" plain style={{ marginBlockStart: 8 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              <FileTextOutlined /> Borrower's case
            </Typography.Title>
          </Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Describe what the funds will be used for. The clearer the purpose, the faster the approval.">Purpose of the loan</LabelWithHelp>} required>
                <Input.TextArea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={4}
                  placeholder="e.g., To cover hospital bills for my mother's surgery scheduled next month..."
                  maxLength={2000} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="How will you pay each instalment? Salary, business income, family support - be concrete.">Repayment plan</LabelWithHelp>} required>
                <Input.TextArea value={repaymentPlan} onChange={(e) => setRepaymentPlan(e.target.value)} rows={4}
                  placeholder="e.g., AED 1,500 monthly from my salary. Bonus in March will reduce the balance further..."
                  maxLength={2000} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Your primary income source. Helps the approver assess feasibility.">Source of income (optional)</LabelWithHelp>}>
                <Input.TextArea value={sourceOfIncome} onChange={(e) => setSourceOfIncome(e.target.value)} rows={2}
                  placeholder="e.g., Salaried at ABC Co. since 2018, monthly net AED 8,000."
                  maxLength={1000} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Any other active loans or major commitments outside this jamaat. Disclosing strengthens trust.">Other current obligations (optional)</LabelWithHelp>}>
                <Input.TextArea value={otherObligations} onChange={(e) => setOtherObligations(e.target.value)} rows={2}
                  placeholder="e.g., Car loan with HSBC - AED 1,200/mo, ends Dec 2026. No other loans."
                  maxLength={1000} showCount />
              </Form.Item>
            </Col>
          </Row>

          {/* Guarantors + supporting documents. */}
          <Divider orientation="left" plain style={{ marginBlockStart: 8 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              <SafetyCertificateOutlined /> Guarantors &amp; documents
            </Typography.Title>
          </Divider>
          <Alert type="info" showIcon style={{ marginBlockEnd: 16 }}
            message="Two guarantors are required. Each must be a member, not the borrower, and not currently in default on another QH loan." />
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The first kafil. Must be present when this draft is created so they can consent (see below).">Guarantor 1</LabelWithHelp>} required>
                <MemberPicker value={g1} onChange={(v) => { setG1(v); setGuarantorsAcknowledged(false); }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="The second kafil. Must be a different person from Guarantor 1, and also present at the counter.">Guarantor 2</LabelWithHelp>} required>
                <MemberPicker value={g2} onChange={(v) => { setG2(v); setGuarantorsAcknowledged(false); }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Optional - link to a document showing your monthly income and expenses. Strongly recommended for amounts above your usual range.">Cashflow document URL</LabelWithHelp>}>
                <Input value={cashflowUrl} onChange={(e) => setCashflowUrl(e.target.value)} placeholder="https://..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={<LabelWithHelp help="Optional - if pledging gold, link to the assessor's slip.">Gold slip URL</LabelWithHelp>}>
                <Input value={goldSlipUrl} onChange={(e) => setGoldSlipUrl(e.target.value)} placeholder="https://..." />
              </Form.Item>
            </Col>
          </Row>

          {/* Guarantor consent block - operator-witnessed acknowledgment. Only meaningful once
              both guarantors are picked; if either is changed, the acknowledgment resets so the
              new guarantor's consent is captured fresh. The Submit button is gated on this. */}
          {guarantorsPicked && (
            <Alert
              type="warning"
              showIcon
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
                  <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockStart: 6 }}>
                    Notification-based remote consent (each guarantor confirms via SMS / email link)
                    is on the roadmap; for now this is the operator-witnessed consent flow.
                  </div>
                </div>
              }
            />
          )}

          <Space style={{ display: 'flex', justifyContent: 'flex-end', marginBlockStart: 16 }}>
            <Button onClick={() => navigate('/qarzan-hasana')}>Cancel</Button>
            <Tooltip title={!canSubmit ? 'Fill in all required fields and tick the guarantor consent checkbox.' : ''}>
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

/// Standalone documentation card explaining the QH process. Collapsible (default open) so
/// returning users can fold it once they know the flow. The content is intentionally short
/// so it doesn't push the form below the fold; long-form policy goes in /help.
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
