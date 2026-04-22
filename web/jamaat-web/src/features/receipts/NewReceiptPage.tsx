import { useEffect, useMemo, useState } from 'react';
import {
  Card, Form, Input, InputNumber, Select, Button, Space, DatePicker, Row, Col, Divider,
  AutoComplete, App as AntdApp, Alert, Tag,
} from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined, PrinterOutlined, SearchOutlined, LinkOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { receiptsApi, PaymentModeLabel, type CreateReceipt, type CreateReceiptLine, type PaymentMode } from './receiptsApi';
import { fundTypesApi } from '../admin/master-data/fund-types/fundTypesApi';
import { bankAccountsApi } from '../admin/master-data/bank-accounts/bankAccountsApi';
import { currenciesApi } from '../admin/master-data/currencies/currenciesApi';
import { useBaseCurrency, useCurrencies } from '../../shared/hooks/useBaseCurrency';
import { lookupMembers } from '../members/memberLookup';
import { commitmentsApi, InstallmentStatusLabel } from '../commitments/commitmentsApi';
import { familiesApi } from '../families/familiesApi';
import { fundEnrollmentsApi } from '../fund-enrollments/fundEnrollmentsApi';
import { qarzanHasanaApi, QhInstallmentStatusLabel } from '../qarzan-hasana/qarzanHasanaApi';

type Line = CreateReceiptLine & { _id: string };

export function NewReceiptPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  const [receiptDate, setReceiptDate] = useState<Dayjs>(dayjs());
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; its: string } | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(1);
  const [bankAccountId, setBankAccountId] = useState<string | undefined>();
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState<Dayjs | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<Line[]>([{ _id: crypto.randomUUID(), fundTypeId: '', amount: 0 }]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | undefined>();
  const [onBehalfOf, setOnBehalfOf] = useState<string[]>([]);
  const baseCurrency = useBaseCurrency();
  const currenciesQuery = useCurrencies();
  const [currency, setCurrency] = useState<string>(baseCurrency);
  useEffect(() => { setCurrency((c) => c || baseCurrency); }, [baseCurrency]);

  const fundsQuery = useQuery({ queryKey: ['fundTypes', 'all'], queryFn: () => fundTypesApi.list({ page: 1, pageSize: 200, active: true }) });
  const banksQuery = useQuery({ queryKey: ['bankAccounts', 'all'], queryFn: () => bankAccountsApi.list({ page: 1, pageSize: 100, active: true }) });

  const [memberOptions, setMemberOptions] = useState<{ value: string; label: React.ReactNode; id: string; name: string; its: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (memberSearch.length >= 2) {
      lookupMembers(memberSearch).then((members) => {
        if (cancelled) return;
        setMemberOptions(members.map((m) => ({
          value: `${m.itsNumber} — ${m.fullName}`,
          id: m.id, name: m.fullName, its: m.itsNumber,
          label: (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span><span className="jm-tnum" style={{ fontWeight: 600 }}>{m.itsNumber}</span> · {m.fullName}</span>
              {m.phone && <span style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{m.phone}</span>}
            </div>
          ),
        })));
      });
    } else {
      setMemberOptions([]);
    }
    return () => { cancelled = true; };
  }, [memberSearch]);

  // When a member is picked, discover their family (if any) + active commitments.
  const memberFamilyQ = useQuery({
    queryKey: ['member-family', selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return null;
      const list = await familiesApi.list({ page: 1, pageSize: 1, search: selectedMember.its, active: true });
      const fam = list.items.find((f) => f.headItsNumber === selectedMember.its);
      if (fam) return familiesApi.get(fam.id);
      return null;
    },
    enabled: !!selectedMember,
  });

  // Active commitments available to this member or their family
  const commitmentsQ = useQuery({
    queryKey: ['commitments-for-member', selectedMember?.id, familyId],
    queryFn: async () => {
      if (!selectedMember) return [];
      const memberC = (await commitmentsApi.list({ page: 1, pageSize: 50, memberId: selectedMember.id, status: 2 })).items;
      const famC = familyId
        ? (await commitmentsApi.list({ page: 1, pageSize: 50, familyId, status: 2 })).items
        : [];
      const map = new Map<string, typeof memberC[number]>();
      for (const c of [...memberC, ...famC]) map.set(c.id, c);
      return [...map.values()];
    },
    enabled: !!selectedMember,
  });

  // Active fund enrollments for this member (subscriptions to Sabil/Wajebaat/Mutafariq/Niyaz)
  const enrollmentsQ = useQuery({
    queryKey: ['enrollments-for-member', selectedMember?.id],
    queryFn: async () => (await fundEnrollmentsApi.list({ page: 1, pageSize: 50, memberId: selectedMember!.id, status: 2 })).items,
    enabled: !!selectedMember,
  });

  // Active or disbursed QH loans for this member (repayments attach here)
  const qhLoansQ = useQuery({
    queryKey: ['qh-for-member', selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return [];
      const active = (await qarzanHasanaApi.list({ page: 1, pageSize: 50, memberId: selectedMember.id, status: 6 })).items;
      const disbursed = (await qarzanHasanaApi.list({ page: 1, pageSize: 50, memberId: selectedMember.id, status: 5 })).items;
      return [...active, ...disbursed];
    },
    enabled: !!selectedMember,
  });

  useEffect(() => {
    // Auto-propose the member's family as the beneficiary
    if (memberFamilyQ.data?.family && !familyId) setFamilyId(memberFamilyQ.data.family.id);
  }, [memberFamilyQ.data, familyId]);

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);

  // Live FX preview when currency != base
  const asOf = receiptDate.format('YYYY-MM-DD');
  const fxPreview = useQuery({
    queryKey: ['fx', currency, total, asOf],
    queryFn: () => currenciesApi.convert(total, currency, asOf),
    enabled: currency !== baseCurrency && total > 0,
    staleTime: 30_000,
  });

  const addLine = () => setLines((prev) => [...prev, { _id: crypto.randomUUID(), fundTypeId: '', amount: 0 }]);
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l._id !== id));
  const updateLine = (id: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => l._id === id ? { ...l, ...patch } : l));

  // Q9: one-click enrollment creation from the receipt form so the cashier isn't blocked.
  // Creates a draft Yearly enrollment starting today, then immediately approves it, and refreshes the enrollments query.
  const createEnrollmentOnTheFly = async (memberId: string, fundTypeId: string, fundName: string) => {
    try {
      const draft = await fundEnrollmentsApi.create({
        memberId, fundTypeId, recurrence: 5 /* Yearly */, startDate: receiptDate.format('YYYY-MM-DD'),
        notes: 'Auto-created from Receipt flow.',
      });
      await fundEnrollmentsApi.approve(draft.id);
      message.success(`Enrollment ${draft.code} created for ${fundName}.`);
      void enrollmentsQ.refetch();
    } catch (err) {
      const p = extractProblem(err);
      message.error(p.detail ?? p.title ?? 'Failed to create enrollment');
    }
  };

  const mutation = useMutation({
    mutationFn: (payload: CreateReceipt) => receiptsApi.create(payload),
    onSuccess: async (r) => {
      message.success(`Receipt ${r.receiptNumber} confirmed · ${money(r.amountTotal, r.currency)}`);
      // Open PDF in new tab (authenticated) and navigate to detail
      void receiptsApi.openPdf(r.id, false);
      navigate(`/receipts/${r.id}`);
    },
    onError: (err) => {
      const p = extractProblem(err);
      setSubmitError(p.detail ?? p.title ?? 'Failed to create receipt');
    },
  });

  const onSubmit = () => {
    setSubmitError(null);
    if (!selectedMember) { setSubmitError('Please select a member.'); return; }
    const cleanLines = lines.filter((l) => l.fundTypeId && l.amount > 0);
    if (cleanLines.length === 0) { setSubmitError('Add at least one line with a fund and amount.'); return; }
    if (paymentMode === 2 && (!chequeNumber || !chequeDate)) { setSubmitError('Cheque number and date are required for cheque payments.'); return; }

    const payload: CreateReceipt = {
      receiptDate: receiptDate.format('YYYY-MM-DD'),
      memberId: selectedMember.id,
      currency,
      paymentMode,
      bankAccountId: paymentMode === 1 ? null : (bankAccountId ?? null),
      chequeNumber: paymentMode === 2 ? chequeNumber : undefined,
      chequeDate: paymentMode === 2 ? chequeDate?.format('YYYY-MM-DD') : undefined,
      paymentReference: paymentReference || undefined,
      remarks: remarks || undefined,
      lines: cleanLines.map(({ _id: _omit, ...rest }) => rest),
      familyId: familyId || undefined,
      onBehalfOfMemberIds: onBehalfOf.length > 0 ? onBehalfOf : undefined,
    };
    mutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader
        title="New Receipt"
        subtitle="Record a donation. Confirming will assign a receipt number, post the ledger, and print."
        actions={
          <Space>
            <Button onClick={() => navigate('/receipts')}>Cancel</Button>
            <Button type="primary" icon={<PrinterOutlined />} loading={mutation.isPending} onClick={onSubmit}>
              Confirm & Print
            </Button>
          </Space>
        }
      />

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="Member & Lines" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}>
            <Form layout="vertical" requiredMark={false}>
              <Row gutter={12}>
                <Col xs={24} md={16}>
                  <Form.Item label="Member" required>
                    <AutoComplete
                      value={memberSearch}
                      onChange={(v) => { setMemberSearch(v); if (!v) setSelectedMember(null); }}
                      onSelect={(v, opt) => {
                        const o = opt as { id: string; name: string; its: string };
                        setSelectedMember({ id: o.id, name: o.name, its: o.its });
                        setMemberSearch(v);
                      }}
                      options={memberOptions}
                      style={{ inlineSize: '100%' }}
                    >
                      <Input size="large" autoFocus prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} placeholder="Search by ITS or name" />
                    </AutoComplete>
                    {selectedMember && (
                      <div style={{ marginBlockStart: 6 }}>
                        <Tag color="green" style={{ margin: 0 }}><span className="jm-tnum">{selectedMember.its}</span> · {selectedMember.name}</Tag>
                      </div>
                    )}
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="Receipt date" required>
                    <DatePicker value={receiptDate} onChange={(v) => v && setReceiptDate(v)} format="DD MMM YYYY" style={{ inlineSize: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            {/* Family beneficiary — only shown after the member is picked */}
            {selectedMember && (memberFamilyQ.data?.family || familyId) && (
              <Alert
                type="info"
                showIcon
                style={{ marginBlockEnd: 12 }}
                message={
                  <span>
                    <strong>{memberFamilyQ.data?.family?.familyName ?? 'Family'}</strong>
                    {memberFamilyQ.data?.family?.code ? ` · ${memberFamilyQ.data.family.code}` : ''}
                    {' — this receipt is attributed to the family.'}
                  </span>
                }
                description={
                  memberFamilyQ.data?.members && memberFamilyQ.data.members.length > 1 ? (
                    <div style={{ marginBlockStart: 8 }}>
                      <div style={{ fontSize: 12, marginBlockEnd: 4, color: 'var(--jm-gray-600)' }}>
                        Paying on behalf of (optional):
                      </div>
                      <Select
                        mode="multiple"
                        value={onBehalfOf}
                        onChange={setOnBehalfOf}
                        placeholder="Pick family members this payment covers"
                        style={{ inlineSize: '100%' }}
                        options={memberFamilyQ.data.members.map((m) => ({
                          value: m.id,
                          label: `${m.itsNumber} — ${m.fullName}`,
                        }))}
                      />
                    </div>
                  ) : undefined
                }
                action={
                  <Button size="small" type="text" icon={<DisconnectOutlined />}
                    onClick={() => { setFamilyId(undefined); setOnBehalfOf([]); }}>
                    Unlink
                  </Button>
                }
              />
            )}

            <Divider style={{ margin: '8px 0 16px' }} />

            <table style={{ inlineSize: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ textAlign: 'start', padding: 8, blockSize: 32 }}>Fund</th>
                  <th style={{ textAlign: 'start', padding: 8 }}>Purpose</th>
                  <th style={{ textAlign: 'start', padding: 8, inlineSize: 120 }}>Period</th>
                  <th style={{ textAlign: 'end', padding: 8, inlineSize: 140 }}>Amount</th>
                  <th style={{ inlineSize: 40 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((ln) => {
                  const fund = fundsQuery.data?.items.find((f) => f.id === ln.fundTypeId);
                  // Commitments eligible for this line: same fund + same currency as the receipt
                  const eligibleCommitments = (commitmentsQ.data ?? []).filter((c) =>
                    c.fundTypeId === ln.fundTypeId && c.currency === currency);
                  const selectedCommitment = eligibleCommitments.find((c) => c.id === ln.commitmentId);
                  // Q9 cue: donation-category fund + active member + no matching active enrollment + line not already linked to a commitment or QH.
                  const isDonationFund = fund && !fund.isLoan;
                  const hasActiveEnrollment = ln.fundTypeId && (enrollmentsQ.data ?? []).some((e) => e.fundTypeId === ln.fundTypeId);
                  const showNoEnrollmentCue = !!selectedMember && !!isDonationFund && !hasActiveEnrollment
                    && !ln.commitmentId && !ln.qarzanHasanaLoanId && !ln.fundEnrollmentId;
                  return (
                    <>
                      <tr key={ln._id} style={{ borderBlockEnd: ln.commitmentId ? 'none' : '1px solid var(--jm-border)' }}>
                        <td style={{ padding: 8 }}>
                          <Select
                            style={{ inlineSize: '100%' }} placeholder="Select fund"
                            value={ln.fundTypeId || undefined}
                            showSearch optionFilterProp="label"
                            options={fundsQuery.data?.items.map((f) => ({ value: f.id, label: `${f.code} · ${f.nameEnglish}` })) ?? []}
                            onChange={(v) => updateLine(ln._id, { fundTypeId: v, commitmentId: undefined, commitmentInstallmentId: undefined })}
                          />
                        </td>
                        <td style={{ padding: 8 }}>
                          <Input value={ln.purpose ?? ''} onChange={(e) => updateLine(ln._id, { purpose: e.target.value })} placeholder="Optional" />
                        </td>
                        <td style={{ padding: 8 }}>
                          <Input value={ln.periodReference ?? ''} onChange={(e) => updateLine(ln._id, { periodReference: e.target.value })}
                            placeholder={fund?.requiresPeriodReference ? 'Required' : 'Optional'} />
                        </td>
                        <td style={{ padding: 8 }}>
                          <InputNumber value={ln.amount} onChange={(v) => updateLine(ln._id, { amount: Number(v) || 0 })}
                            min={0} style={{ inlineSize: '100%' }} className="jm-tnum" />
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <Button type="text" icon={<DeleteOutlined />} danger disabled={lines.length === 1} onClick={() => removeLine(ln._id)} />
                        </td>
                      </tr>
                      {ln.fundTypeId && (eligibleCommitments.length > 0 || (enrollmentsQ.data ?? []).some((e) => e.fundTypeId === ln.fundTypeId) || (qhLoansQ.data ?? []).some((l) => l.currency === currency)) && (
                        <tr style={{ background: 'var(--jm-surface-muted)' }}>
                          <td colSpan={5} style={{ padding: '6px 12px', fontSize: 12 }}>
                            <Space wrap size={8}>
                              <LinkOutlined style={{ color: 'var(--jm-gray-500)' }} />
                              <span style={{ color: 'var(--jm-gray-600)' }}>Apply to:</span>
                              {eligibleCommitments.length > 0 && (
                                <>
                                  <Select
                                    size="small" allowClear style={{ minInlineSize: 240 }}
                                    placeholder="Commitment (pledge)"
                                    value={ln.commitmentId ?? undefined}
                                    onChange={(v) => updateLine(ln._id, { commitmentId: v ?? undefined, commitmentInstallmentId: undefined, fundEnrollmentId: undefined, qarzanHasanaLoanId: undefined, qarzanHasanaInstallmentId: undefined })}
                                    options={eligibleCommitments.map((c) => ({
                                      value: c.id,
                                      label: `${c.code} · paid ${money(c.paidAmount, c.currency)} / ${money(c.totalAmount, c.currency)}`,
                                    }))}
                                  />
                                  {selectedCommitment && (
                                    <InstallmentPicker commitmentId={selectedCommitment.id}
                                      value={ln.commitmentInstallmentId}
                                      currency={currency}
                                      onChange={(iid, suggestedAmount) => {
                                        const patch: Partial<Line> = { commitmentInstallmentId: iid };
                                        if ((!ln.amount || ln.amount === 0) && suggestedAmount !== undefined) patch.amount = suggestedAmount;
                                        updateLine(ln._id, patch);
                                      }} />
                                  )}
                                </>
                              )}
                              {(enrollmentsQ.data ?? []).filter((e) => e.fundTypeId === ln.fundTypeId).length > 0 && !ln.commitmentId && !ln.qarzanHasanaLoanId && (
                                <Select
                                  size="small" allowClear style={{ minInlineSize: 260 }}
                                  placeholder="Fund enrollment"
                                  value={ln.fundEnrollmentId ?? undefined}
                                  onChange={(v) => updateLine(ln._id, { fundEnrollmentId: v ?? undefined })}
                                  options={(enrollmentsQ.data ?? []).filter((e) => e.fundTypeId === ln.fundTypeId).map((e) => ({
                                    value: e.id, label: `${e.code}${e.subType ? ` · ${e.subType}` : ''} · collected ${money(e.totalCollected, 'AED')}`,
                                  }))}
                                />
                              )}
                              {(qhLoansQ.data ?? []).filter((l) => l.currency === currency).length > 0 && !ln.commitmentId && !ln.fundEnrollmentId && (
                                <>
                                  <Select
                                    size="small" allowClear style={{ minInlineSize: 260 }}
                                    placeholder="QH loan repayment"
                                    value={ln.qarzanHasanaLoanId ?? undefined}
                                    onChange={(v) => updateLine(ln._id, { qarzanHasanaLoanId: v ?? undefined, qarzanHasanaInstallmentId: undefined })}
                                    options={(qhLoansQ.data ?? []).filter((l) => l.currency === currency).map((l) => ({
                                      value: l.id, label: `${l.code} · outstanding ${money(l.amountOutstanding, l.currency)}`,
                                    }))}
                                  />
                                  {ln.qarzanHasanaLoanId && (
                                    <QhInstallmentPicker loanId={ln.qarzanHasanaLoanId} value={ln.qarzanHasanaInstallmentId} currency={currency}
                                      onChange={(iid, suggested) => {
                                        const patch: Partial<Line> = { qarzanHasanaInstallmentId: iid };
                                        if ((!ln.amount || ln.amount === 0) && suggested !== undefined) patch.amount = suggested;
                                        updateLine(ln._id, patch);
                                      }} />
                                  )}
                                </>
                              )}
                            </Space>
                          </td>
                        </tr>
                      )}
                      {showNoEnrollmentCue && fund && selectedMember && (
                        <tr style={{ background: '#FEF3C7' /* warm cream */ }}>
                          <td colSpan={5} style={{ padding: '8px 12px', fontSize: 12 }}>
                            <Space wrap size={8}>
                              <span style={{ color: '#92400E' }}>
                                ⓘ <strong>{selectedMember.name}</strong> has no active <strong>{fund.nameEnglish}</strong> enrollment — the receipt will still post. Consider creating one to track recurring contributions.
                              </span>
                              <Button size="small" type="primary" ghost
                                onClick={() => createEnrollmentOnTheFly(selectedMember.id, fund.id, fund.nameEnglish)}>
                                Create enrollment now
                              </Button>
                            </Space>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                <tr>
                  <td colSpan={5} style={{ padding: 8 }}>
                    <Button icon={<PlusOutlined />} onClick={addLine} size="small">Add line</Button>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ padding: 12, textAlign: 'end', fontWeight: 600, color: 'var(--jm-gray-700)' }}>Total</td>
                  <td className="jm-tnum" style={{ padding: 12, textAlign: 'end', fontFamily: "'Inter Tight', 'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--jm-primary-500)' }}>
                    {money(total, currency)}
                  </td>
                  <td />
                </tr>
                {currency !== baseCurrency && total > 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '0 12px 10px', textAlign: 'end', fontSize: 12, color: 'var(--jm-gray-500)' }}>≈</td>
                    <td className="jm-tnum" style={{ padding: '0 12px 10px', textAlign: 'end', fontSize: 13, color: 'var(--jm-gray-600)' }}>
                      {fxPreview.isLoading ? 'converting…' : fxPreview.data
                        ? `${money(fxPreview.data.baseAmount, baseCurrency)} @ ${fxPreview.data.rate.toFixed(6)}`
                        : <span style={{ color: 'var(--jm-danger)' }}>no rate on {asOf}</span>}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Payment" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}>
            <Form layout="vertical" requiredMark={false}>
              <Form.Item label="Currency" help={currency !== baseCurrency ? `Will be converted to ${baseCurrency} for the ledger.` : undefined}>
                <Select value={currency} onChange={setCurrency} showSearch optionFilterProp="label"
                  options={(currenciesQuery.data ?? []).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}${c.isBase ? ' (base)' : ''}` }))} />
              </Form.Item>
              <Form.Item label="Mode" tooltip="How the money arrived. Cash posts to the cash account; Cheque/Transfer/UPI posts to the selected bank account.">
                <Select value={paymentMode} onChange={(v) => setPaymentMode(v)}
                  options={Object.entries(PaymentModeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
              </Form.Item>
              {paymentMode !== 1 && (
                <Form.Item label="Deposit into bank account" tooltip="Which bank account the funds land in. The ledger will debit this account on Confirm.">
                  <Select value={bankAccountId} onChange={setBankAccountId} allowClear placeholder="Select bank account"
                    options={banksQuery.data?.items.map((b) => ({ value: b.id, label: `${b.name} · ${b.accountNumber}` })) ?? []} />
                </Form.Item>
              )}
              {paymentMode === 2 && (
                <>
                  <Form.Item label="Cheque number" required tooltip="Cheque serial number as printed. Used for the bank deposit summary report.">
                    <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="jm-tnum" />
                  </Form.Item>
                  <Form.Item label="Cheque date" required tooltip="The date printed on the cheque — may differ from the receipt date if the member issued a post-dated cheque.">
                    <DatePicker value={chequeDate} onChange={setChequeDate} format="DD MMM YYYY" style={{ inlineSize: '100%' }} />
                  </Form.Item>
                </>
              )}
              <Form.Item label="Reference" tooltip="Any external reference: UPI transaction id, bank transfer reference, online payment gateway id.">
                <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Transaction ref, UPI id, etc." />
              </Form.Item>
              <Form.Item label="Remarks" tooltip="Free-text note shown on the receipt PDF. Use sparingly — long remarks wrap awkwardly on pre-printed stationery.">
                <Input.TextArea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
              </Form.Item>
            </Form>
          </Card>

          {submitError && <Alert type="error" showIcon message={submitError} style={{ marginBlockEnd: 16 }} />}

          <Button size="large" block type="primary" icon={<PrinterOutlined />} loading={mutation.isPending} onClick={onSubmit}>
            Confirm & Print ({money(total, currency)})
          </Button>
          <Button size="large" block icon={<SaveOutlined />} style={{ marginBlockStart: 8 }} disabled
            title="Draft saving coming later — confirm posts to the ledger immediately">
            Save as draft
          </Button>
        </Col>
      </Row>
    </div>
  );
}

function QhInstallmentPicker({ loanId, value, currency, onChange }: {
  loanId: string;
  value?: string | null;
  currency: string;
  onChange: (installmentId: string, suggested?: number) => void;
}) {
  const { data, isLoading } = useQuery({ queryKey: ['qh-detail', loanId], queryFn: () => qarzanHasanaApi.get(loanId) });
  if (isLoading) return <span style={{ color: 'var(--jm-gray-500)' }}>Loading…</span>;
  if (!data) return null;
  const options = data.installments
    .filter((i) => i.status !== 3 && i.status !== 5)
    .map((i) => ({
      value: i.id,
      label: `#${i.installmentNo} · ${i.dueDate} · ${money(i.remainingAmount, currency)} remaining · ${QhInstallmentStatusLabel[i.status]}`,
      remaining: i.remainingAmount,
    }));
  return (
    <Select size="small" style={{ minInlineSize: 340 }} placeholder="Pick installment"
      value={value ?? undefined}
      onChange={(v, opt) => onChange(v, (opt as { remaining: number }).remaining)}
      options={options} />
  );
}

function InstallmentPicker({ commitmentId, value, currency, onChange }: {
  commitmentId: string;
  value?: string | null;
  currency: string;
  onChange: (installmentId: string, suggestedAmount?: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['commitment-detail', commitmentId],
    queryFn: () => commitmentsApi.get(commitmentId),
  });

  if (isLoading) return <span style={{ color: 'var(--jm-gray-500)' }}>Loading schedule…</span>;
  if (!data) return null;

  const options = data.installments
    .filter((i) => i.status !== 3 /* Paid */ && i.status !== 5 /* Waived */)
    .map((i) => ({
      value: i.id,
      label: `#${i.installmentNo} · ${i.dueDate} · ${money(i.remainingAmount, currency)} remaining · ${InstallmentStatusLabel[i.status]}`,
      remaining: i.remainingAmount,
    }));

  return (
    <Select
      size="small"
      style={{ minInlineSize: 360 }}
      placeholder="Pick installment"
      value={value ?? undefined}
      onChange={(v, opt) => {
        const o = opt as { remaining: number };
        onChange(v, o.remaining);
      }}
      options={options}
    />
  );
}
