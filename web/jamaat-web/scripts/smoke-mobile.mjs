// Mobile-smoke screenshot run. Hits the live deployment, signs in, and captures
// the operator dashboard + several member-portal pages at iPhone-12 width
// (390x844) so we can SEE if the layout is sane before claiming done.

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = 'https://homesetupstaging.azurewebsites.net';
const EMAIL = 'admin@ubrixy.com';
const PASS  = 'Password100$';
const OUT   = 'c:/tmp/mobile-screenshots';

const PAGES = [
  // Operator side
  { name: '01-login',                 path: '/login',                          gate: 'unauth' },
  { name: '02-operator-dashboard',    path: '/dashboard',                      gate: 'operator' },
  { name: '03-operator-members',      path: '/members',                        gate: 'operator' },
  { name: '04-operator-receipts',     path: '/receipts',                       gate: 'operator' },
  { name: '05-operator-commitments',  path: '/commitments',                    gate: 'operator' },
  // Member-portal pages (still accessible by Operator since admin has all perms,
  // and we want to see the member-portal layout itself).
  { name: '10-portal-home',           path: '/portal/me',                      gate: 'auth' },
  { name: '11-portal-contributions',  path: '/portal/me/contributions',        gate: 'auth' },
  { name: '12-portal-commitments',    path: '/portal/me/commitments',          gate: 'auth' },
  { name: '13-portal-qh',             path: '/portal/me/qarzan-hasana',        gate: 'auth' },
  { name: '14-portal-fund-enroll',    path: '/portal/me/fund-enrollments',     gate: 'auth' },
  { name: '15-portal-events',         path: '/portal/me/events',               gate: 'auth' },
  { name: '16-portal-profile',        path: '/portal/me/profile',              gate: 'auth' },
  { name: '17-portal-login-history',  path: '/portal/me/login-history',        gate: 'auth' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },     // iPhone 12
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  const findings = [];

  // 1. Login screen first (unauth)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/01-login.png`, fullPage: true });
  findings.push({ name: 'login', overflow: await checkOverflow(page) });

  // Fill in creds and submit
  await page.fill('input[type="text"], input[name="email"], input[id*="email"]', EMAIL).catch(() => {});
  // The login form uses react-hook-form but the email field doesn't have a stable name,
  // so try selectors in order until one matches.
  const emailSelectors = ['input[name="email"]', 'input#email', 'input[type="email"]', 'input[placeholder*="Email" i]'];
  for (const sel of emailSelectors) {
    const el = await page.$(sel);
    if (el) { await el.fill(EMAIL); break; }
  }
  const passSelectors = ['input[name="password"]', 'input#password', 'input[type="password"]'];
  for (const sel of passSelectors) {
    const el = await page.$(sel);
    if (el) { await el.fill(PASS); break; }
  }
  await page.click('button[type="submit"]');
  // Wait for either dashboard or portal/me
  await page.waitForURL(/(dashboard|portal\/me)/, { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});

  // Now visit each page and snapshot
  for (const p of PAGES.slice(1)) {
    process.stdout.write(`Snapping ${p.name} (${p.path})... `);
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(800); // settle animations
      // Dismiss any auto-opened popovers / dropdowns / tooltips so the screenshot
      // captures the actual page chrome instead of the overlay.
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.click(2, 2).catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: true });
      const overflow = await checkOverflow(page);
      findings.push({ name: p.name, path: p.path, overflow });
      console.log(`ok  overflow=${overflow.hasOverflow ? 'YES (' + overflow.count + ' offending elements)' : 'no'}  scrollWidth=${overflow.scrollWidth} viewport=390`);
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      findings.push({ name: p.name, path: p.path, error: String(e?.message ?? e) });
    }
  }

  writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  await browser.close();
}

// Returns whether ANY element on the page exceeds the viewport width, plus a
// few sample selectors. This is the "did the layout actually fit" check.
async function checkOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 1 && rect.width > 0 && rect.height > 0) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className?.toString?.().slice(0, 80) ?? '',
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
        if (offenders.length >= 5) break;
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > vw + 1,
      count: offenders.length,
      sample: offenders,
    };
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
