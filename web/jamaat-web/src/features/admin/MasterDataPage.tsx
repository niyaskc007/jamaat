import { useSearchParams } from 'react-router-dom';
import { Tabs } from 'antd';
import { DatabaseOutlined, FieldNumberOutlined, BankOutlined, BookOutlined, DollarOutlined, CalendarOutlined, LineChartOutlined, GlobalOutlined, FileTextOutlined, HomeOutlined, HeartOutlined, TagsOutlined, SettingOutlined } from '@ant-design/icons';
import { PageHeader } from '../../shared/ui/PageHeader';
import { FundTypesPanel } from './master-data/fund-types/FundTypesPanel';
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

export function MasterDataPage() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'currencies';

  return (
    <div>
      <PageHeader title="Master Data" subtitle="Currencies, exchange rates, funds, numbering, bank & expense setup, chart of accounts, financial periods." />
      <Tabs
        activeKey={active}
        onChange={(k) => setParams({ tab: k })}
        items={[
          { key: 'currencies', label: (<span><GlobalOutlined /> Currencies</span>), children: <CurrenciesPanel /> },
          { key: 'exchange-rates', label: (<span><LineChartOutlined /> Exchange Rates</span>), children: <ExchangeRatesPanel /> },
          { key: 'fund-types', label: (<span><DatabaseOutlined /> Fund Types</span>), children: <FundTypesPanel /> },
          { key: 'expense-types', label: (<span><DollarOutlined /> Expense Types</span>), children: <ExpenseTypesPanel /> },
          { key: 'numbering-series', label: (<span><FieldNumberOutlined /> Numbering Series</span>), children: <NumberingSeriesPanel /> },
          { key: 'bank-accounts', label: (<span><BankOutlined /> Bank Accounts</span>), children: <BankAccountsPanel /> },
          { key: 'chart-of-accounts', label: (<span><BookOutlined /> Chart of Accounts</span>), children: <ChartOfAccountsPanel /> },
          { key: 'periods', label: (<span><CalendarOutlined /> Financial Periods</span>), children: <PeriodsPanel /> },
          { key: 'agreement-templates', label: (<span><FileTextOutlined /> Agreement Templates</span>), children: <AgreementTemplatesPanel /> },
          { key: 'sectors', label: (<span><HomeOutlined /> Sectors</span>), children: <SectorsPanel /> },
          { key: 'organisations', label: (<span><HeartOutlined /> Organisations</span>), children: <OrganisationsPanel /> },
          { key: 'lookups', label: (<span><TagsOutlined /> Lookups</span>), children: <LookupsPanel /> },
          { key: 'tenant', label: (<span><SettingOutlined /> Jamaat Settings</span>), children: <TenantSettingsPanel /> },
        ]}
      />
    </div>
  );
}
