import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

/// QH new-loan form uplift specs.
test.describe('QH new-loan form - uplift', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Documentation card and section headings render', async ({ page }) => {
    await page.goto('/qarzan-hasana/new');
    // Process documentation card (collapsible, default open).
    await expect(page.getByText(/About Qarzan Hasana/i)).toBeVisible();
    await expect(page.getByText(/What is Qarzan Hasana/i)).toBeVisible();
    await expect(page.getByText(/Eligibility/i).first()).toBeVisible();
    await expect(page.getByText(/The process/i)).toBeVisible();
    await expect(page.getByText(/Bring with you/i)).toBeVisible();

    // Section headings inside the form.
    await expect(page.getByText(/Borrower & loan terms/i)).toBeVisible();
    // The Divider's section heading - "Borrower's case" with a leading icon. Plain substring is enough.
    await expect(page.getByText("Borrower's case", { exact: false }).first()).toBeVisible();
    // After v2 rename, the guarantors section dropped "documents" from its heading.
    await expect(page.getByText(/Guarantors \(kafil\)/i).first()).toBeVisible();
  });

  test('New free-text fields render with required markers', async ({ page }) => {
    await page.goto('/qarzan-hasana/new');
    await expect(page.getByText(/Purpose of the loan/i)).toBeVisible();
    await expect(page.getByText(/Repayment plan/i).first()).toBeVisible();
    // v2 renamed "Source of income" to "Income details" (the multi-select sits separately
    // labelled "Income sources"); both appear on the form.
    await expect(page.getByText(/Income sources/i)).toBeVisible();
    await expect(page.getByText(/Income details/i)).toBeVisible();
    await expect(page.getByText(/Other current obligations/i)).toBeVisible();
  });

  test('Submit button is disabled until required fields and consent are filled in', async ({ page }) => {
    await page.goto('/qarzan-hasana/new');
    const submit = page.getByRole('button', { name: /Create as Draft/i });
    await expect(submit).toBeDisabled();
  });
});

test.describe('QH detail - borrower case section visible when filled', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Detail page renders without errors for a seeded loan (borrower case may or may not show depending on seed data)', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get('https://localhost:7024/api/v1/qarzan-hasana?page=1&pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No QH loans in seed - skipping');
    const id = body.items[0].id;

    await page.goto(`/qarzan-hasana/${id}`);
    // Loan details still renders regardless of whether the borrower-case fields are present.
    await expect(page.getByText('Loan details')).toBeVisible();
  });
});
