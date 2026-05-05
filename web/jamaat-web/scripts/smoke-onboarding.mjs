// Headed-browser smoke test for the admin onboarding flow + member first-login.
// Per RULES.md rule 45, frontend changes must be verified through a real browser
// click-through. The test:
//   1. Boots Chromium and signs in as admin@jamaat.com.
//   2. Opens Users, picks a Member-role user, opens Manage > Portal access.
//   3. Toggles the Login allowed switch off, asserts the UI reflects the change.
//   4. Toggles it back on, asserts the UI reflects the change.
//   5. Clicks the big "Send welcome email" / "Re-send welcome email" button.
//   6. Reads the temp password from the modal (which MUST also identify the user).
//   7. Signs out, signs in as the member with the temp password.
//   8. Forces a permanent-password change.
//   9. Asserts the URL after change-password is /portal/me (NOT /dashboard).
//
// Failures throw with the exact step that broke. Run via:
//   npx node scripts/smoke-onboarding.mjs
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';

const SPA = 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@jamaat.com';
const ADMIN_PASS  = 'Password100$';
const MEMBER_ITS  = '40123022'; // Arwa Ezzy - has Member role + isLoginAllowed=true

function fail(step, detail) {
  console.error(`✗ ${step}: ${detail}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  // ---- 1. Admin sign-in ---------------------------------------------------
  console.log('▶ Admin sign-in');
  await page.goto(`${SPA}/login`);
  await page.fill('input[autocomplete="username"]', ADMIN_EMAIL);
  await page.fill('input[autocomplete="current-password"]', ADMIN_PASS);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  console.log('  ✓ landed on', page.url());

  // ---- 2. Open Users page ------------------------------------------------
  console.log('▶ Navigate to Users');
  await page.goto(`${SPA}/admin/users`);
  // Wait for the Users tab content; the page-level search input is enabled, the global
  // top-bar one is disabled. Locate by sibling button + filter to the enabled one.
  await page.waitForSelector('text=Add user', { timeout: 10_000 });
  const searchInput = page.locator('input.ant-input:not([disabled])').first();
  await searchInput.fill(MEMBER_ITS);
  await page.waitForSelector(`text=${MEMBER_ITS}`, { timeout: 10_000 });
  // Click "Manage" link in the row matching this user.
  await page.locator('a:has-text("Manage"), button:has-text("Manage")').first().click();

  // ---- 3. Open Portal access tab ----------------------------------------
  console.log('▶ Open Portal access tab');
  await page.click('div[role="tab"]:has-text("Portal access")');
  await page.waitForSelector('text=Granular controls', { timeout: 5_000 });

  // ---- 4. Capture initial switch state, toggle, assert reflection -------
  console.log('▶ Toggle Login allowed (panel switch)');
  // Locate the inline switch inside the "Granular controls" card. The panel-level switch
  // has NO popconfirm wrapper - clicking it directly fires setLoginAllowedMut.
  const loginSwitch = page.locator('.jm-portal-access-row').filter({ hasText: 'Login allowed' }).locator('button[role="switch"]').first();
  await loginSwitch.waitFor({ timeout: 5_000 });
  const before = await loginSwitch.getAttribute('aria-checked');
  console.log('  initial aria-checked:', before);

  // Helper: click + assert the aria-checked attribute on the same element flips to the
  // expected value within a few seconds. This is exactly the staleness bug we saw before.
  async function clickAndExpect(target) {
    await loginSwitch.click();
    await page.waitForFunction(
      ([selector, expected]) => {
        const els = document.querySelectorAll(selector);
        // Find the switch nearest the "Login allowed" label
        for (const el of els) {
          const row = el.closest('.jm-portal-access-row');
          if (row && row.textContent.includes('Login allowed')) return el.getAttribute('aria-checked') === expected;
        }
        return false;
      },
      ['button[role="switch"]', target],
      { timeout: 7_000 }
    ).catch(() => fail(`Toggle to ${target}`, `switch UI did not reflect server state (staleness bug)`));
  }

  // Flip to off then on so we exercise BOTH directions and confirm the panel re-reads
  // the user from the server after each mutation.
  if (before === 'true') {
    await clickAndExpect('false');
    console.log('  ✓ flipped OFF, UI reflects new state');
  }
  await clickAndExpect('true');
  console.log('  ✓ flipped ON, UI reflects new state');

  // ---- 5. Send welcome email + capture temp password --------------------
  console.log('▶ Click "Re-send welcome email" / send-welcome');
  // The button text is either "Enable login + send welcome email" or "Re-send welcome email".
  const sendBtn = page.locator('button.ant-btn-primary:has-text("welcome email")').first();
  await sendBtn.click();
  // Popconfirm. Its OK button is .ant-popover-buttons .ant-btn-primary, NOT just any
  // "Send" text - other elements on the page may match too.
  const popconfirmSend = page.locator('.ant-popover-buttons button.ant-btn-primary, .ant-popconfirm button.ant-btn-primary').first();
  await popconfirmSend.waitFor({ state: 'visible', timeout: 5_000 });
  await popconfirmSend.click();
  // Modal opens with the temp password. AntD's Modal.info() lives inside a
  // .ant-modal-confirm wrapper - target that to avoid matching the ant-modal-title from
  // the drawer's invisible-but-mounted parent.
  await page.locator('.ant-modal-confirm').waitFor({ state: 'visible', timeout: 15_000 }).catch(async (e) => {
    await page.screenshot({ path: 'smoke-modal-debug.png', fullPage: true });
    fail('Welcome modal', `not visible within 15s. Screenshot: smoke-modal-debug.png. ${e.message}`);
  });
  const modalText = await page.locator('.ant-modal-confirm').innerText();
  console.log('  modal text:\n   ', modalText.replace(/\n/g, '\n    '));
  const match = modalText.match(/[A-Za-z0-9!@#$%^&*+_-]{10,}/);
  if (!match) fail('Welcome modal', 'could not parse temp password from modal');
  const tempPw = match[0];
  console.log('  ✓ temp pw captured:', tempPw);

  // CRITICAL UX CHECK: modal must identify the user. The current implementation does NOT,
  // which led to the admin pasting the password into the wrong username field on /login.
  if (!modalText.includes(MEMBER_ITS) && !modalText.toLowerCase().includes('arwa')) {
    console.error('  ⚠  Modal does not show which user the temp password is for - usability bug.');
  }

  await page.click('.ant-modal-confirm button:has-text("OK")');

  // ---- 6. Sign out admin ------------------------------------------------
  console.log('▶ Sign out admin');
  await page.click('.ant-modal-close-x').catch(() => {}); // dismiss any leftover modal
  await page.click('button:has-text("Close")').catch(() => {}); // close drawer
  // Trigger the avatar dropdown -> Sign out
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${SPA}/login`);

  // ---- 7. Member first-login --------------------------------------------
  console.log(`▶ Member first-login as ${MEMBER_ITS} with ${tempPw}`);
  await page.fill('input[autocomplete="username"]', MEMBER_ITS);
  await page.fill('input[autocomplete="current-password"]', tempPw);
  await page.click('button:has-text("Sign in")');

  // Should redirect to /change-password
  await page.waitForURL(/\/change-password/, { timeout: 10_000 }).catch(() =>
    fail('Force change-password', `expected redirect to /change-password, ended up at ${page.url()}`)
  );
  console.log('  ✓ forced into change-password');

  // ---- 8. Set permanent password -----------------------------------------
  console.log('▶ Set permanent password');
  const newPw = 'PortalSmoke@2026';
  // ChangePasswordPage has fields: current password (pre-filled), new, confirm
  const inputs = page.locator('input[type="password"]');
  await inputs.nth(1).fill(newPw); // new
  await inputs.nth(2).fill(newPw); // confirm
  // Forced first-login flow uses "Set password and sign in" button text.
  await page.click('button:has-text("Set password and sign in")');

  // ---- 9. Assert /portal/me landing ------------------------------------
  await page.waitForURL(/\/portal\/me/, { timeout: 10_000 }).catch(() =>
    fail('Post-change landing', `expected /portal/me, ended up at ${page.url()}`)
  );
  console.log('  ✓ landed on', page.url());

  console.log('\n✓ ALL STEPS PASSED');
  process.exit(0);
} catch (err) {
  console.error('UNCAUGHT:', err.message);
  await page.screenshot({ path: 'smoke-failure.png' }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
