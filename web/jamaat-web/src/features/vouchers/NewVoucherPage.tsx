import { useMemo, useState } from 'react';
import { Card, Form, Input, InputNumber, Select, Button, Space, DatePicker, Row, Col, Divider, App as AntdApp, Alert } from 'antd';
import { DeleteOutlined, PlusOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import { vouchersApi, PaymentModeLabel, type CreateVoucher, type PaymentMode } from './vouchersApi';
import { expenseTypesApi } from '../admin/master-data/expense-types/expenseTypesApi';
import { bankAccountsApi } from '../admin/master-data/bank-accounts/bankAccountsApi';
import { currenciesApi } from '../admin/master-data/currencies/currenciesApi';
import { useBaseCurrency, useCurrencies } from '../../shared/hooks/useBaseCurrency';

type Line = { _id: string; expenseTypeId: string; amount: number; narration?: string };

export function NewVoucherPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  const [voucherDate, setVoucherDate] = useState<Dayjs>(dayjs());
  const [payTo, setPayTo] = useState('');
  const [payeeIts, setPayeeIts] = useState('');
  const [purpose, setPurpose] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(1);
  const [bankAccountId, setBankAccountId] = useState<string | undefined>();
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState<Dayjs | null>(null);
  const [drawnOnBank, setDrawnOnBank] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<Line[]>([{ _id: crypto.randomUUID(), expenseTypeId: '', amount: 0 }]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const baseCurrency = useBaseCurrency();
  const currenciesQuery = useCurrencies();
  const [currency, setCurrency] = useState<string>(baseCurrency);

  const expenseTypesQuery = useQuery({ queryKey: ['expenseTypes', 'all'], queryFn: () => expenseTypesApi.list({ page: 1, pageSize: 200, active: true }) });
  const banksQuery = useQuery({ queryKey: ['bankAccounts', 'all'], queryFn: () => bankAccountsApi.list({ page: 1, pageSize: 100, active: true }) });

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);
  const asOf = voucherDate.format('YYYY-MM-DD');
  const fxPreview = useQuery({
    queryKey: ['fx', currency, total, asOf],
    queryFn: () => currenciesApi.convert(total, currency, asOf),
    enabled: currency !== baseCurrency && total > 0,
    staleTime: 30_000,
  });
  const willRequireApproval = useMemo(() => {
    return lines.some((ln) => {
      const et = expenseTypesQuery.data?.items.find((x) => x.id === ln.expenseTypeId);
      if (!et) return false;
      if (et.requiresApproval) return true;
      if (et.approvalThreshold !== null && et.approvalThreshold !== undefined && ln.amount >= et.approvalThreshold) return true;
      return false;
    });
  }, [lines, expenseTypesQuery.data]);

  const mutation = useMutation({
    mutationFn: (p: CreateVoucher) => vouchersApi.create(p),
    onSuccess: (v) => {
      message.success(v.status === 2 ? 'Voucher submitted for approval' : `Voucher ${v.voucherNumber} paid · ${money(v.amountTotal, v.currency)}`);
      if (v.voucherNumber) void vouchersApi.openPdf(v.id);
      navigate(`/vouchers/${v.id}`);
    },
    onError: (e) => { const p = extractProblem(e); setSubmitError(p.detail ?? 'Failed to create voucher'); },
  });

  const onSubmit = () => {
    setSubmitError(null);
    if (!payTo.trim()) { setSubmitError('Pay to is required'); return; }
    const clean = lines.filter((l) => l.expenseTypeId && l.amount > 0);
    if (clean.length === 0) { setSubmitError('Add at least one line with an expense type and amount'); return; }
    if (paymentMode === 2 && (!chequeNumber || !chequeDate)) { setSubmitError('Cheque number and date are required'); return; }
    mutation.mutate({
      voucherDate: voucherDate.format('YYYY-MM-DD'), payTo,
      payeeItsNumber: payeeIts || undefined, purpose: purpose || undefined,
      currency,
      paymentMode, bankAccountId: paymentMode === 1 ? null : (bankAccountId ?? null),
      chequeNumber: paymentMode === 2 ? chequeNumber : undefined,
      chequeDate: paymentMode === 2 ? chequeDate?.format('YYYY-MM-DD') : undefined,
      drawnOnBank: drawnOnBank || undefined,
      remarks: remarks || undefined,
      lines: clean.map(({ _id: _omit, ...rest }) => rest),
    });
  };

  return (
    <div>
      <PageHeader
        title="New Payment Voucher"
        subtitle="Record an outgoing payment. Approvals and ledger posting happen on save."
        actions={
          <Space>
            <Button onClick={() => navigate('/vouchers')}>Cancel</Button>
            <Button type="primary" icon={<CheckCircleFilled />} loading={mutation.isPending} onClick={onSubmit}>
              {willRequireApproval ? 'Submit for approval' : 'Save & Pay'}
            </Button>
          </Space>
        }
      />

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="Header & Lines" style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)', marginBlockEnd: 16 }}>
            <Form layout="vertical" requiredMark={false}>
              <Row gutter={12}>
                <Col xs={24} md={16}>
                  <Form.Item label="Pay to" required>
                    <Input value={payTo} onChange={(e) => setPayTo(e.target.value)} placeholder="Vendor / payee name" autoFocus />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="Voucher date" required>
                    <DatePicker value={voucherDate} onChange={(v) => v && setVoucherDate(v)} format="DD MMM YYYY" style={{ inlineSize: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} md={8}><Form.Item label="Payee ITS"><Input value={payeeIts} onChange={(e) => setPayeeIts(e.target.value)} className="jm-tnum" maxLength={8} /></Form.Item></Col>
                <Col xs={24} md={16}><Form.Item label="Purpose"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Form.Item></Col>
              </Row>
            </Form>

            <Divider style={{ margin: '8px 0 16px' }} />

            <table style={{ inlineSize: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ textAlign: 'start', padding: 8, blockSize: 32 }}>Expense type</th>
                  <th style={{ textAlign: 'start', padding: 8 }}>Narration</th>
                  <th style={{ textAlign: 'end', padding: 8, inlineSize: 140 }}>Amount</th>
                  <th style={{ inlineSize: 40 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((ln) => (
                  <tr key={ln._id} style={{ borderBlockEnd: '1px solid var(--jm-border)' }}>
                    <td style={{ padding: 8 }}>
                      <Select style={{ inlineSize: '100%' }} placeholder="Select expense type"
                        value={ln.expenseTypeId || undefined} showSearch optionFilterProp="label"
                        options={expenseTypesQuery.data?.items.map((e) => ({ value: e.id, label: `${e.code} · ${e.name}${e.requiresApproval ? ' (needs approval)' : e.approvalThreshold ? ` (approval ≥${e.approvalThreshold})` : ''}` })) ?? []}
                        onChange={(v) => setLines((prev) => prev.map((x) => x._id === ln._id ? { ...x, expenseTypeId: v } : x))} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <Input value={ln.narration ?? ''} onChange={(e) => setLines((prev) => prev.map((x) => x._id === ln._id ? { ...x, narration: e.target.value } : x))} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <InputNumber value={ln.amount} onChange={(v) => setLines((prev) => prev.map((x) => x._id === ln._id ? { ...x, amount: Number(v) || 0 } : x))}
                        min={0} style={{ inlineSize: '100%' }} className="jm-tnum" />
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <Button type="text" icon={<DeleteOutlined />} danger disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((x) => x._id !== ln._id))} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ padding: 8 }}>
                    <Button icon={<PlusOutlined />} size="small" onClick={() => setLines((prev) => [...prev, { _id: crypto.randomUUID(), expenseTypeId: '', amount: 0 }])}>Add line</Button>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ padding: 12, textAlign: 'end', fontWeight: 600, color: 'var(--jm-gray-700)' }}>Total</td>
                  <td className="jm-tnum" style={{ padding: 12, textAlign: 'end', fontSize: 20, fontFamily: "'Inter Tight', 'Inter', sans-serif", fontWeight: 600, color: 'var(--jm-primary-500)' }}>
                    {money(total, currency)}
                  </td>
                  <td />
                </tr>
                {currency !== baseCurrency && total > 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding: '0 12px 10px', textAlign: 'end', fontSize: 12, color: 'var(--jm-gray-500)' }}>≈</td>
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
              <Form.Item label="Mode">
                <Select value={paymentMode} onChange={setPaymentMode}
                  options={Object.entries(PaymentModeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
              </Form.Item>
              {paymentMode !== 1 && (
                <Form.Item label="Paid from bank account">
                  <Select value={bankAccountId} onChange={setBankAccountId} allowClear placeholder="Select bank account"
                    options={banksQuery.data?.items.map((b) => ({ value: b.id, label: `${b.name} · ${b.accountNumber}` })) ?? []} />
                </Form.Item>
              )}
              {paymentMode === 2 && (
                <>
                  <Form.Item label="Cheque number" required><Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="jm-tnum" /></Form.Item>
                  <Form.Item label="Cheque date" required>
                    <DatePicker value={chequeDate} onChange={setChequeDate} format="DD MMM YYYY" style={{ inlineSize: '100%' }} />
                  </Form.Item>
                  <Form.Item label="Drawn on bank"><Input value={drawnOnBank} onChange={(e) => setDrawnOnBank(e.target.value)} /></Form.Item>
                </>
              )}
              <Form.Item label="Remarks"><Input.TextArea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} /></Form.Item>
            </Form>
          </Card>

          {willRequireApproval && (
            <Alert type="warning" showIcon message="This voucher will be submitted for approval before payment." style={{ marginBlockEnd: 16 }} />
          )}
          {submitError && <Alert type="error" showIcon message={submitError} style={{ marginBlockEnd: 16 }} />}

          <Button size="large" block type="primary" icon={<CheckCircleFilled />} loading={mutation.isPending} onClick={onSubmit}>
            {willRequireApproval ? 'Submit for approval' : `Save & Pay (${money(total, currency)})`}
          </Button>
        </Col>
      </Row>
    </div>
  );
}
