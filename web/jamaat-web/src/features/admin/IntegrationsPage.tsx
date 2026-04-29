import { ApiOutlined } from '@ant-design/icons';
import { PageHeader } from '../../shared/ui/PageHeader';
import { EmptyHero } from '../../shared/ui/EmptyHero';

export function IntegrationsPage() {
  return (
    <div>
      <PageHeader title="Integrations" subtitle="External systems - ITS, banking, reporting, notifications." />
      <EmptyHero
        milestone="M1 – M4"
        icon={<ApiOutlined />}
        title="Integrations"
        description="Pull members from the main Jamaat platform, push transactions out to downstream systems, and fall back to Excel import/export when an API isn't available."
        features={[
          'ITS member sync (API or manual Excel)',
          'Excel / CSV import with staging & review',
          'Export any list to PDF / Excel',
          'Webhook outbound events',
          'Sync error queue with retry + dead-letter',
          'Scheduled jobs (Hangfire)',
        ]}
      />
    </div>
  );
}
