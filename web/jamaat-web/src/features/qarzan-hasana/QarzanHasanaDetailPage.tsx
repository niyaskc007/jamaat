import { useState } from 'react';
import { Button, Card, Descriptions, Space, Table, Tag, Spin, App as AntdApp, Result, Modal, Input, InputNumber, Progress, Row, Col, Alert } from 'antd';
import type { TableProps } from 'antd';
import {
  ArrowLeftOutlined, SendOutlined, CheckCircleOutlined, CloseCircleOutlined, DollarOutlined,
  StopOutlined, FileProtectOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime, money } from '../../shared/format/format';
import { extractProblem } from '../../shared/api/client';
import {
  qarzanHasanaApi, type QhInstallment,
  QhStatusLabel, QhStatusColor, QhSchemeLabel, QhInstallmentStatusLabel,
} from './qarzanHasanaApi';

export function QarzanHasanaDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['qh', id], queryFn: () => qarzanHasanaApi.get(id), enabled: !!id,
  });

  const [l1Open, setL1Open] = useState(false);
  const [l1Amount, setL1Amount] = useState<number>(0);
  const [l1Inst, setL1Inst] = useState<number>(0);
  const [l1Comments, setL1Comments] = useState('');

  const [l2Open, setL2Open] = useState(false);
  const [l2Comments, setL2Comments] = useState('');

  const [rejOpen, setRejOpen] = useState(false);
  const [rejReason, setRejReason] = useState('');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [disbOpen, setDisbOpen] = useState(false);
  const [disbDate, setDisbDate] = useState(dayjs().format('YYYY-MM-DD'));

  const [waiving, setWaiving] = useState<QhInstallment | null>(null);
  const [waiveReason, setWaiveReason] = useState('');

  const onErr = (e: unknown) => message.error(extractProblem(e).detail ?? 'Action failed');
  const onOk = () => { message.success('Done.'); void refetch(); void qc.invalidateQueries({ queryKey: ['qh'] }); };

  const submitMut = useMutation({ mutationFn: () => qarzanHasanaApi.submit(id), onSuccess: onOk, onError: onErr });
  const l1Mut = useMutation({
    mutationFn: () => qarzanHasanaApi.approveL1(id, l1Amount, l1Inst, l1Comments || undefined),
    onSuccess: () => { onOk(); setL1Open(false); }, onError: onErr,
  });
  const l2Mut = useMutation({
    mutationFn: () => qarzanHasanaApi.approveL2(id, l2Comments || undefined),
    onSuccess: () => { onOk(); setL2Open(false); }, onError: onErr,
  });
  const rejMut = useMutation({
    mutationFn: () => qarzanHasanaApi.reject(id, rejReason),
    onSuccess: () => { onOk(); setRejOpen(false); }, onError: onErr,
  });
  const cancelMut = useMutation({
    mutationFn: () => qarzanHasanaApi.cancel(id, cancelReason),
    onSuccess: () => { onOk(); setCancelOpen(false); }, onError: onErr,
  });
  const disbMut = useMutation({
    mutationFn: () => qarzanHasanaApi.disburse(id, disbDate),
    onSuccess: () => { onOk(); setDisbOpen(false); }, onError: onErr,
  });
  const waiveMut = useMutation({
    mutationFn: () => qarzanHasanaApi.waive(id, waiving!.id, waiveReason),
    onSuccess: () => { onOk(); setWaiving(null); setWaiveReason(''); }, onError: onErr,
  });

  if (isLoading || !data) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  const { loan, installments } = data;

  const isDraft = loan.status === 1;
  const isL1 = loan.status === 2;
  const isL2 = loan.status === 3;
  const isApproved = loan.status === 4;
  const isActive = loan.status === 5 || loan.status === 6;
  const isClosed = loan.status === 7 || loan.status === 8 || loan.status === 9 || loan.status === 10;

  const cols: TableProps<QhInstallment>['columns'] = [
    { title: '#', dataIndex: 'installmentNo', width: 60 },
    { title: 'Due date', dataIndex: 'dueDate', width: 130, render: (v: string) => formatDate(v) },
    { title: 'Scheduled', dataIndex: 'scheduledAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum">{money(v, loan.currency)}</span> },
    { title: 'Paid', dataIndex: 'paidAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum" style={{ color: v > 0 ? '#0E5C40' : 'var(--jm-gray-400)' }}>{money(v, loan.currency)}</span> },
    { title: 'Remaining', dataIndex: 'remainingAmount', width: 140, align: 'end',
      render: (v: number) => <span className="jm-tnum">{money(v, loan.currency)}</span> },
    { title: 'Status', dataIndex: 'status', width: 120, render: (s: QhInstallment['status']) => <Tag>{QhInstallmentStatusLabel[s]}</Tag> },
    { title: 'Last payment', dataIndex: 'lastPaymentDate', width: 130, render: (v: string | null) => v ? formatDate(v) : <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
    {
      key: 'actions', width: 100, align: 'end',
      render: (_: unknown, row) => row.status === 3 || row.status === 5 ? null :
        <Button size="small" type="text" icon={<FileProtectOutlined />} onClick={() => setWaiving(row)}>Waive</Button>,
    },
  ];

  return (
    <div>
      <PageHeader title={`QH · ${loan.code}`}
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/qarzan-hasana')}>Back</Button>
            {isDraft && <Button type="primary" icon={<SendOutlined />} loading={submitMut.isPending} onClick={() => submitMut.mutate()}>Submit for L1 approval</Button>}
            {isL1 && <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => { setL1Amount(loan.amountRequested); setL1Inst(loan.instalmentsRequested); setL1Open(true); }}>Approve L1</Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejOpen(true)}>Reject</Button>
            </>}
            {isL2 && <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setL2Open(true)}>Approve L2</Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejOpen(true)}>Reject</Button>
            </>}
            {isApproved && <Button type="primary" icon={<DollarOutlined />} onClick={() => setDisbOpen(true)}>Disburse</Button>}
            {!isClosed && !isActive && <Button danger icon={<StopOutlined />} onClick={() => setCancelOpen(true)}>Cancel</Button>}
          </Space>
        }
      />

      {loan.status === 10 && loan.rejectionReason && <Alert type="error" showIcon message="Rejected" description={loan.rejectionReason} style={{ marginBlockEnd: 16 }} />}
      {loan.status === 9 && loan.cancellationReason && <Alert type="warning" showIcon message="Cancelled" description={loan.cancellationReason} style={{ marginBlockEnd: 16 }} />}

      <Row gutter={16}>
        <Col span={16}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <Descriptions size="small" column={2} bordered
              items={[
                { key: 'b', label: 'Borrower', children: `${loan.memberName} · ITS ${loan.memberItsNumber}` },
                { key: 's', label: 'Scheme', children: QhSchemeLabel[loan.scheme] },
                { key: 'req', label: 'Amount requested', children: <span className="jm-tnum">{money(loan.amountRequested, loan.currency)}</span> },
                { key: 'apr', label: 'Amount approved', children: <span className="jm-tnum">{money(loan.amountApproved, loan.currency)}</span> },
                { key: 'dis', label: 'Disbursed', children: <span className="jm-tnum">{money(loan.amountDisbursed, loan.currency)}</span> },
                { key: 'rep', label: 'Repaid', children: <span className="jm-tnum" style={{ color: '#0E5C40' }}>{money(loan.amountRepaid, loan.currency)}</span> },
                { key: 'out', label: 'Outstanding', children: <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(loan.amountOutstanding, loan.currency)}</span> },
                { key: 'inst', label: 'Installments', children: `${loan.instalmentsApproved || loan.instalmentsRequested}` },
                { key: 'start', label: 'Start', children: formatDate(loan.startDate) },
                { key: 'end', label: 'End', children: loan.endDate ? formatDate(loan.endDate) : '-' },
                { key: 'gold', label: 'Gold amount', children: loan.goldAmount ? <span className="jm-tnum">{money(loan.goldAmount, loan.currency)}</span> : '-' },
                { key: 'status', label: 'Status', children: <Tag color={QhStatusColor[loan.status]}>{QhStatusLabel[loan.status]}</Tag> },
                { key: 'g1', label: 'Guarantor 1', children: loan.guarantor1Name },
                { key: 'g2', label: 'Guarantor 2', children: loan.guarantor2Name },
                ...(loan.level1ApprovedAtUtc ? [{ key: 'l1', label: 'L1 approval', span: 2, children: `${loan.level1ApproverName} · ${formatDateTime(loan.level1ApprovedAtUtc)}${loan.level1Comments ? ` · ${loan.level1Comments}` : ''}` }] : []),
                ...(loan.level2ApprovedAtUtc ? [{ key: 'l2', label: 'L2 approval', span: 2, children: `${loan.level2ApproverName} · ${formatDateTime(loan.level2ApprovedAtUtc)}${loan.level2Comments ? ` · ${loan.level2Comments}` : ''}` }] : []),
                ...(loan.disbursedOn ? [{ key: 'd', label: 'Disbursed on', children: formatDate(loan.disbursedOn) }] : []),
              ]}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ border: '1px solid var(--jm-border)' }}>
            <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlockEnd: 8 }}>Repayment progress</div>
            <Progress type="dashboard" percent={Math.min(100, Number(loan.progressPercent.toFixed(1)))}
              status={loan.status === 7 ? 'success' : loan.status === 8 || loan.status === 9 || loan.status === 10 ? 'exception' : 'active'} />
            {loan.cashflowDocumentUrl && <div style={{ marginBlockStart: 12 }}><a href={loan.cashflowDocumentUrl} target="_blank" rel="noreferrer">Cashflow document</a></div>}
            {loan.goldSlipDocumentUrl && <div><a href={loan.goldSlipDocumentUrl} target="_blank" rel="noreferrer">Gold slip</a></div>}
          </Card>
        </Col>
      </Row>

      <Card title="Installments" size="small" style={{ marginBlockStart: 16, border: '1px solid var(--jm-border)' }}>
        {installments.length === 0
          ? <div style={{ color: 'var(--jm-gray-500)' }}>Schedule will be generated on L2 approval.</div>
          : <Table<QhInstallment> rowKey="id" size="small" pagination={false} columns={cols} dataSource={installments} />}
      </Card>

      <Modal title="Approve L1" open={l1Open} onCancel={() => setL1Open(false)} onOk={() => l1Mut.mutate()} confirmLoading={l1Mut.isPending}>
        <Space direction="vertical" style={{ inlineSize: '100%' }}>
          <div>Approved amount:</div>
          <InputNumber value={l1Amount} onChange={(v) => setL1Amount(Number(v ?? 0))} style={{ inlineSize: '100%' }} />
          <div>Approved installments:</div>
          <InputNumber value={l1Inst} onChange={(v) => setL1Inst(Number(v ?? 0))} min={1} max={240} style={{ inlineSize: '100%' }} />
          <div>Comments (optional):</div>
          <Input.TextArea rows={2} value={l1Comments} onChange={(e) => setL1Comments(e.target.value)} />
        </Space>
      </Modal>

      <Modal title="Approve L2" open={l2Open} onCancel={() => setL2Open(false)} onOk={() => l2Mut.mutate()} confirmLoading={l2Mut.isPending}>
        <Space direction="vertical" style={{ inlineSize: '100%' }}>
          <Alert type="info" showIcon message="Final approval. This will auto-generate a monthly installment schedule." />
          <Input.TextArea rows={3} value={l2Comments} onChange={(e) => setL2Comments(e.target.value)} placeholder="Comments (optional)" />
        </Space>
      </Modal>

      <Modal title="Reject" open={rejOpen} onCancel={() => setRejOpen(false)} onOk={() => rejMut.mutate()} confirmLoading={rejMut.isPending}
        okButtonProps={{ danger: true, disabled: !rejReason.trim() }}>
        <Input.TextArea rows={3} value={rejReason} onChange={(e) => setRejReason(e.target.value)} placeholder="Reason (required)" />
      </Modal>

      <Modal title="Cancel loan" open={cancelOpen} onCancel={() => setCancelOpen(false)} onOk={() => cancelMut.mutate()} confirmLoading={cancelMut.isPending}
        okButtonProps={{ danger: true, disabled: !cancelReason.trim() }}>
        <Input.TextArea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (required)" />
      </Modal>

      <Modal title="Disburse loan" open={disbOpen} onCancel={() => setDisbOpen(false)} onOk={() => disbMut.mutate()} confirmLoading={disbMut.isPending}>
        <Space direction="vertical" style={{ inlineSize: '100%' }}>
          <Alert type="info" showIcon message="Record that funds have been disbursed. You can attach a Voucher ID later." />
          <Input value={disbDate} onChange={(e) => setDisbDate(e.target.value)} placeholder="Disbursement date (YYYY-MM-DD)" />
        </Space>
      </Modal>

      <Modal title="Waive installment" open={!!waiving} onCancel={() => setWaiving(null)} onOk={() => waiveMut.mutate()} confirmLoading={waiveMut.isPending}
        okButtonProps={{ danger: true, disabled: !waiveReason.trim() }}>
        {waiving && <div style={{ marginBlockEnd: 8 }}>Waiving installment #{waiving.installmentNo} - {money(waiving.scheduledAmount, loan.currency)} due {formatDate(waiving.dueDate)}</div>}
        <Input.TextArea rows={3} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder="Reason (required)" />
      </Modal>
    </div>
  );
}

export default function _NotFound() { return <Result status="404" title="Loan not found" />; }
