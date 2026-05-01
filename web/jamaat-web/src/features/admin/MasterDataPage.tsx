import { useSearchParams } from 'react-router-dom';
import { Tabs, Card, Row, Col, Button } from 'antd';
import { ArrowLeftOutlined, DatabaseOutlined, FieldNumberOutlined, BankOutlined, BookOutlined, DollarOutlined, CalendarOutlined, LineChartOutlined, GlobalOutlined, FileTextOutlined, HomeOutlined, HeartOutlined, TagsOutlined, SettingOutlined, AppstoreOutlined } from '@ant-design/icons';
import { PageHeader } from '../../shared/ui/PageHeader';
import { FundTypesPanel } from './master-data/fund-types/FundTypesPanel';
import { FundCategoriesPanel } from './master-data/fund-categories/FundCategoriesPanel';
import { NumberingSeriesPanel } from './master-data/numbering-series/NumberingSeriesPanel';
import { BankAccountsPanel } from './master-data/bank-accounts/BankAccountsPanel';
import { ChartOfAccountsPanel } from './master-data/chart-of-accounts/ChartOfAccountsPanel';
import { ExpenseTypesPanel } from './master-data/expense-types/ExpenseTypesPanel';
import { PeriodsPanel } from './master-data/periods/PeriodsPanel';
import { CurrenciesPanel } from './master-data/currencies/CurrenciesPanel';
import { ExchangeRatesPanel } from './master-data/exchange-rates/ExchangeRatesPanel';
import { AgreementTemplatesPanel } from './master-data/agreement-templates/AgreementTemplatesPanel';
import { SectorsPanel } from './master-data/sectors/SectorsPanel';
import { OrganisationsPanel } from './master-data/organisations/OrganisationsPanel';
import { LookupsPanel } from './master-data/lookups/LookupsPanel';
import { TenantSettingsPanel } from './master-data/tenant/TenantSettingsPanel';

type SectionKey =
  | 'currencies' | 'exchange-rates' | 'fund-categories' | 'fund-types' | 'expense-types'
  | 'numbering-series' | 'bank-accounts' | 'chart-of-accounts' | 'periods'
  | 'agreement-templates' | 'sectors' | 'organisations' | 'lookups' | 'tenant';

type Section = {
  key: SectionKey;
  title: string;
  description: string;
  group: 'Money & Accounts' | 'Funds & Receipts' | 'Community' | 'System';
  icon: React.ReactNode;
  color: string;
  render: () => React.ReactNode;
};

const SECTIONS: Section[] = [
  // Money & Accounts
  { key: 'currencies', title: 'Currencies', group: 'Money & Accounts',
    description: 'Base currency, secondary currencies and decimal precision used across the system.',
    icon: <GlobalOutlined />, color: '#0E5C40', render: () => <CurrenciesPanel /> },
  { key: 'exchange-rates', title: 'Exchange Rates', group: 'Money & Accounts',
    description: 'Daily / monthly conversion rates between base and secondary currencies.',
    icon: <LineChartOutlined />, color: '#0E7490', render: () => <ExchangeRatesPanel /> },
  { key: 'chart-of-accounts', title: 'Chart of Accounts', group: 'Money & Accounts',
    description: 'Asset, liability, equity, income and expense accounts used by the GL.',
    icon: <BookOutlined />, color: '#7C3AED', render: () => <ChartOfAccountsPanel /> },
  { key: 'bank-accounts', title: 'Bank Accounts', group: 'Money & Accounts',
    description: 'Bank, cash and digital wallet accounts available to receipts and vouchers.',
    icon: <BankOutlined />, color: '#9333EA', render: () => <BankAccountsPanel /> },
  { key: 'periods', title: 'Financial Periods', group: 'Money & Accounts',
    description: 'Open / close accounting periods. Postings only land in an open period.',
    icon: <CalendarOutlined />, color: '#D97706', render: () => <PeriodsPanel /> },

  // Funds & Receipts
  { key: 'fund-categories', title: 'Fund Categories', group: 'Funds & Receipts',
    description: 'Top-level grouping for fund types - religious, welfare, project etc.',
    icon: <AppstoreOutlined />, color: '#0E5C40', render: () => <FundCategoriesPanel /> },
  { key: 'fund-types', title: 'Fund Types', group: 'Funds & Receipts',
    description: 'Specific funds members can contribute to and the GL accounts they post into.',
    icon: <DatabaseOutlined />, color: '#0B6E63', render: () => <FundTypesPanel /> },
  { key: 'expense-types', title: 'Expense Types', group: 'Funds & Receipts',
    description: 'Expense categories used by vouchers - default GL account per type.',
    icon: <DollarOutlined />, color: '#D97706', render: () => <ExpenseTypesPanel /> },
  { key: 'numbering-series', title: 'Numbering Series', group: 'Funds & Receipts',
    description: 'Receipt, voucher, journal and other document numbering rules per year.',
    icon: <FieldNumberOutlined />, color: '#475569', render: () => <NumberingSeriesPanel /> },

  // Community
  { key: 'sectors', title: 'Sectors', group: 'Community',
    description: 'Geographical / administrative sectors that members and families belong to.',
    icon: <HomeOutlined />, color: '#0E7490', render: () => <SectorsPanel /> },
  { key: 'organisations', title: 'Organisations', group: 'Community',
    description: 'Affiliated organisations and bodies referenced by member records.',
    icon: <HeartOutlined />, color: '#DC2626', render: () => <OrganisationsPanel /> },
  { key: 'agreement-templates', title: 'Agreement Templates', group: 'Community',
    description: 'Reusable templates for Qarzan Hasana and other member agreements.',
    icon: <FileTextOutlined />, color: '#7C3AED', render: () => <AgreementTemplatesPanel /> },

  // System
  { key: 'lookups', title: 'Lookups', group: 'System',
    description: 'Generic dropdown values used in member, family and event forms.',
    icon: <TagsOutlined />, color: '#475569', render: () => <LookupsPanel /> },
  { key: 'tenant', title: 'Jamaat Settings', group: 'System',
    description: 'Tenant-wide settings - name, logo, contact info and operational defaults.',
    icon: <SettingOutlined />, color: '#0E5C40', render: () => <TenantSettingsPanel /> },
];

export function MasterDataPage() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab');

  if (active) {
    return (
      <div>
        <PageHeader title="Master Data" subtitle="Currencies, exchange rates, funds, numbering, bank & expense setup, chart of accounts, financial periods."
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => setParams({}, { replace: true })}>All sections</Button>} />
        <Tabs
          activeKey={active}
          onChange={(k) => setParams({ tab: k })}
          items={SECTIONS.map((s) => ({
            key: s.key,
            label: (<span>{s.icon} {s.title}</span>),
            children: s.render(),
          }))}
        />
      </div>
    );
  }

  const groups: Section['group'][] = ['Money & Accounts', 'Funds & Receipts', 'Community', 'System'];
  return (
    <div>
      <PageHeader title="Master Data"
        subtitle="Pick a section to configure. Bookmark or share the URL to land directly on a tab." />
      {groups.map((g) => {
        const list = SECTIONS.filter((s) => s.group === g);
        if (list.length === 0) return null;
        return (
          <div key={g} style={{ marginBlockEnd: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--jm-gray-500)', marginBlockEnd: 10,
            }}>{g}</div>
            <Row gutter={[12, 12]}>
              {list.map((s) => (
                <Col key={s.key} xs={24} sm={12} lg={8} xl={6}>
                  <Card hoverable
                    onClick={() => setParams({ tab: s.key })}
                    style={{ blockSize: '100%', border: '1px solid var(--jm-border)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{
                        inlineSize: 36, blockSize: 36, borderRadius: 8,
                        background: `${s.color}1A`, color: s.color,
                        display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
                      }}>{s.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--jm-gray-900, #1F2937)', marginBlockEnd: 4 }}>{s.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--jm-gray-600)', lineHeight: 1.5 }}>{s.description}</div>
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        );
      })}
    </div>
  );
}
