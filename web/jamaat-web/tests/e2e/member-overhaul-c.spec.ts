import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

const API_BASE = 'https://localhost:7024';

test.describe('Member overhaul Phase C - family read-only, change requests, wealth', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Family tab on member profile is read-only with link to families', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const r = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');

    await page.goto(`/members/${body.items[0].id}`);
    await page.getByRole('tab', { name: /Family/i }).click();
    // Phase E informational alert that family edits live in /families.
    await expect(page.getByText(/Family information is managed in the Families page/i)).toBeVisible();
    await expect(page.getByText(/Linked relatives/i)).toBeVisible();
  });

  test('Admin Change Requests page renders for an admin (queue is empty by default)', async ({ page }) => {
    await page.goto('/admin/change-requests');
    await expect(page.getByRole('heading', { name: /Member change requests/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Pending/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Approved/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Rejected/i })).toBeVisible();
  });

  test('Wealth tab is visible for admin and renders the assets table', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const r = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');

    await page.goto(`/members/${body.items[0].id}`);
    // Wealth tab gated by member.wealth.view; admin has it via the all-permissions reconcile.
    await page.getByRole('tab', { name: /Wealth/i }).click();
    await expect(page.getByText(/Self-declared wealth/i)).toBeVisible();
    await expect(page.getByText(/Declared total/i)).toBeVisible();
  });

  test('Pending count endpoint returns a number', async ({ context, page }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const r = await context.request.get(`${API_BASE}/api/v1/admin/member-change-requests/pending-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body).toHaveProperty('count');
    expect(typeof body.count).toBe('number');
  });
});
