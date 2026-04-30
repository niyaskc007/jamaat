import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

/// Phase 1 - Patronage Collect flow. Asserts the dropdown action exists and routes to
/// /receipts/new with the prefill query params populated. We don't actually create a receipt
/// in this spec - that has period/fund-type prerequisites that aren't worth setting up here.
test.describe('Patronage collect', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Patronages page renders', async ({ page }) => {
    await page.goto('/fund-enrollments');
    await expect(page.getByRole('heading', { name: /Patronages/i })).toBeVisible();
  });

  test('Collect action navigates to /receipts/new with prefill', async ({ page }) => {
    await page.goto('/fund-enrollments');

    // Find any row with status Active or Paused. If the seeded set has none, skip rather than fail -
    // this is a rendering test, not a data-completeness test.
    const activeRow = page.locator('table tbody tr', { has: page.locator('.ant-tag', { hasText: /^(Active|Paused)$/ }) }).first();
    const count = await activeRow.count();
    test.skip(count === 0, 'No Active/Paused patronages in seed - skipping action test');

    // Click the row's actions (more) button.
    await activeRow.locator('button[aria-label]').or(activeRow.getByRole('button')).last().click();
    // The Collect menu item appears in a popover.
    const collect = page.getByRole('menuitem', { name: /Collect/i });
    await expect(collect).toBeVisible();
    await collect.click();

    await expect(page).toHaveURL(/\/receipts\/new\?/);
    expect(page.url()).toContain('memberId=');
    expect(page.url()).toContain('fundTypeId=');
  });
});
