import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

const API_BASE = 'https://localhost:7024';

test.describe('Member profile overhaul - Phase A + B', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Members table row click navigates to profile', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');
    const memberId = body.items[0].id;

    await page.goto('/members');
    // Click somewhere in the row that's not a button / dropdown - any cell text works.
    await page.locator(`tr[data-row-key="${memberId}"]`).click({ position: { x: 100, y: 12 } });
    await expect(page).toHaveURL(new RegExp(`/members/${memberId}$`));
  });

  test('Profile contact tab includes social profile fields', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');
    const memberId = body.items[0].id;

    await page.goto(`/members/${memberId}`);
    await page.getByRole('tab', { name: /Contact/i }).click();
    await expect(page.getByText(/Social profiles & web/i)).toBeVisible();
    await expect(page.getByLabel(/LinkedIn/i)).toBeVisible();
    await expect(page.getByLabel(/Facebook/i)).toBeVisible();
  });

  test('Profile religious tab includes Hajj + Umrah section', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');
    const memberId = body.items[0].id;

    await page.goto(`/members/${memberId}`);
    await page.getByRole('tab', { name: /Religious/i }).click();
    await expect(page.getByText(/Hajj & Umrah/i)).toBeVisible();
    await expect(page.getByLabel(/Hajj status/i)).toBeVisible();
  });

  test('Address tab includes property detail fields', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');
    const memberId = body.items[0].id;

    await page.goto(`/members/${memberId}`);
    await page.getByRole('tab', { name: /Address/i }).click();
    await expect(page.getByText(/Property details/i)).toBeVisible();
    await expect(page.getByLabel(/Bedrooms/i)).toBeVisible();
    await expect(page.getByLabel(/Bathrooms/i)).toBeVisible();
    await expect(page.getByLabel(/Built-up area/i)).toBeVisible();
  });

  test('Education tab includes multi-row education history panel', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const resp = await context.request.get(`${API_BASE}/api/v1/members?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json();
    test.skip(!body.items?.length, 'No members in seed - skipping');
    const memberId = body.items[0].id;

    await page.goto(`/members/${memberId}`);
    await page.getByRole('tab', { name: /Education/i }).click();
    await expect(page.getByText(/Education history/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Add education/i })).toBeVisible();
  });
});
