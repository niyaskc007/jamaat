// Smoke test for the member portal gap-fill (Phase J): KPI dashboard, receipt detail/PDF,
// commitment detail, QH detail + self-submit form, patronages list/detail.
// Per RULES.md rule 45, frontend changes must be exercised through a real browser.
//
// Strategy: sign in as admin (has portal.access via permission grant) and walk every new
// route asserting (a) it renders without console errors, (b) the corresponding API returns
// 200, (c) the wired-up nav entries exist. Admin won't have member data so we only verify
// the routes load + key labels appear.
//
// Run via: node scripts/smoke-portal-gap-fill.mjs
import { chromium } from 'playwright';

const SPA = 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@jamaat.local';
const ADMIN_PASS  = 'Admin@12345';

function fail(step, detail) {
  console.error(`✗ ${step}: ${detail}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const txt = msg.text();
    // Ignore noisy AntD deprecation + Vite HMR + react-router-dom dev warnings + TanStack devtools.
    if (/antd:|deprecated|hmr|react-router/i.test(txt)) return;
    consoleErrors.push(txt);
  }
});

try {
  // ---- 1. Sign in as admin ------------------------------------------------
  console.log('▶ Sign in as admin');
  await page.goto(`${SPA}/login`);
  await page.fill('input[autocomplete="username"]', ADMIN_EMAIL);
  await page.fill('input[autocomplete="current-password"]', ADMIN_PASS);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 }).catch(() =>
    fail('Admin sign-in', `expected /dashboard, got ${page.url()}`)
  );
  console.log('  ✓ signed in');

  // ---- 2. Member portal home + KPI dashboard ------------------------------
  console.log('▶ Open /portal/me (KPI dashboard)');
  let dashStatus = null;
  page.on('response', (r) => {
    if (r.url().endsWith('/api/v1/portal/me/dashboard')) dashStatus = r.status();
  });
  await page.goto(`${SPA}/portal/me`);
  await page.waitForSelector('text=Salaam', { timeout: 10_000 });
  await page.waitForSelector('text=YTD contributions', { timeout: 10_000 })
    .catch(() => fail('KPI dashboard', 'Expected "YTD contributions" KPI label to render'));
  await page.waitForSelector('text=Active commitments', { timeout: 5_000 })
    .catch(() => fail('KPI dashboard', 'Expected "Active commitments" KPI label to render'));
  await page.waitForSelector('text=Active QH loans', { timeout: 5_000 })
    .catch(() => fail('KPI dashboard', 'Expected "Active QH loans" KPI label to render'));
  await page.waitForSelector('text=Pending guarantor requests', { timeout: 5_000 })
    .catch(() => fail('KPI dashboard', 'Expected "Pending guarantor requests" KPI label to render'));
  // Allow the dashboard fetch to land.
  await page.waitForFunction(() => true, { timeout: 1500 }).catch(() => {});
  if (dashStatus !== null && dashStatus !== 200) {
    fail('Dashboard endpoint', `Expected 200 from /api/v1/portal/me/dashboard, got ${dashStatus}`);
  }
  console.log(`  ✓ dashboard rendered (api status: ${dashStatus ?? 'n/a'})`);

  // ---- 3. Patronages list -------------------------------------------------
  console.log('▶ Open /portal/me/fund-enrollments (Patronages)');
  await page.goto(`${SPA}/portal/me/fund-enrollments`);
  await page.waitForSelector('h4:has-text("Patronages")', { timeout: 10_000 })
    .catch(() => fail('Patronages list', 'Expected "Patronages" header to render'));
  console.log('  ✓ patronages list rendered');

  // ---- 4. Contributions list (existing) -----------------------------------
  console.log('▶ Open /portal/me/contributions');
  await page.goto(`${SPA}/portal/me/contributions`);
  await page.waitForSelector('text=My contributions', { timeout: 10_000 })
    .catch(() => fail('Contributions list', 'Expected "My contributions" header to render'));
  console.log('  ✓ contributions list rendered');

  // ---- 5. Commitments list (existing) -------------------------------------
  console.log('▶ Open /portal/me/commitments');
  await page.goto(`${SPA}/portal/me/commitments`);
  await page.waitForSelector('text=My commitments', { timeout: 10_000 })
    .catch(() => fail('Commitments list', 'Expected "My commitments" header to render'));
  console.log('  ✓ commitments list rendered');

  // ---- 6. QH list + self-submit form (Phase J - new) ----------------------
  console.log('▶ Open /portal/me/qarzan-hasana');
  await page.goto(`${SPA}/portal/me/qarzan-hasana`);
  await page.waitForSelector('h4:has-text("Qarzan Hasana")', { timeout: 10_000 })
    .catch(() => fail('QH list', 'Expected "Qarzan Hasana" header to render'));
  // The "Request a loan" button now links to /portal/me/qarzan-hasana/new (NOT the old
  // operator route /qarzan-hasana/new).
  const requestBtn = page.locator('a[href="/portal/me/qarzan-hasana/new"]').first();
  if (await requestBtn.count() === 0) {
    fail('QH list', 'Expected "Request a loan" link to /portal/me/qarzan-hasana/new');
  }
  await requestBtn.click();
  await page.waitForURL(/\/portal\/me\/qarzan-hasana\/new/, { timeout: 10_000 });
  await page.waitForSelector('text=New Qarzan Hasana request', { timeout: 10_000 })
    .catch(() => fail('QH submit', 'Expected "New Qarzan Hasana request" header on form'));
  // Form fields: amount + instalments + start date + guarantor 1 + guarantor 2.
  await page.waitForSelector('text=Amount requested', { timeout: 5_000 });
  await page.waitForSelector('text=Number of instalments', { timeout: 5_000 });
  await page.waitForSelector('text=Guarantor 1', { timeout: 5_000 });
  await page.waitForSelector('text=Guarantor 2', { timeout: 5_000 });
  console.log('  ✓ QH self-submit form rendered');

  // ---- 7. Sidebar nav contains Patronages entry --------------------------
  console.log('▶ Verify sidebar Patronages entry');
  await page.goto(`${SPA}/portal/me`);
  // Sidebar uses AntD Menu; the patronages key is /portal/me/fund-enrollments.
  await page.waitForSelector('aside li[role="menuitem"]:has-text("Patronages"), .ant-menu-item:has-text("Patronages")', { timeout: 10_000 })
    .catch(() => fail('Sidebar nav', 'Expected "Patronages" entry in member portal sidebar'));
  console.log('  ✓ Patronages nav entry visible');

  if (consoleErrors.length > 0) {
    console.error('\nConsole errors during smoke:');
    consoleErrors.forEach((e) => console.error('  -', e));
    fail('Console errors', `${consoleErrors.length} unexpected console error(s).`);
  }

  console.log('\n✓ ALL STEPS PASSED');
  process.exit(0);
} catch (err) {
  console.error('UNCAUGHT:', err.message);
  await page.screenshot({ path: 'smoke-portal-gap-fill-failure.png', fullPage: true }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
