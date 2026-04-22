import { useState } from 'react';
import { Card, Form, Input, InputNumber, Select, DatePicker, Button, Space, App as AntdApp, Alert, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { MemberPicker } from '../families/FamilyFormDrawer';
import { extractProblem } from '../../shared/api/client';
import { qarzanHasanaApi, QhSchemeLabel, type QhScheme } from './qarzanHasanaApi';

export function NewQarzanHasanaPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

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

  const mut = useMutation({
    mutationFn: () => qarzanHasanaApi.create({
      memberId, scheme, amountRequested: amount, instalmentsRequested: installments,
      currency, startDate: startDate.format('YYYY-MM-DD'),
      guarantor1MemberId: g1, guarantor2MemberId: g2,
      goldAmount: gold ?? undefined,
      cashflowDocumentUrl: cashflowUrl || undefined,
      goldSlipDocumentUrl: goldSlipUrl || undefined,
    }),
    onSuccess: (loan) => {
      message.success(`Loan ${loan.code} created as Draft.`);
      navigate(`/qarzan-hasana/${loan.id}`);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed'),
  });

  const canSubmit = memberId && g1 && g2 && g1 !== g2 && g1 !== memberId && g2 !== memberId && amount > 0 && installments > 0;

  return (
    <div>
      <PageHeader title="New Qarzan Hasana application"
        subtitle="Loan application. Submit → Level-1 approval → Level-2 approval → Disburse."
        actions={<Button onClick={() => navigate('/qarzan-hasana')}>Cancel</Button>} />

      <Card style={{ border: '1px solid var(--jm-border)' }}>
        <Form layout="vertical" requiredMark={false}>
          <Alert type="info" showIcon style={{ marginBlockEnd: 16 }}
            message="Two guarantors are required. Guarantors must be active members and cannot be the borrower." />
          <Row gutter={16}>
            <Col span={12}><Form.Item label="Borrower" required><MemberPicker value={memberId} onChange={setMemberId} /></Form.Item></Col>
            <Col span={12}><Form.Item label="Scheme">
              <Select value={scheme} onChange={(v) => setScheme(v as QhScheme)}
                options={Object.entries(QhSchemeLabel).map(([v, l]) => ({ value: Number(v), label: l }))} />
            </Form.Item></Col>
            <Col span={8}><Form.Item label="Currency">
              <Select value={currency} onChange={setCurrency}
                options={['AED', 'USD', 'INR', 'SAR'].map((c) => ({ value: c, label: c }))} />
            </Form.Item></Col>
            <Col span={8}><Form.Item label="Amount requested" required>
              <InputNumber value={amount} onChange={(v) => setAmount(Number(v ?? 0))} min={1} style={{ inlineSize: '100%' }} />
            </Form.Item></Col>
            <Col span={8}><Form.Item label="Instalments requested">
              <InputNumber value={installments} onChange={(v) => setInstallments(Number(v ?? 1))} min={1} max={240} style={{ inlineSize: '100%' }} />
            </Form.Item></Col>
            <Col span={12}><Form.Item label="Start date">
              <DatePicker value={startDate} onChange={(v) => v && setStartDate(v)} style={{ inlineSize: '100%' }} />
            </Form.Item></Col>
            <Col span={12}><Form.Item label="Gold amount (optional)">
              <InputNumber value={gold ?? undefined} onChange={(v) => setGold(v === null || v === undefined ? null : Number(v))}
                min={0} style={{ inlineSize: '100%' }} placeholder="Value of gold collateral" />
            </Form.Item></Col>
            <Col span={12}><Form.Item label="Guarantor 1" required><MemberPicker value={g1} onChange={setG1} /></Form.Item></Col>
            <Col span={12}><Form.Item label="Guarantor 2" required><MemberPicker value={g2} onChange={setG2} /></Form.Item></Col>
            <Col span={12}><Form.Item label="Cashflow document URL">
              <Input value={cashflowUrl} onChange={(e) => setCashflowUrl(e.target.value)} placeholder="Link to uploaded cashflow doc" />
            </Form.Item></Col>
            <Col span={12}><Form.Item label="Gold slip URL">
              <Input value={goldSlipUrl} onChange={(e) => setGoldSlipUrl(e.target.value)} placeholder="Link to gold slip if applicable" />
            </Form.Item></Col>
          </Row>
          <Space style={{ display: 'flex', justifyContent: 'flex-end', marginBlockStart: 16 }}>
            <Button type="primary" loading={mut.isPending} disabled={!canSubmit} onClick={() => mut.mutate()}>Create as Draft</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
