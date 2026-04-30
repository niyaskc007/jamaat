import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

const API_BASE = 'https://localhost:7024';

/// Family-membership invariant tests. Backend rejections are the source of truth -
/// the UI filtering is a usability layer on top. We test the API directly so the spec
/// catches real regressions even if a future UI change drops the filter.
test.describe('Family member invariants', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('Cannot add the family head as a non-head member', async ({ context, page }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    // Find a family with a head set.
    const fams = await context.request.get(`${API_BASE}/api/v1/families?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await fams.json();
    const family = (body.items ?? []).find((f: { headMemberId: string | null }) => !!f.headMemberId);
    test.skip(!family, 'No family with a head in seed - skipping');

    // Attempt to add the head with role=Other (99). The backend should reject.
    const res = await context.request.post(`${API_BASE}/api/v1/families/${family.id}/members`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { memberId: family.headMemberId, role: 99 },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    const err = await res.json();
    // Either family.head_already_member or family.member_already_assigned (if head is also
    // already in the family at role=Head). Both are correct rejections.
    expect((err.title || err.detail || '').toLowerCase()).toMatch(/head|already|assigned/);
  });

  test('Cannot transfer headship to the current head (no-op rejection)', async ({ context, page }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const fams = await context.request.get(`${API_BASE}/api/v1/families?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await fams.json();
    const family = (body.items ?? []).find((f: { headMemberId: string | null }) => !!f.headMemberId);
    test.skip(!family, 'No family with a head in seed - skipping');

    const res = await context.request.post(`${API_BASE}/api/v1/families/${family.id}/transfer-headship`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { newHeadMemberId: family.headMemberId },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    const err = await res.json();
    expect((err.title || err.detail || '').toLowerCase()).toMatch(/head|unchanged|already/);
  });

  test('AddMember dialog renders with exclusion hint copy', async ({ page, context }) => {
    const token = await page.evaluate(() => localStorage.getItem('jamaat.access'));
    const fams = await context.request.get(`${API_BASE}/api/v1/families?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await fams.json();
    test.skip(!body.items?.length, 'No families in seed - skipping');

    await page.goto('/families');
    // First non-measurement row (AntD prefixes a hidden aria-hidden=true measure row).
    await page.locator('tr[data-row-key]').first().click({ position: { x: 100, y: 12 } });
    await expect(page.getByRole('button', { name: /Add member/i })).toBeVisible();
    await page.getByRole('button', { name: /Add member/i }).click();
    await expect(page.getByText(/The head and current members of this family are filtered out/i)).toBeVisible();
  });
});
