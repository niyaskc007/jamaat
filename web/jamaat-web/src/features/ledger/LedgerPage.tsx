import { useState } from 'react';
import { Card, Input, Select, Table, Tag, DatePicker, Button, Tabs } from 'antd';
import type { TableColumnsType } from 'antd';
import { SearchOutlined, ReloadOutlined, BookOutlined } from '@ant-design/icons';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../shared/ui/PageHeader';
import { money, formatDate } from '../../shared/format/format';
import { ledgerApi, LedgerSourceLabel, type LedgerEntry, type LedgerQuery, type LedgerSourceType, type AccountBalance } from './ledgerApi';
import { accountsApi } from '../admin/master-data/chart-of-accounts/accountsApi';
import { useBaseCurrency } from '../../shared/hooks/useBaseCurrency';

const { RangePicker } = DatePicker;

export function LedgerPage() {
  const { t } = useTranslation('common');
  return (
    <div>
      <PageHeader title={t('nav.ledger')} subtitle="Append-only double-entry general ledger." />
      <Tabs defaultActiveKey="entries" items={[
        { key: 'entries', label: 'Entries', children: <EntriesPanel /> },
        { key: 'balances', label: 'Trial balance', children: <BalancesPanel /> },
      ]} />
    </div>
  );
}

function EntriesPanel() {
  const [query, setQuery] = useState<LedgerQuery>({ page: 1, pageSize: 50 });
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [search, setSearch] = useState('');

  const accountsQuery = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => accountsApi.list({ page: 1, pageSize: 500 }) });

  const effective: LedgerQuery = {
    ...query, fromDate: range?.[0]?.format('YYYY-MM-DD'), toDate: range?.[1]?.format('YYYY-MM-DD'),
  };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ledger', effective], queryFn: () => ledgerApi.list(effective), placeholderData: keepPreviousData,
  });

  const columns: TableColumnsType<LedgerEntry> = [
    { title: 'Date', dataIndex: 'postingDate', key: 'date', width: 110, render: (v: string) => formatDate(v) },
    { title: 'Source', key: 'source', width: 140, render: (_, row) => (
      <div>
        <Tag style={{ margin: 0 }}>{LedgerSourceLabel[row.sourceType]}</Tag>
        <div style={{ fontSize: 12, marginBlockStart: 2, fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: 'var(--jm-gray-600)' }}>{row.sourceReference}</div>
      </div>
    ) },
    { title: 'Account', key: 'account', render: (_, row) => (
      <div>
        <span className="jm-tnum" style={{ color: 'var(--jm-gray-500)', marginInlineEnd: 8, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{row.accountCode}</span>
        <span style={{ fontWeight: 500 }}>{row.accountName}</span>
      </div>
    ) },
    { title: 'Fund', dataIndex: 'fundTypeName', key: 'fund', width: 140, render: (v?: string) => v ?? <span style={{ color: 'var(--jm-gray-400)' }}>-</span> },
    { title: 'Narration', dataIndex: 'narration', key: 'narr' },
    { title: 'Debit', dataIndex: 'debit', key: 'd', align: 'right', width: 140, render: (v: number, row: LedgerEntry) => v ? <span className="jm-tnum">{money(v, row.currency)}</span> : <span style={{ color: 'var(--jm-gray-300)' }}>-</span> },
    { title: 'Credit', dataIndex: 'credit', key: 'c', align: 'right', width: 140, render: (v: number, row: LedgerEntry) => v ? <span className="jm-tnum">{money(v, row.currency)}</span> : <span style={{ color: 'var(--jm-gray-300)' }}>-</span> },
  ];

  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderBlockEnd: '1px solid var(--jm-border)', flexWrap: 'wrap' }}>
        <RangePicker value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} style={{ inlineSize: 240 }}
          presets={[
            { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
            { label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] },
            { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
          ]} />
        <Select allowClear placeholder="Account" style={{ inlineSize: 280 }}
          value={query.accountId} showSearch optionFilterProp="label"
          onChange={(v) => setQuery((q) => ({ ...q, page: 1, accountId: v }))}
          options={accountsQuery.data?.items.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })) ?? []} />
        <Select allowClear placeholder="Source" style={{ inlineSize: 160 }}
          value={query.sourceType} onChange={(v) => setQuery((q) => ({ ...q, page: 1, sourceType: v }))}
          options={Object.entries(LedgerSourceLabel).map(([v, l]) => ({ value: Number(v) as LedgerSourceType, label: l }))} />
        <Input placeholder="Search reference / narration" prefix={<SearchOutlined style={{ color: 'var(--jm-gray-400)' }} />} allowClear value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => setQuery((q) => ({ ...q, page: 1, search }))}
          onBlur={() => setQuery((q) => ({ ...q, page: 1, search }))} style={{ flex: 1, minInlineSize: 220 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} />
      </div>
      <Table<LedgerEntry>
        rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={data?.items ?? []}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total ?? 0, showSizeChanger: true, showTotal: (t, [f, to]) => `${f}–${to} of ${t}` }}
        onChange={(p) => setQuery((q) => ({ ...q, page: p.current ?? 1, pageSize: p.pageSize ?? 50 }))}
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
}

function BalancesPanel() {
  const [asOf, setAsOf] = useState<Dayjs>(dayjs());
  const baseCurrency = useBaseCurrency();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['balances', asOf.format('YYYY-MM-DD')],
    queryFn: () => ledgerApi.balances(asOf.format('YYYY-MM-DD')),
  });

  const totals = (data ?? []).reduce((t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }), { debit: 0, credit: 0 });

  return (
    <Card style={{ border: '1px solid var(--jm-border)', boxShadow: 'var(--jm-shadow-1)' }} styles={{ body: { padding: 0 } }}>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderBlockEnd: '1px solid var(--jm-border)', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--jm-gray-600)' }}>As of</span>
        <DatePicker value={asOf} onChange={(v) => v && setAsOf(v)} format="DD MMM YYYY" />
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
      </div>
      <Table<AccountBalance>
        rowKey={(r) => r.accountId} size="middle" loading={isLoading} pagination={false}
        dataSource={data ?? []}
        columns={[
          { title: 'Code', dataIndex: 'accountCode', key: 'code', width: 100,
            render: (v: string) => <span className="jm-tnum" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>{v}</span> },
          { title: 'Account', dataIndex: 'accountName', key: 'name' },
          { title: 'Debit', dataIndex: 'debit', key: 'd', align: 'right', width: 140, render: (v: number) => v ? <span className="jm-tnum">{money(v, baseCurrency)}</span> : <span style={{ color: 'var(--jm-gray-300)' }}>-</span> },
          { title: 'Credit', dataIndex: 'credit', key: 'c', align: 'right', width: 140, render: (v: number) => v ? <span className="jm-tnum">{money(v, baseCurrency)}</span> : <span style={{ color: 'var(--jm-gray-300)' }}>-</span> },
          { title: 'Balance', dataIndex: 'balance', key: 'b', align: 'right', width: 160,
            render: (v: number) => <span className="jm-tnum" style={{ fontWeight: 600, color: v >= 0 ? 'var(--jm-gray-900)' : 'var(--jm-danger)' }}>{money(Math.abs(v), baseCurrency)}{v < 0 ? ' Cr' : ''}</span> },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={2} align="right"><strong>Totals</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right"><span className="jm-tnum" style={{ fontWeight: 700 }}>{money(totals.debit, baseCurrency)}</span></Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right"><span className="jm-tnum" style={{ fontWeight: 700 }}>{money(totals.credit, baseCurrency)}</span></Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">
              <span className="jm-tnum" style={{ fontWeight: 700, color: Math.abs(totals.debit - totals.credit) < 0.01 ? 'var(--jm-success)' : 'var(--jm-danger)' }}>
                {Math.abs(totals.debit - totals.credit) < 0.01 ? 'balanced' : money(totals.debit - totals.credit, baseCurrency)}
              </span>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
        locale={{ emptyText: <div style={{ padding: 40, textAlign: 'center', color: 'var(--jm-gray-500)' }}><BookOutlined style={{ fontSize: 32, color: 'var(--jm-gray-300)', display: 'block', margin: '0 auto 8px' }} />No ledger activity yet</div> }}
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
}
