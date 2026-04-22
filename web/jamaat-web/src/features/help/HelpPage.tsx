import { Card, Col, Collapse, Row, Space, Tag, Typography, Alert } from 'antd';
import {
  BankOutlined, BookOutlined, CalendarOutlined, FileTextOutlined, GiftOutlined,
  HeartOutlined, HomeOutlined, SafetyOutlined, TeamOutlined, UserSwitchOutlined, WalletOutlined,
  QuestionCircleOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAuth } from '../../shared/auth/useAuth';

const { Paragraph, Text } = Typography;

/// Grounded quick-reference for operators. Each card covers what the module does,
/// the permissions that unlock it, the typical day-to-day flow, and gotchas to
/// watch for. Kept inline so the content ships with the build and works offline.
export function HelpPage() {
  const { hasPermission } = useAuth();

  const modules = [
    {
      key: 'members',
      title: 'Members',
      icon: <TeamOutlined />,
      permissions: ['member.view', 'member.create', 'member.update', 'member.verify', 'member.sync'],
      path: '/members',
      summary:
        'Directory of every person in the Jamaat. Profile has 12 tabs (Identity, Contact, Family, Education, Profession, Health, Sabeel & Sila, Personal, Photo, Background, Permissions, Notes).',
      steps: [
        'Search by ITS/Name/TanzeemFileNo from the list.',
        'Open a profile and move between tabs — each tab saves independently.',
        'Data Verifier can mark a profile "Verified" once fields are cross-checked.',
        'Sync pulls fresh data from ITS; local edits win only for fields not sourced from ITS.',
      ],
      gotchas: [
        'TanzeemFileNo is globally unique across tenants — duplicates are rejected.',
        'Photo upload max 5 MB; images are stored under App_Data and streamed via /api/v1/members/{id}/profile/photo/file.',
      ],
    },
    {
      key: 'families',
      title: 'Families',
      icon: <HomeOutlined />,
      permissions: ['family.view', 'family.create', 'family.update'],
      path: '/families',
      summary: 'Group members into households. Each family has a head and one or more members; commitments can be scoped to a family.',
      steps: [
        'Create a family, set the head.',
        'Assign members from Family or from the Member profile → Family tab.',
      ],
      gotchas: ['A member can only belong to one family at a time.'],
    },
    {
      key: 'commitments',
      title: 'Commitments',
      icon: <HeartOutlined />,
      permissions: ['commitment.view', 'commitment.create', 'commitment.cancel', 'commitment.waive'],
      path: '/commitments',
      summary: 'Pledges (multi-instalment promises) from a member or family against a fund. Generates an agreement PDF from a template.',
      steps: [
        'New Commitment → pick party → fund → total → schedule (weekly/monthly/custom).',
        'System auto-generates the instalment schedule + agreement.',
        'Receipts allocated against this commitment close out instalments automatically.',
      ],
      gotchas: [
        'Donations are not required to have a commitment — Receipt form shows a visual cue when none is linked.',
        'Cancelling a commitment reverses no ledger entries — existing receipts remain valid.',
      ],
    },
    {
      key: 'enrollments',
      title: 'Fund Enrollments',
      icon: <GiftOutlined />,
      permissions: ['enrollment.view', 'enrollment.create', 'enrollment.approve'],
      path: '/fund-enrollments',
      summary: 'Enrol a member into a specific fund (Sabil, Wajebaat, Madrasa, etc.) so the fund appears on receipt allocation.',
      steps: [
        'New enrollment → pick member + fund + rate (if applicable).',
        'Approve if required by the fund type.',
        'Now visible on Receipt form under "Allocate to enrollment".',
      ],
      gotchas: ['Madrasa and Qarzan Hasana require a period/year reference on the enrollment.'],
    },
    {
      key: 'qh',
      title: 'Qarzan Hasana',
      icon: <BankOutlined />,
      permissions: ['qh.view', 'qh.create', 'qh.approve_l1', 'qh.approve_l2', 'qh.disburse', 'qh.waive', 'qh.cancel'],
      path: '/qarzan-hasana',
      summary: 'Interest-free loans to members. 2-level approval with optional guarantors and gold collateral. Repayment tracked as instalments.',
      steps: [
        'Create application → attach guarantors and/or gold details.',
        'L1 approves → L2 approves → Disburse (creates a voucher).',
        'Repayments come in as receipts allocated to the loan.',
      ],
      gotchas: [
        'A guarantor who has their own defaulted QH cannot be added — the form blocks and explains why.',
        'Waive requires L2 + a written reason; the event is audited.',
      ],
    },
    {
      key: 'events',
      title: 'Events',
      icon: <CalendarOutlined />,
      permissions: ['event.view', 'event.manage', 'event.scan'],
      path: '/events',
      summary:
        'Branded event portal with registration, guests, check-in, and a section-based Page Designer (13 section types + 3 theme presets).',
      steps: [
        'Create an event → Basics, Schedule, Registration options.',
        'Open Page Designer to build the public landing page — drag sections, pick a preset.',
        'Share tab: set OG title/description/image; copy the portal URL.',
        'On the day: use Scan mode (barcode/QR) to check attendees in.',
      ],
      gotchas: [
        'Public URL: /portal/events/{slug}. The API also serves /og/events/{slug} for social-media bots.',
        'CustomHtml sections are sanitised on render — external scripts are dropped.',
      ],
    },
    {
      key: 'receipts',
      title: 'Receipts',
      icon: <FileTextOutlined />,
      permissions: ['receipt.view', 'receipt.create', 'receipt.confirm', 'receipt.reprint', 'receipt.cancel', 'receipt.reverse'],
      path: '/receipts',
      summary: 'Every inward transaction. Ledger posts on Confirm — Draft and Cancelled never post.',
      steps: [
        'Capture → pick member → add allocation lines → payment details.',
        'Confirm → ledger + numbering are locked atomically.',
        'Reprint captures a reason; Cancel is allowed before any dependent posting.',
        'Reverse creates a balancing posting — original row is never mutated.',
      ],
      gotchas: [
        'Cheque fields required when Payment Mode = Cheque. Bank dropdown filters by tenant.',
        'Receipt Number comes from the active numbering series — closed periods cannot be back-dated into.',
      ],
    },
    {
      key: 'vouchers',
      title: 'Vouchers',
      icon: <WalletOutlined />,
      permissions: ['voucher.view', 'voucher.create', 'voucher.approve', 'voucher.cancel', 'voucher.reverse'],
      path: '/vouchers',
      summary: 'Every outward payment. Expense types can require approval above a configured threshold.',
      steps: ['Capture → Pay-to + purpose + expense lines.', 'Approve (if threshold crossed).', 'Pay → voucher posts to ledger.'],
      gotchas: ['You cannot approve your own voucher. The Approver role is separate from Counter.'],
    },
    {
      key: 'accounting',
      title: 'Accounting (Ledger & Periods)',
      icon: <BookOutlined />,
      permissions: ['accounting.view', 'accounting.journal', 'period.open', 'period.close'],
      path: '/ledger',
      summary: 'Double-entry ledger. Debit and credit always balance per source transaction; no mutations, only reversals.',
      steps: [
        'Inspect a transaction: Ledger → filter by source, account, fund, or date.',
        'Close period: locks postings in that window. Re-opening is audit-logged.',
        'Manual journal (rare): accounting.journal permission required.',
      ],
      gotchas: ['Closing a period with unposted drafts is blocked until those are resolved.'],
    },
    {
      key: 'reports',
      title: 'Reports',
      icon: <DatabaseOutlined />,
      permissions: ['reports.view', 'reports.export'],
      path: '/reports',
      summary: 'Daily collection, fund-wise, member contribution, cheque-wise, cancelled, reprint log, cash & bank books, QH summary, voluntary summary.',
      steps: ['Pick report → parameters → Run.', 'Export to Excel/PDF (needs reports.export).'],
      gotchas: ['Large ranges can take a few seconds on first run — results are cached per-query.'],
    },
    {
      key: 'admin',
      title: 'Admin',
      icon: <UserSwitchOutlined />,
      permissions: ['admin.users', 'admin.masterdata', 'admin.integration', 'admin.audit', 'admin.errorlogs'],
      path: '/admin/users',
      summary: 'Users & roles, master data (fund types, numbering, COA, banks, expense types, sectors, organisations, lookups, agreement templates, currencies, periods, tenant settings), integrations, audit log, error log.',
      steps: [
        'Users: create, assign role, grant individual permission claims beyond the role.',
        'Master data: every panel is CRUD with validation.',
        'Audit: every mutation (Create/Update/Cancel/Reverse/Print/Login) is captured with before/after JSON.',
      ],
      gotchas: ['Permissions are additive — a user gets the union of role claims + their own claims.'],
    },
  ];

  const visible = modules.filter((m) => m.permissions.some(hasPermission));
  // Admin-equivalent users see everything; fallback shows the whole list so at least something is visible.
  const list = visible.length ? visible : modules;

  return (
    <div>
      <PageHeader
        title="Help & Documentation"
        subtitle="Module-by-module reference for operators. Only modules you can access are listed."
      />

      <Alert
        type="info"
        showIcon
        icon={<QuestionCircleOutlined />}
        style={{ marginBlockEnd: 16 }}
        message="Tip: hover any field to see its description; errors show both the screen message and a server trace ID you can share with support."
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Collapse
            defaultActiveKey={list.slice(0, 2).map((m) => m.key)}
            items={list.map((m) => ({
              key: m.key,
              label: (
                <Space>
                  {m.icon}
                  <Text strong>{m.title}</Text>
                  <Link to={m.path} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12 }}>
                    Open
                  </Link>
                </Space>
              ),
              children: (
                <>
                  <Paragraph>{m.summary}</Paragraph>
                  <Paragraph strong style={{ marginBlockEnd: 4 }}>Typical flow</Paragraph>
                  <ol style={{ marginBlockStart: 0, paddingInlineStart: 20 }}>
                    {m.steps.map((s, i) => (<li key={i}><Text>{s}</Text></li>))}
                  </ol>
                  {m.gotchas.length > 0 && (
                    <>
                      <Paragraph strong style={{ marginBlockEnd: 4, marginBlockStart: 12 }}>Gotchas</Paragraph>
                      <ul style={{ marginBlockStart: 0, paddingInlineStart: 20 }}>
                        {m.gotchas.map((g, i) => (<li key={i}><Text type="secondary">{g}</Text></li>))}
                      </ul>
                    </>
                  )}
                  <div style={{ marginBlockStart: 12 }}>
                    {m.permissions.map((p) => (
                      <Tag key={p} color={hasPermission(p) ? 'green' : 'default'} style={{ marginBlockEnd: 4 }}>
                        {p}
                      </Tag>
                    ))}
                  </div>
                </>
              ),
            }))}
          />
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Test logins (development)" size="small" style={{ marginBlockEnd: 16 }}>
            <Paragraph type="secondary" style={{ fontSize: 12, marginBlockEnd: 8 }}>
              Every persona ships with password <Text code>Test@12345</Text>.
            </Paragraph>
            <ul style={{ paddingInlineStart: 18, marginBlockEnd: 0 }}>
              <li><Text code>admin@jamaat.local</Text> — full access</li>
              <li><Text code>cashier@jamaat.local</Text> — Counter (receipts + scan)</li>
              <li><Text code>accountant@jamaat.local</Text> — Receipts, vouchers, ledger, periods, reports</li>
              <li><Text code>events@jamaat.local</Text> — Events + scan</li>
              <li><Text code>qh-l1@jamaat.local</Text> — QH create + L1 approval</li>
              <li><Text code>qh-l2@jamaat.local</Text> — QH L2 approval, disburse, waive</li>
              <li><Text code>verifier@jamaat.local</Text> — Member verify only</li>
              <li><Text code>viewer@jamaat.local</Text> — Read-only across the app</li>
            </ul>
          </Card>

          <Card title="Keyboard shortcuts" size="small" style={{ marginBlockEnd: 16 }}>
            <ul style={{ paddingInlineStart: 18, marginBlockEnd: 0 }}>
              <li><kbd>Alt</kbd>+<kbd>N</kbd> — New Receipt (from anywhere)</li>
              <li><kbd>/</kbd> — Jump to Members search</li>
              <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd> — Confirm &amp; Print on the New Receipt screen (works from any field)</li>
            </ul>
          </Card>

          <Card title="Conventions" size="small" style={{ marginBlockEnd: 16 }}>
            <ul style={{ paddingInlineStart: 18, marginBlockEnd: 0 }}>
              <li>Dates are stored in UTC and shown in the tenant's locale.</li>
              <li>Amounts are stored in the original currency + converted to base (AED) via the latest exchange rate.</li>
              <li>Every mutation is recorded in the Audit Log with before/after JSON.</li>
              <li>Errors show a trace ID — copy it into support tickets for fast triage.</li>
            </ul>
          </Card>

          <Card title="Where things live" size="small">
            <ul style={{ paddingInlineStart: 18, marginBlockEnd: 0 }}>
              <li><SafetyOutlined /> <Link to="/admin/audit">Audit log</Link> — every mutation with before/after JSON.</li>
              <li><Link to="/admin/error-logs">Error logs</Link> — client + server exceptions, grouped by trace ID.</li>
              <li><Link to="/admin/integrations">Integrations</Link> — ITS sync, Excel import/export, sync errors.</li>
              <li><Link to="/admin/master-data">Master data</Link> — fund types, numbering, COA, periods, currencies.</li>
            </ul>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
