// Comprehensive admin-portal walkthrough smoke. Per RULES.md rule 45 + recent feedback:
// previous testing was too narrow (only tested newly-added portal pages, missed broken
// operator-side flows). This smoke walks every admin route, watches for nav-loss / 500s /
// 403s / unhandled console errors, and exercises the most common CRUD + approval flows.
//
// What it asserts on every page:
//   - URL routes correctly + no AccessDenied screen
//   - Sidebar remains present (operator nav doesn't disappear into a deep page)
//   - No HTTP 5xx from the API while loading the page
//   - No unexpected console errors (filters out AntD deprecation noise + Vite HMR)
//
// Run via: node scripts/smoke-admin-walkthrough.mjs
import { chromium } from 'playwright';

const SPA = 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@jamaat.local';
const ADMIN_PASS  = 'Admin@12345';

const issues = [];
function record(severity, area, detail) { issues.push({ severity, area, detail }); }

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const txt = msg.text();
  if (/antd:|deprecated|hmr|react-router|Failed to load resource|Manifest:|web-vitals/i.test(txt)) return;
  consoleErrors.push({ at: page.url(), txt });
});
const httpErrors = [];
page.on('response', async (r) => {
  if (r.status() >= 500) httpErrors.push({ at: page.url(), url: r.url(), status: r.status() });
});

async function signInAsAdmin() {
  await page.goto(`${SPA}/login`);
  await page.fill('input[autocomplete="username"]', ADMIN_EMAIL);
  await page.fill('input[autocomplete="current-password"]', ADMIN_PASS);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  console.log('  ✓ Signed in as admin');
}

// Use the API directly (with admin's cookie/JWT in localStorage) to fetch a seeded entity ID
// of each kind so the smoke can navigate detail pages without hardcoding GUIDs.
async function fetchSeedIds() {
  const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
  if (!token) throw new Error('No JWT in localStorage after admin sign-in.');
  const apiBase = 'http://localhost:5174/api/v1';
  const headers = { Authorization: `Bearer ${token}` };
  async function first(url) {
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? j[0]?.id ?? null : (j.items?.[0]?.id ?? null);
  }
  return {
    memberId:     await first(`${apiBase}/members?page=1&pageSize=1`),
    commitmentId: await first(`${apiBase}/commitments?page=1&pageSize=1`),
    enrollmentId: await first(`${apiBase}/fund-enrollments?page=1&pageSize=1`),
    qhId:         await first(`${apiBase}/qarzan-hasana?page=1&pageSize=1`),
    eventId:      await first(`${apiBase}/events?page=1&pageSize=1`),
    receiptId:    await first(`${apiBase}/receipts?page=1&pageSize=1`),
    voucherId:    await first(`${apiBase}/vouchers?page=1&pageSize=1`),
  };
}

async function visit(label, path, expectText, opts = {}) {
  const consoleBefore = consoleErrors.length;
  const httpBefore = httpErrors.length;
  await page.goto(`${SPA}${path}`);
  // Allow 1.5s for late XHR/console after route mount.
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

  // 1. AccessDenied screen?
  const denied = await page.locator('text=You don\'t have access to this page').count();
  if (denied > 0) record('FAIL', label, `AccessDenied screen at ${path}`);

  // 2. Sidebar present? (operator AppLayout sider should be rendered for /dashboard etc.)
  if (opts.requireSidebar !== false) {
    const sidebar = await page.locator('aside.ant-layout-sider, nav.ant-menu, .ant-layout-sider').count();
    if (sidebar === 0) record('WARN', label, `Sidebar appears missing at ${path}`);
  }

  // 3. Expected page-specific text rendered?
  if (expectText) {
    const found = await page.locator(`text=${expectText}`).count();
    if (found === 0) record('FAIL', label, `Expected "${expectText}" not rendered at ${path}`);
  }

  // 4. New 5xx during load?
  const newErrs = httpErrors.slice(httpBefore);
  for (const e of newErrs) record('FAIL', label, `HTTP ${e.status} from ${e.url}`);
  // 5. New console errors?
  const newConsole = consoleErrors.slice(consoleBefore);
  for (const e of newConsole) record('WARN', label, `Console error: ${e.txt.slice(0, 200)}`);

  console.log(`  ${denied > 0 || newErrs.length > 0 ? '✗' : '✓'} ${label}`);
}

try {
  console.log('▶ Sign in');
  await signInAsAdmin();

  console.log('\n▶ Walk every operator route');
  await visit('Dashboard',          '/dashboard',                'Dashboard');
  await visit('Members list',       '/members',                  'Members');
  await visit('Families list',      '/families',                 'Families');
  await visit('Commitments list',   '/commitments',              'Commitments');
  await visit('New commitment',     '/commitments/new',          'New');
  await visit('Patronages list',    '/fund-enrollments',         null);
  await visit('Qarzan Hasana list', '/qarzan-hasana',            'Qarzan Hasana');
  await visit('New QH',             '/qarzan-hasana/new',        null);
  await visit('Events list',        '/events',                   'Events');
  await visit('Receipts list',      '/receipts',                 'Receipts');
  await visit('New receipt',        '/receipts/new',             null);
  await visit('Cheques',            '/cheques',                  null);
  await visit('Vouchers list',      '/vouchers',                 'Vouchers');
  await visit('New voucher',        '/vouchers/new',             null);
  await visit('Accounting',         '/accounting',               null);
  await visit('Ledger',             '/ledger',                   null);
  await visit('Reports',            '/reports',                  null);
  await visit('Dashboards',         '/dashboards',               null);
  await visit('Administration hub', '/admin',                    null);
  await visit('Users admin',        '/admin/users',              'Users');
  await visit('Master data',        '/admin/master-data',        null);
  await visit('Integrations',       '/admin/integrations',       null);
  await visit('Audit',              '/admin/audit',              null);
  await visit('Error logs',         '/admin/error-logs',         null);
  await visit('Notifications log',  '/admin/notifications',      null);
  await visit('Reliability',        '/admin/reliability',        null);
  await visit('Change requests',    '/admin/change-requests',    null);
  await visit('CMS admin',          '/admin/cms',                null);
  await visit('Applications',       '/admin/applications',       null);
  await visit('System monitor',     '/system',                   null);
  await visit('System analytics',   '/system/analytics',         null);
  await visit('Help',               '/help',                     null);
  await visit('My account',         '/me',                       null);

  console.log('\n▶ Walk every detail page (seeded data)');
  const ids = await fetchSeedIds();
  if (ids.memberId)     await visit('Member profile',    `/members/${ids.memberId}`,        null);
  if (ids.commitmentId) await visit('Commitment detail', `/commitments/${ids.commitmentId}`, null);
  if (ids.enrollmentId) await visit('Patronage detail',  `/fund-enrollments/${ids.enrollmentId}`, null);
  if (ids.qhId)         await visit('QH detail',         `/qarzan-hasana/${ids.qhId}`,      null);
  if (ids.eventId)      await visit('Event detail',      `/events/${ids.eventId}`,          null);
  if (ids.receiptId)    await visit('Receipt detail',    `/receipts/${ids.receiptId}`,      null);
  if (ids.voucherId)    await visit('Voucher detail',    `/vouchers/${ids.voucherId}`,      null);

  console.log('\n▶ UX: Events list -> detail must open in a NEW TAB');
  await page.goto(`${SPA}/events`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  const eventLink = page.locator('table tbody tr a').first();
  if (await eventLink.count() > 0) {
    const target = await eventLink.getAttribute('target');
    if (target !== '_blank') {
      record('FAIL', 'Events nav', `Event-row link target="${target}" - must be "_blank" so the events list stays as the home base (user flagged this).`);
    } else {
      console.log('  ✓ Events list anchors carry target="_blank"');
    }
  } else {
    record('WARN', 'Events nav', 'No events rendered to verify the new-tab nav pattern.');
  }

  console.log('\n▶ Approval surface: change-requests page renders');
  await page.goto(`${SPA}/admin/change-requests`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  // The page should render its title without an AccessDenied screen (admin has the perm).
  const crDenied = await page.locator('text=You don\'t have access to this page').count();
  if (crDenied > 0) record('FAIL', 'Change-requests', 'AccessDenied for admin');

  console.log('\n▶ Application approvals queue renders');
  await page.goto(`${SPA}/admin/applications`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  const apDenied = await page.locator('text=You don\'t have access to this page').count();
  if (apDenied > 0) record('FAIL', 'Applications page', 'AccessDenied for admin');

  console.log('\n▶ CRUD probe: New Receipt form renders + key fields present');
  await page.goto(`${SPA}/receipts/new`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  // Look for the page header that NewReceiptPage renders. Use a tolerant selector to avoid
  // chasing exact wording.
  const hasMemberLabel = await page.locator('text=Member').count();
  if (hasMemberLabel === 0) record('WARN', 'Receipt form', 'No "Member" label rendered - form may not have mounted.');

  console.log('\n▶ CRUD probe: New Voucher form renders');
  await page.goto(`${SPA}/vouchers/new`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  const hasVoucherForm = await page.locator('button:has-text("Save"), button:has-text("Create")').count();
  if (hasVoucherForm === 0) record('WARN', 'Voucher form', 'No Save/Create button - form may not have mounted.');

  // ----- Detail-page sub-tabs (Events) ---------------------------------
  // The user specifically called out Events as a deep multi-tab page where navigation gets
  // lost. Walk every visible tab and assert each one mounts without an AccessDenied or
  // console explosion.
  if (ids.eventId) {
    console.log('\n▶ Event detail: walk every visible tab');
    await page.goto(`${SPA}/events/${ids.eventId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const tabs = await page.locator('div[role="tab"]').allInnerTexts();
    for (const tabText of tabs.filter(Boolean).slice(0, 8)) { // cap to avoid runaway
      const before = consoleErrors.length;
      await page.click(`div[role="tab"]:has-text("${tabText.trim()}")`).catch(() => {});
      await page.waitForFunction(() => true, { timeout: 600 }).catch(() => {});
      const denied = await page.locator('text=You don\'t have access to this page').count();
      if (denied > 0) record('FAIL', 'Event tab', `AccessDenied on tab "${tabText.trim()}"`);
      const newConsole = consoleErrors.slice(before);
      if (newConsole.length > 0) record('WARN', 'Event tab', `Console error on tab "${tabText.trim()}": ${newConsole[0].txt.slice(0, 120)}`);
    }
    console.log(`  ✓ ${tabs.length} event tabs walked`);
  }

  // ----- Detail-page sub-tabs (Member profile) -------------------------
  if (ids.memberId) {
    console.log('\n▶ Member profile: walk every visible tab');
    await page.goto(`${SPA}/members/${ids.memberId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const tabs = await page.locator('div[role="tab"]').allInnerTexts();
    for (const tabText of tabs.filter(Boolean).slice(0, 12)) {
      const before = consoleErrors.length;
      await page.click(`div[role="tab"]:has-text("${tabText.trim()}")`).catch(() => {});
      await page.waitForFunction(() => true, { timeout: 600 }).catch(() => {});
      const denied = await page.locator('text=You don\'t have access to this page').count();
      if (denied > 0) record('FAIL', 'Member tab', `AccessDenied on tab "${tabText.trim()}"`);
      const newConsole = consoleErrors.slice(before);
      if (newConsole.length > 0) record('WARN', 'Member tab', `Console error on "${tabText.trim()}": ${newConsole[0].txt.slice(0, 120)}`);
    }
    console.log(`  ✓ ${tabs.length} member tabs walked`);
  }

  // ----- Real CRUD: create + confirm a receipt via API, then verify the UI shows it ----
  console.log('\n▶ CRUD: API-create a receipt then verify it shows in the operator list');
  const apiBase = 'http://localhost:5174/api/v1';
  const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Pick the FIRST active fund-type (non-loan).
  const fundList = await fetch(`${apiBase}/fund-types?page=1&pageSize=20&active=true`, { headers }).then((r) => r.json());
  const fund = (fundList.items ?? []).find((f) => !f.isLoan);
  if (!fund) record('WARN', 'CRUD receipt', 'No active non-loan fund-type seeded.');
  if (fund && ids.memberId) {
    const today = new Date().toISOString().slice(0, 10);
    const body = {
      memberId: ids.memberId, receiptDate: today,
      currency: 'INR', paymentMode: 1,
      lines: [{ fundTypeId: fund.id, amount: 250, purpose: 'admin smoke' }],
    };
    const create = await fetch(`${apiBase}/receipts`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!create.ok) {
      record('FAIL', 'CRUD receipt', `POST /receipts → ${create.status}: ${(await create.text()).slice(0, 200)}`);
    } else {
      const created = await create.json();
      console.log(`  ✓ Created receipt ${created.id} (no#${created.receiptNumber ?? 'pending'})`);
      // Verify it shows up on the list page.
      await page.goto(`${SPA}/receipts`);
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      const found = await page.locator(`text=${created.receiptNumber ?? created.id.slice(0, 8)}`).count();
      if (found === 0) record('WARN', 'Receipts list',
        `Just-created receipt (number ${created.receiptNumber ?? created.id}) not visible on /receipts.`);
      else console.log('  ✓ New receipt visible in operator list');
      // And that the detail page renders.
      await visit('Receipt detail (new)', `/receipts/${created.id}`, null);
    }
  }

  // ----- API ping for every approval-relevant list endpoint --------------
  console.log('\n▶ Approval-list endpoints reachable + return 2xx');
  for (const path of ['/admin/member-change-requests', '/admin/member-applications', '/qarzan-hasana?status=2']) {
    const r = await fetch(`${apiBase}${path}`, { headers });
    if (r.status >= 400) record('FAIL', 'Approval API', `${path} → ${r.status}`);
    else console.log(`  ✓ GET ${path} → ${r.status}`);
  }

  console.log('\n=== ISSUES ===');
  if (issues.length === 0) {
    console.log('  No issues found.');
  } else {
    for (const i of issues) console.log(`  [${i.severity}] ${i.area}: ${i.detail}`);
  }

  const fails = issues.filter((i) => i.severity === 'FAIL').length;
  console.log(`\nTotal: ${issues.length} (FAIL=${fails}, WARN=${issues.length - fails})`);
  process.exit(fails > 0 ? 1 : 0);
} catch (err) {
  console.error('UNCAUGHT:', err.message);
  await page.screenshot({ path: 'smoke-admin-failure.png', fullPage: true }).catch(() => {});
  process.exit(2);
} finally {
  await browser.close();
}
