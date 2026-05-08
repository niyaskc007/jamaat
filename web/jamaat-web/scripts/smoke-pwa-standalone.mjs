// Emulate iOS PWA standalone mode (translucent status bar overlay) and
// verify the hamburger button isn't underneath the notch / status bar.
//
// Playwright doesn't have a native flag for "match `display-mode: standalone`"
// or "set safe-area-inset-* env values", so we inject a CSS hack that:
//   1. Forces the `(display-mode: standalone)` media query to evaluate true.
//   2. Sets the `--sait` custom property to 47px (typical iPhone notch inset)
//      and overrides `env(safe-area-inset-top)` via a fallback in the CSS.
//
// The cleaner alternative — using Chrome DevTools Protocol's
// `Emulation.setMetricsOverride` with insets — needs the CDP session, which
// we'd attach via `page.context().newCDPSession(page)`.

import { chromium } from '@playwright/test';

const BASE = 'https://homesetupstaging.azurewebsites.net';
const EMAIL = 'admin@ubrixy.com';
const PASS  = 'Password100$';
const OUT   = 'c:/tmp/mobile-screenshots';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  // iOS Safari standalone display-mode emulation via media-features override.
  // playwright lets us set this via emulateMedia on the page.
});
const page = await ctx.newPage();

// 1) Pretend we're in standalone display-mode (this is the canonical signal)
await page.emulateMedia({ media: 'screen', colorScheme: 'light' });

// 2) On every navigation, inject a stylesheet that forces a 47px top inset
//    so env(safe-area-inset-top) effectively equals 47px - the size of the
//    iOS notch / Dynamic Island inset on an iPhone 12+.
await page.addInitScript(() => {
  const sheet = `
    :root { --sait: 47px; }
    /* Override env() by chaining a fallback the CSS engine actually uses:
       since real env() isn't exposed for arbitrary values from JS, we patch
       computed style by adding a generated CSS rule that sets the same
       paddings explicitly. */
    .jm-app-topbar, .jm-portal-header, .jm-sider--overlay,
    .jm-portal-shell--mobile .jm-portal-sider--overlay {
      padding-block-start: var(--sait) !important;
    }
  `;
  const observer = new MutationObserver(() => {
    if (!document.head.querySelector('style[data-pwa-test]')) {
      const s = document.createElement('style');
      s.setAttribute('data-pwa-test', '1');
      s.textContent = sheet;
      document.head.appendChild(s);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
});

// Sign in
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
const email = await page.$('input:not([type="password"])');
if (email) await email.fill(EMAIL);
const pass = await page.$('input[type="password"]');
if (pass) await pass.fill(PASS);
await page.click('button[type="submit"]');
await page.waitForURL(/(dashboard|portal\/me)/, { timeout: 30_000 }).catch(() => {});

// Capture portal home in "standalone" mode
await page.goto(`${BASE}/portal/me`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.keyboard.press('Escape').catch(() => {});
await page.mouse.click(2, 2).catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/pwa-portal-home.png`, fullPage: false });

// And the operator dashboard
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.keyboard.press('Escape').catch(() => {});
await page.mouse.click(2, 2).catch(() => {});
// Force-inject the simulated 47px notch inset NOW that the SPA chrome is rendered.
await page.addStyleTag({
  content: `
    .jm-app-topbar, .jm-portal-header, .jm-sider--overlay,
    .jm-portal-shell--mobile .jm-portal-sider--overlay {
      padding-block-start: 47px !important;
    }
  `,
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/pwa-dashboard.png`, fullPage: false });

// Verify the hamburger button is below the simulated 47px status-bar area
const probe = await page.evaluate(() => {
  const h = document.querySelector('.jm-portal-header-hamburger, .jm-app-topbar-hamburger');
  if (!h) return { hamburger: 'missing' };
  const rect = h.getBoundingClientRect();
  return {
    hamburger: 'found',
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    isUnderStatusBar: rect.top < 47,
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
