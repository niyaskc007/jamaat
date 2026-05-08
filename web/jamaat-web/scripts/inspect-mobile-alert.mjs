// Probe the operator dashboard alert at iPhone-12 width and dump its actual
// computed CSS so we know why my flex-wrap mobile rule isn't taking effect.

import { chromium } from '@playwright/test';

const BASE = 'https://homesetupstaging.azurewebsites.net';
const EMAIL = 'admin@ubrixy.com';
const PASS  = 'Password100$';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
const email = await page.$('input[type="email"]') ?? await page.$('input[name="email"]') ?? await page.$('input#email') ?? await page.$('input:not([type="password"])');
if (email) await email.fill(EMAIL);
const pass = await page.$('input[type="password"]');
if (pass) await pass.fill(PASS);
await page.click('button[type="submit"]');
await page.waitForURL(/(dashboard|portal\/me)/, { timeout: 30_000 }).catch(() => {});
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const dump = await page.evaluate(() => {
  const alert = document.querySelector('.ant-alert.ant-alert-with-description');
  if (!alert) return { found: false };
  // Dump actual children + their classes so we know AntD 5's new structure.
  const childTree = (el, depth = 0) =>
    Array.from(el.children).map((c) => ({
      tag: c.tagName.toLowerCase(),
      cls: c.className?.toString?.() ?? '',
      text: c.textContent?.trim().slice(0, 50),
      children: depth < 2 ? childTree(c, depth + 1) : '...',
    }));
  const content = alert.querySelector('.ant-alert-content');
  const action = alert.querySelector('.ant-alert-action');
  const cs = (el) => el ? Object.fromEntries(Object.entries({
    display: getComputedStyle(el).display,
    flexDirection: getComputedStyle(el).flexDirection,
    flexWrap: getComputedStyle(el).flexWrap,
    flex: getComputedStyle(el).flex,
    flexGrow: getComputedStyle(el).flexGrow,
    flexShrink: getComputedStyle(el).flexShrink,
    flexBasis: getComputedStyle(el).flexBasis,
    minWidth: getComputedStyle(el).minWidth,
    width: getComputedStyle(el).width,
    inlineSize: getComputedStyle(el).inlineSize,
    wordBreak: getComputedStyle(el).wordBreak,
    overflowWrap: getComputedStyle(el).overflowWrap,
    rect: el.getBoundingClientRect(),
  })) : null;
  return {
    found: true,
    alert: cs(alert),
    children: childTree(alert),
  };
});
console.log(JSON.stringify(dump, null, 2));
await browser.close();
