import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

/// Phase 0 verification - the four shipped landing pages all render
/// when an authenticated admin opens them. The user reported "the dashboards are
/// not there"; this test answers definitively whether the BI panel is rendering
/// or whether something is broken.
test.describe('Landings render for admin', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Dashboard shows BI strip with obligation tiles + trend chart', async ({ page }) => {
    await page.goto('/dashboard');
    // BI obligation tiles
    await expect(page.getByText('QH loans outstanding')).toBeVisible();
    await expect(page.getByText('Returnable owed')).toBeVisible();
    await expect(page.getByText('Pending commitments')).toBeVisible();
    await expect(page.getByText('Cheques in pipeline')).toBeVisible();
    // 30-day collection trend card
    await expect(page.getByText('Collections - last 30 days')).toBeVisible();
    // Fund-share donut + cheque pipeline cards
    await expect(page.getByText('Fund share - last 30 days')).toBeVisible();
    await expect(page.getByText('Cheque pipeline')).toBeVisible();
  });

  test('Reports landing renders card grid', async ({ page }) => {
    await page.goto('/reports');
    // Default landing - groups should be present (at least one group title)
    await expect(page.locator('body')).toContainText(/Daily ops|Fund analytics|Receivables/i);
  });

  test('Accounting landing renders KPIs', async ({ page }) => {
    await page.goto('/accounting');
    await expect(page.getByRole('heading', { name: /^Accounting$/ })).toBeVisible();
    await expect(page.getByText('Assets').first()).toBeVisible();
    await expect(page.getByText('Liabilities').first()).toBeVisible();
    await expect(page.getByText(/Net.*income/i).first()).toBeVisible();
  });

  test('Administration landing renders tool grid', async ({ page }) => {
    await page.goto('/admin');
    // The page header is "Administration"
    await expect(page.getByRole('heading', { name: /Administration/i })).toBeVisible();
  });
});
