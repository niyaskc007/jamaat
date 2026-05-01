import { useMemo, useState } from 'react';
import { Card, Table, Tag, Space, Button, Select, DatePicker, Input, Empty, App as AntdApp, Modal, Typography } from 'antd';
import { BankOutlined, CheckCircleOutlined, ThunderboltOutlined, StopOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { extractProblem } from '../../shared/api/client';
import { formatDate, money } from '../../shared/format/format';
import { postDatedChequesApi, PdcStatusLabel, PdcStatusColor, PdcSourceLabel, PdcSourceColor, type PostDatedCheque, type PostDatedChequeStatus } from '../commitments/postDatedChequesApi';
import { useAuth } from '../../shared/auth/useAuth';

/// Cashier-facing global PDC workbench. Lists every cheque across all commitments, with
/// filters for the daily-deposit workflow and a bulk "mark deposited" action so the cashier
/// doesn't have to walk the list one-by-one. Per-cheque deposit/clear/bounce/cancel still
/// available inline; bulk Clear is deliberately NOT offered because clearing a cheque needs
/// a per-cheque bank-account choice (it issues a real receipt + ledger post).
export function PostDatedChequesPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const qc = useQueryClient();
  const canEdit = hasPermission('commitment.update');

  // "Default" view: open cheques due to deposit (Pledged + dated <= today + 7d). Lets the
  // cashier hit the page on Monday morning and see exactly what to take to the bank.
  const [statusFilter, setStatusFilter] = useState<PostDatedChequeStatus | undefined>(1);
  const [dueWithin, setDueWithin] = useState<Dayjs | null>(dayjs().add(7, 'day'));
  const [bankFilter, setBankFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const list = useQuery({
    queryKey: ['pdcs', 'all', statusFilter ?? null],
    queryFn: () => postDatedChequesApi.list(statusFilter),
  });

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const dueIso = dueWithin ? dueWithin.format('YYYY-MM-DD') : null;
    const bank = bankFilter.trim().toLowerCase();
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (dueIso && r.chequeDate > dueIso) return false;
      if (bank && !r.drawnOnBank.toLowerCase().includes(bank)) return false;
      if (s) {
        const hay = [
          r.chequeNumber, r.memberName, r.memberItsNumber,
          r.commitmentCode, r.partyName,
          r.sourceReceiptNumber, r.sourceVoucherNumber, r.voucherPayTo,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [list.data, dueWithin, bankFilter, search]);

  const selectedRows = useMemo(() => filtered.filter((r) => selected.includes(r.id)), [filtered, selected]);
  const totalSelected = selectedRows.reduce((sum, r) => sum + r.amount, 0);
  const todayIso = dayjs().format('YYYY-MM-DD');

  // Bulk "mark deposited today" - loops the existing per-cheque endpoint sequentially so each
  // cheque's domain validation runs (e.g. depositedOn >= chequeDate). Reports per-row failures
  // and keeps the rest going.
  const bulkDeposit = async () => {
    const eligible = selectedRows.filter((r) => r.status === 1 && r.chequeDate <= todayIso);
    const skippedDueDate = selectedRows.filter((r) => r.status === 1 && r.chequeDate > todayIso);
    const skippedStatus = selectedRows.filter((r) => r.status !== 1);
    if (eligible.length === 0) {
      message.warning('None of the selected cheques are Pledged + dated on/before today.');
      return;
    }
    let ok = 0; let failed = 0;
    for (const r of eligible) {
      try { await postDatedChequesApi.deposit(r.id, todayIso); ok += 1; }
      catch (e) { failed += 1; message.error(`#${r.chequeNumber}: ${extractProblem(e).detail ?? 'failed'}`); }
    }
    void qc.invalidateQueries({ queryKey: ['pdcs'] });
    setSelected([]);
    const skippedNote = (skippedStatus.length || skippedDueDate.length)
      ? ` Skipped ${skippedStatus.length + skippedDueDate.length} (${skippedStatus.length} not Pledged, ${skippedDueDate.length} not yet due).`
      : '';
    if (ok > 0) message.success(`Marked ${ok} cheque(s) deposited.${skippedNote}${failed ? ` ${failed} failed.` : ''}`);
    else if (failed === 0) message.info(skippedNote.trim());
  };

  // Bulk cancel (returning to contributor). Asks for a single shared reason.
  const bulkCancel = () => {
    const eligible = selectedRows.filter((r) => r.status === 1);
    if (eligible.length === 0) {
      message.warning('Only Pledged cheques can be cancelled in bulk.');
      return;
    }
    let reason = '';
    modal.confirm({
      title: `Cancel ${eligible.length} cheque(s)?`,
      content: (
        <div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBlockStart: 0 }}>
            All selected Pledged cheques will move to Cancelled. The physical paper should be returned to each contributor.
          </Typography.Paragraph>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Reason (audit log):</Typography.Text>
          <Input.TextArea rows={3} autoFocus onChange={(e) => { reason = e.target.value; }} />
        </div>
      ),
      okText: 'Cancel cheques', okButtonProps: { danger: true },
      onOk: async () => {
        if (!reason.trim()) throw new Error('Reason required');
        let ok = 0; let failed = 0;
        for (const r of eligible) {
          try { await postDatedChequesApi.cancel(r.id, { cancelledOn: todayIso, reason }); ok += 1; }
          catch (e) { failed += 1; message.error(`#${r.chequeNumber}: ${extractProblem(e).detail ?? 'failed'}`); }
        }
        void qc.invalidateQueries({ queryKey: ['pdcs'] });
        setSelected([]);
        if (ok > 0) message.success(`${ok} cheque(s) cancelled${failed ? ` · ${failed} failed` : ''}.`);
      },
    });
  };

  return (
    <div>
      <PageHeader title="Cheques" subtitle="Manage all post-dated cheques across commitments." />

      <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 12, borderBlockEnd: '1px solid var(--jm-border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select style={{ inlineSize: 180 }} placeholder="Status" allowClear
            value={statusFilter} onChange={(v) => { setStatusFilter(v); setSelected([]); }}
            options={[1, 2, 3, 4, 5].map((s) => ({ value: s, label: PdcStatusLabel[s as PostDatedChequeStatus] }))} />
          <span style={{ fontSize: 13, color: 'var(--jm-gray-600)' }}>Cheque date on/before</span>
          <DatePicker value={dueWithin} onChange={setDueWithin} format="DD MMM YYYY" allowClear />
          <Input style={{ inlineSize: 180 }} placeholder="Drawn on bank contains..." allowClear
            value={bankFilter} onChange={(e) => setBankFilter(e.target.value)} />
          <Input.Search style={{ inlineSize: 240 }} placeholder="Cheque #, ITS, member, commitment"
            value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
          <div style={{ flex: 1 }} />
          {canEdit && (
            <Space>
              <Button icon={<ThunderboltOutlined />} disabled={selected.length === 0} onClick={bulkDeposit}>
                Mark deposited ({selected.length})
              </Button>
              <Button danger icon={<StopOutlined />} disabled={selected.length === 0} onClick={bulkCancel}>
                Cancel selected
              </Button>
            </Space>
          )}
        </div>

        {selected.length > 0 && (
          <div style={{ padding: '6px 12px', background: '#FEF3C7', borderBlockEnd: '1px solid #FCD34D', fontSize: 13 }}>
            <strong>{selected.length}</strong> cheque(s) selected · Total <span className="jm-tnum"><strong>{money(totalSelected, selectedRows[0]?.currency ?? 'AED')}</strong></span>
          </div>
        )}

        <Table<PostDatedCheque>
          rowKey="id" size="middle" loading={list.isLoading}
          dataSource={filtered}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys.map((k) => String(k))),
            getCheckboxProps: (row) => ({
              // Cleared/Bounced/Cancelled cheques are terminal - no point selecting them for bulk.
              disabled: row.status === 3 || row.status === 4 || row.status === 5,
            }),
          }}
          pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Cheque #', dataIndex: 'chequeNumber', width: 130, render: (v: string) => <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 500 }}>{v}</span> },
            { title: 'Cheque date', dataIndex: 'chequeDate', width: 110, render: (v: string) => formatDate(v) },
            { title: 'Drawn on', dataIndex: 'drawnOnBank', width: 160 },
            // Source: discriminator + linked source-doc identifier. Replaces the old fixed
            // "Commitment" column - we now have three kinds of source documents and the user
            // wants to know "which doc is this cheque tracking" at a glance.
            { title: 'Source', key: 'source', width: 200, render: (_, row) => {
              if (row.source === 1 && row.commitmentId) {
                return (
                  <Space direction="vertical" size={0}>
                    <Tag color={PdcSourceColor[1]} style={{ margin: 0, fontSize: 10 }}>{PdcSourceLabel[1]}</Tag>
                    <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}
                      onClick={() => navigate(`/commitments/${row.commitmentId}`)}>
                      {row.commitmentCode}{row.installmentNo ? <span className="jm-tnum" style={{ marginInlineStart: 4, color: 'var(--jm-gray-500)' }}>#{row.installmentNo}</span> : null}
                    </Button>
                  </Space>
                );
              }
              if (row.source === 2 && row.sourceReceiptId) {
                return (
                  <Space direction="vertical" size={0}>
                    <Tag color={PdcSourceColor[2]} style={{ margin: 0, fontSize: 10 }}>{PdcSourceLabel[2]}</Tag>
                    <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}
                      onClick={() => navigate(`/receipts/${row.sourceReceiptId}`)}>
                      {row.sourceReceiptNumber && row.sourceReceiptNumber !== '-' ? row.sourceReceiptNumber : 'Pending receipt'}
                    </Button>
                  </Space>
                );
              }
              if (row.source === 3 && row.sourceVoucherId) {
                return (
                  <Space direction="vertical" size={0}>
                    <Tag color={PdcSourceColor[3]} style={{ margin: 0, fontSize: 10 }}>{PdcSourceLabel[3]}</Tag>
                    <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}
                      onClick={() => navigate(`/vouchers/${row.sourceVoucherId}`)}>
                      {row.sourceVoucherNumber && row.sourceVoucherNumber !== '-' ? row.sourceVoucherNumber : 'Pending voucher'}
                    </Button>
                  </Space>
                );
              }
              return <span style={{ color: 'var(--jm-gray-400)' }}>-</span>;
            } },
            // Member is set for Commitment + Receipt sources; Voucher rows fall back to PayTo.
            { title: 'Payee', key: 'm', render: (_, row) => {
              if (row.memberId) {
                return <span><span className="jm-tnum" style={{ fontSize: 12, color: 'var(--jm-gray-500)' }}>{row.memberItsNumber}</span> · {row.memberName}</span>;
              }
              if (row.voucherPayTo) {
                return <span style={{ color: 'var(--jm-gray-700)' }}>{row.voucherPayTo}</span>;
              }
              return <span style={{ color: 'var(--jm-gray-400)' }}>-</span>;
            } },
            { title: 'Amount', dataIndex: 'amount', align: 'right', width: 130, render: (v: number, row) => <span className="jm-tnum" style={{ fontWeight: 600 }}>{money(v, row.currency)}</span> },
            { title: 'Status', dataIndex: 'status', width: 130, render: (s: PostDatedChequeStatus, row) => (
              <Space direction="vertical" size={0}>
                <Tag color={PdcStatusColor[s]} style={{ margin: 0 }}>{PdcStatusLabel[s]}</Tag>
                {s === 3 && row.clearedOn && <span style={{ fontSize: 10, color: 'var(--jm-gray-500)' }}>cleared {formatDate(row.clearedOn)}</span>}
                {s === 4 && row.bounceReason && <span style={{ fontSize: 10, color: '#DC2626' }} title={row.bounceReason}>{row.bounceReason.length > 24 ? row.bounceReason.slice(0, 24) + '…' : row.bounceReason}</span>}
              </Space>
            ) },
            // Open button routes to the appropriate source document.
            { title: '', key: 'a', width: 100, render: (_, row) => {
              const target = row.source === 1 && row.commitmentId ? `/commitments/${row.commitmentId}`
                : row.source === 2 && row.sourceReceiptId ? `/receipts/${row.sourceReceiptId}`
                : row.source === 3 && row.sourceVoucherId ? `/vouchers/${row.sourceVoucherId}`
                : null;
              if (!target) return null;
              return (
                <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => navigate(target)}>
                  Open
                </Button>
              );
            } },
          ]}
          locale={{ emptyText: <Empty description="No cheques match the filters" image={<BankOutlined style={{ fontSize: 32, color: 'var(--jm-gray-400)' }} />} /> }}
        />
      </Card>
    </div>
  );
}
