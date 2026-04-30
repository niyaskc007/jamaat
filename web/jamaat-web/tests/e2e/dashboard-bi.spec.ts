import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

/// Phase 7 dashboard BI additions: top contributors / voucher outflow / upcoming cheques.
/// These tiles always render headers + (data OR Empty), so we assert the headers exist
/// regardless of whether the seed has the underlying data. That keeps the test stable.
test.describe('Dashboard BI - Phase 7', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Top contributors tile renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/Top contributors/i)).toBeVisible();
  });

  test('Voucher outflow tile renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/Voucher outflow/i)).toBeVisible();
  });

  test('Upcoming cheques tile renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/Cheques due in next 30 days/i)).toBeVisible();
  });
});

test.describe('Accounting page enrichment - Phase 6', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Income vs Expense + asset composition + top expenses render', async ({ page }) => {
    await page.goto('/accounting');
    await expect(page.getByText(/Income vs Expense/i)).toBeVisible();
    await expect(page.getByText(/Top expense categories/i)).toBeVisible();
    await expect(page.getByText(/Asset composition/i)).toBeVisible();
  });
});
