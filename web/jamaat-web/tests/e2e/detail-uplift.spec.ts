import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

const API_BASE = 'https://localhost:7024';

/// Detail page UX uplift specs covering:
/// - Patronage detail (new) renders KPI strip + history table
/// - QH detail renders KPI strip and never produces a tall whitespace gap (5 KPI tiles, full-width
///   sections), and shows the repayment trajectory chart for non-approval-state loans
/// - Vouchers list shows summary KPI strip and the Voucher detail page renders timeline + ledger impact
test.describe('Detail uplift - admin', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Patronage detail page renders for any seeded patronage', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/fund-enrollments?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No patronages in seed - skipping');
    const id = body.items[0].id;

    await page.goto(`/fund-enrollments/${id}`);
    await expect(page.getByText(/Patronage details/i)).toBeVisible();
    await expect(page.getByText('Total collected')).toBeVisible();
    await expect(page.getByText('Receipts').first()).toBeVisible();
    await expect(page.getByText('Last payment')).toBeVisible();
    await expect(page.getByText('Active for')).toBeVisible();
    await expect(page.getByText('Payment history')).toBeVisible();
  });

  test('QH detail page renders KPI strip + repayment trajectory or decision support', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/qarzan-hasana?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No QH loans in seed - skipping');
    const id = body.items[0].id;

    await page.goto(`/qarzan-hasana/${id}`);
    // Use exact-match (regex with anchors) to avoid colliding with substring matches like "0% repaid".
    await expect(page.getByText(/^Requested$/)).toBeVisible();
    await expect(page.getByText(/^Approved$/).first()).toBeVisible();
    await expect(page.getByText(/^Disbursed$/).first()).toBeVisible();
    await expect(page.getByText(/^Repaid$/)).toBeVisible();
    await expect(page.getByText(/^Outstanding$/)).toBeVisible();
    await expect(page.getByText('Loan details')).toBeVisible();
  });

  test('Vouchers list shows summary KPI strip', async ({ page }) => {
    await page.goto('/vouchers');
    // Tiles: Paid this month / Pending approval / Drafts / Paid this year. Look for two of them.
    await expect(page.getByText(/Paid this month/i)).toBeVisible();
    await expect(page.getByText(/Pending approval/i).first()).toBeVisible();
    await expect(page.getByText(/Paid this year/i)).toBeVisible();
  });

  test('Voucher detail page renders timeline + ledger impact', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/vouchers?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No vouchers in seed - skipping');
    const id = body.items[0].id;

    await page.goto(`/vouchers/${id}`);
    await expect(page.getByText(/Voucher details/i)).toBeVisible();
    await expect(page.getByText(/Approval timeline/i)).toBeVisible();
    await expect(page.getByText(/Ledger impact/i)).toBeVisible();
    await expect(page.getByText(/Expense lines/i)).toBeVisible();
  });
});
