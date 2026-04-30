import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

const API_BASE = 'https://localhost:7024';

test.describe('QH form v2 - structured fields + uploads + eligibility', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('New-loan form renders structured cashflow + gold + income source sections', async ({ page }) => {
    await page.goto('/qarzan-hasana/new');
    // Documentation card stays.
    await expect(page.getByText(/About Qarzan Hasana/i)).toBeVisible();
    // New section headings.
    await expect(page.getByText(/Monthly cashflow/i)).toBeVisible();
    await expect(page.getByText(/Gold collateral/i)).toBeVisible();
    await expect(page.getByText(/Guarantors \(kafil\)/i).first()).toBeVisible();
    // Income sources multi-select label.
    await expect(page.getByText(/Income sources/i)).toBeVisible();
    // Cashflow numeric labels.
    await expect(page.getByText(/Monthly income/i).first()).toBeVisible();
    await expect(page.getByText(/Monthly expenses/i).first()).toBeVisible();
    await expect(page.getByText(/Other monthly EMIs/i)).toBeVisible();
    await expect(page.getByText(/Net monthly surplus/i)).toBeVisible();
  });

  test('Eligibility check endpoint returns a result', async ({ context, page }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const ms = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await ms.json();
    test.skip(!body.items || body.items.length < 2, 'Need at least two members in seed');
    const [borrower, guarantor] = body.items;

    const res = await context.request.get(
      `${API_BASE}/api/v1/qarzan-hasana/check-guarantor/${guarantor.id}?borrowerId=${borrower.id}`,
      { headers: { Authorization: `Bearer ${token}` } });
    expect(res.ok()).toBeTruthy();
    const elig = await res.json();
    expect(elig).toHaveProperty('eligible');
    expect(elig).toHaveProperty('checks');
    expect(Array.isArray(elig.checks)).toBeTruthy();
    // At minimum, the not_self / status_active / no_active_default checks should be present.
    const keys = elig.checks.map((c: { key: string }) => c.key);
    expect(keys).toContain('not_self');
    expect(keys).toContain('status_active');
    expect(keys).toContain('no_active_default');
  });

  test('Public consent portal returns 404 for an unknown token', async ({ context }) => {
    // Anonymous request - no auth header. Must still resolve to a clean 404, not auth-fail.
    const res = await context.request.get(`${API_BASE}/api/v1/portal/qh-consent/this-token-does-not-exist`);
    expect(res.status()).toBe(404);
  });
});
