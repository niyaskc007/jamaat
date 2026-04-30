import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

/// Reliability profile + admin dashboard end-to-end. We don't have control over the seeded
/// member set, so we navigate from /members (which we know renders) and click into the first
/// member, then assert the Reliability tab is reachable and the score card renders.
test.describe('Reliability profile', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Member profile - Reliability tab renders for admin', async ({ page, context }) => {
    // Hit the API directly to grab any member id - more reliable than scraping the table.
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get('https://localhost:7024/api/v1/members?page=1&pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');
    const memberId = body.items[0].id;

    await page.goto(`/members/${memberId}`);

    // The Reliability tab is added at the end of the tabs strip; click it.
    const relTab = page.getByRole('tab', { name: /Reliability/ });
    await relTab.waitFor({ state: 'visible', timeout: 10_000 });
    await relTab.click();

    // The Advisory banner is the headline of this tab and the surest test that we landed.
    await expect(page.getByText(/Advisory only/i)).toBeVisible();
    await expect(page.getByText(/Reliability profile/i).first()).toBeVisible();
  });

  test('Admin reliability dashboard renders with distribution chart', async ({ page }) => {
    await page.goto('/admin/reliability');
    await expect(page.getByRole('heading', { name: /Reliability dashboard/i })).toBeVisible();
    await expect(page.getByText(/Grade distribution/i)).toBeVisible();
    await expect(page.getByText(/Top reliable members/i)).toBeVisible();
    await expect(page.getByText(/Needs attention/i)).toBeVisible();
  });
});
