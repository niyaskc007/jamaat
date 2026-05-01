import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// API base for the local dev backend (per .env.development). The repo's older auth helper points
// at 7024 (the original https port); this dev box runs on 5174 over http, so we log in directly.
const API_BASE = 'http://localhost:5174';
const ACCESS_KEY = 'jamaat.access';
const REFRESH_KEY = 'jamaat.refresh';
const USER_KEY = 'jamaat.user';

async function loginAsAdmin(page: Page, context: BrowserContext) {
  const res = await context.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: 'admin@jamaat.local', password: 'Admin@12345' },
  });
  if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  const user = {
    id: body.user.id, userName: body.user.userName, fullName: body.user.fullName,
    tenantId: body.user.tenantId, permissions: body.user.permissions ?? [],
    preferredLanguage: body.user.preferredLanguage,
  };
  await page.goto('/login');
  await page.evaluate(
    ({ access, refresh, userJson, ACCESS_KEY, REFRESH_KEY, USER_KEY }) => {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
      localStorage.setItem(USER_KEY, userJson);
    },
    { access: body.accessToken, refresh: body.refreshToken, userJson: JSON.stringify(user),
      ACCESS_KEY, REFRESH_KEY, USER_KEY },
  );
}

// 1x1 transparent PNG, base64 inlined so the test doesn't depend on filesystem fixtures.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  'base64',
);

test.describe('Event uploads + save smoke', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(page, context);
  });

  test('upload logo + cover via API directly, expect both URLs reachable', async ({ context }) => {
    // Pick the first event so the test isn't tied to a hard-coded ID.
    const token = (await context.storageState()).origins
      .flatMap((o) => o.localStorage)
      .find((kv) => kv.name === ACCESS_KEY)?.value
      ?? '';
    expect(token, 'auth token must be present').not.toBe('');

    const list = await context.request.get(`${API_BASE}/api/v1/events?pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.ok(), 'events list must succeed').toBeTruthy();
    const body = await list.json();
    test.skip(!body.items?.length, 'No events seeded');
    const eventId = body.items[0].id as string;

    // Asset upload (used by Logo/Hero/Speakers/Gallery/Sponsors/Share fields).
    const assetUp = await context.request.post(`${API_BASE}/api/v1/events/${eventId}/assets/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL_PNG } },
    });
    expect(assetUp.status(), 'asset upload should return 200').toBe(200);
    const asset = await assetUp.json();
    expect(asset.url).toMatch(/\/api\/v1\/events\/.+\/assets\/.+\/file$/);

    // Asset file should be retrievable anonymously.
    const assetFile = await context.request.get(`${API_BASE}${asset.url}`);
    expect(assetFile.status()).toBe(200);
    expect(assetFile.headers()['content-type']).toContain('image/');

    // Now ensure cover-upload doesn't wipe the logo / colors. Set them first via the branding endpoint.
    const setBranding = await context.request.put(`${API_BASE}/api/v1/events/${eventId}/branding`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { coverImageUrl: null, logoUrl: '/test/logo.png', primaryColor: '#0E5C40', accentColor: '#B45309' },
    });
    expect(setBranding.status()).toBe(200);

    const coverUp = await context.request.post(`${API_BASE}/api/v1/events/${eventId}/cover-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL_PNG } },
    });
    expect(coverUp.status()).toBe(200);

    // Read back: cover URL should be set, logo + colors should NOT be wiped.
    const after = await context.request.get(`${API_BASE}/api/v1/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(after.status()).toBe(200);
    const ev = await after.json();
    expect(ev.coverImageUrl, 'cover URL set after upload').toBeTruthy();
    expect(ev.logoUrl, 'logo URL preserved across cover upload').toBe('/test/logo.png');
    expect(ev.primaryColor, 'primary color preserved').toBe('#0E5C40');
    expect(ev.accentColor, 'accent color preserved').toBe('#B45309');
    expect(ev.categoryName, 'CategoryName resolved from EventCategory lookup').toBeTruthy();
  });

  test('event detail page loads and Save on the Overview tab returns success', async ({ page, context }) => {
    const token = (await context.storageState()).origins
      .flatMap((o) => o.localStorage)
      .find((kv) => kv.name === ACCESS_KEY)?.value
      ?? '';
    const list = await context.request.get(`${API_BASE}/api/v1/events?pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await list.json();
    test.skip(!body.items?.length, 'No events seeded');
    const eventId = body.items[0].id as string;

    const consoleErrors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await page.goto(`/events/${eventId}`);
    await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Branding/i })).toBeVisible();

    // Trigger Save - if my categoryName / map picker / TextArea / dropdown wiring regressed
    // anything, the network response would be a 4xx and we'd see a 'Save failed' toast.
    const respPromise = page.waitForResponse((r) =>
      r.url().includes(`/api/v1/events/${eventId}`) && r.request().method() === 'PUT', { timeout: 15_000 });
    await page.getByRole('button', { name: /Save changes/i }).click();
    const resp = await respPromise;
    expect(resp.status(), 'event update PUT should be 2xx').toBeLessThan(300);

    // No console errors leaked from my recent edits.
    expect(consoleErrors.filter((e) => !e.includes('favicon')), 'no console errors').toEqual([]);
  });

  // Regression for the user's reported "Something went wrong" crash that fired when clicking
  // away from the Overview tab. Root cause: the map's flyTo animation continued against a
  // 0x0 container after the tab switched display:none, throwing "Invalid LatLng (NaN, NaN)".
  test('clicking through Overview -> Branding -> Share -> Page designer never crashes', async ({ page, context }) => {
    const token = (await context.storageState()).origins
      .flatMap((o) => o.localStorage)
      .find((kv) => kv.name === ACCESS_KEY)?.value
      ?? '';
    const list = await context.request.get(`${API_BASE}/api/v1/events?pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await list.json();
    test.skip(!body.items?.length, 'No events seeded');
    const eventId = body.items[0].id as string;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(`/events/${eventId}`);
    // The error page renders this fallback when our root error boundary catches an exception.
    await expect(page.getByText('Something went wrong')).not.toBeVisible({ timeout: 5_000 });

    // End-anchored regexes: AntD prepends the icon name to the tab's accessible name
    // (e.g. "highlight Branding"), and we must avoid "Registration" matching "Registrations".
    const tabs = [/Branding$/i, /Share & SEO$/i, /Registration$/i, /Agenda$/i, /Page designer$/i, /Registrations$/i, /Overview$/i];
    for (const re of tabs) {
      await page.getByRole('tab', { name: re }).click();
      await page.waitForTimeout(400);
      await expect(page.getByText('Something went wrong')).not.toBeVisible({ timeout: 1_000 });
    }

    expect(pageErrors, 'no uncaught page errors').toEqual([]);
    const fatal = consoleErrors.filter((e) => /Invalid LatLng|NaN, NaN|Something went wrong/i.test(e));
    expect(fatal, 'no Leaflet NaN crash in console').toEqual([]);
  });

  // Regression for the user's reported "Image not reachable" red boxes on the Branding tab.
  // We upload via the actual API endpoints, then load the Branding tab in the BROWSER and
  // assert each <img> has a non-zero naturalWidth, i.e. the bytes actually came back through
  // the dev server (Vite proxy must be configured for this to work cross-port).
  test('Branding tab cover + logo images render in the browser (naturalWidth > 0)', async ({ page, context }) => {
    const token = (await context.storageState()).origins
      .flatMap((o) => o.localStorage)
      .find((kv) => kv.name === ACCESS_KEY)?.value
      ?? '';
    const list = await context.request.get(`${API_BASE}/api/v1/events?pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await list.json();
    test.skip(!body.items?.length, 'No events seeded');
    const eventId = body.items[0].id as string;

    // Upload a cover and an asset (logo) via the real API.
    const coverUp = await context.request.post(`${API_BASE}/api/v1/events/${eventId}/cover-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL_PNG } },
    });
    expect(coverUp.status()).toBe(200);
    const afterCover = await coverUp.json();
    expect(afterCover.coverImageUrl, 'cover URL set after upload').toBeTruthy();

    const assetUp = await context.request.post(`${API_BASE}/api/v1/events/${eventId}/assets/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL_PNG } },
    });
    const asset = await assetUp.json();

    // Wire that asset URL onto the event's logoUrl via the branding endpoint - PRESERVING the
    // cover URL we just set (UpdateBranding overwrites all four fields).
    const setBranding = await context.request.put(`${API_BASE}/api/v1/events/${eventId}/branding`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { coverImageUrl: afterCover.coverImageUrl, logoUrl: asset.url, primaryColor: '#0E5C40', accentColor: '#B45309' },
    });
    expect(setBranding.status()).toBe(200);

    // Now drive the actual UI: Branding tab must show both images loaded successfully.
    await page.goto(`/events/${eventId}`);
    await page.getByRole('tab', { name: /Branding$/i }).click();

    // Cover URL appears in two <img> tags: the page-header banner and the Branding tab preview.
    // Both must successfully load - if the Vite proxy isn't routing /api/* to the backend,
    // both will be broken.
    const coverImgs = page.locator('img[src*="/cover/file"]');
    await expect(coverImgs.first()).toBeVisible({ timeout: 5_000 });
    const coverCount = await coverImgs.count();
    expect(coverCount, 'at least one cover img on the page').toBeGreaterThan(0);
    for (let i = 0; i < coverCount; i++) {
      const ok = await coverImgs.nth(i).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
      expect(ok, `cover img #${i} must render (naturalWidth > 0)`).toBeTruthy();
    }

    // Logo URL appears in the ImageUploadField preview AND the Live Preview's <img alt="Logo">.
    // Both must render.
    const logoImgs = page.locator(`img[src*="${asset.url}"]`);
    await expect(logoImgs.first()).toBeVisible({ timeout: 5_000 });
    const logoCount = await logoImgs.count();
    expect(logoCount, 'at least one logo img on the page').toBeGreaterThan(0);
    for (let i = 0; i < logoCount; i++) {
      const ok = await logoImgs.nth(i).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
      expect(ok, `logo img #${i} must render (naturalWidth > 0)`).toBeTruthy();
    }

    // The "Image not reachable" red fallback must NOT be on the page.
    await expect(page.getByText(/Image not reachable/i)).toHaveCount(0);
    await expect(page.getByText(/Cover image not reachable/i)).toHaveCount(0);
  });

  // Regression: page designer's preview reads through the portal-preview query cache, not the
  // admin event cache. Saving the Agenda tab used to leave that cache stale, so an Agenda
  // section would keep showing "Agenda will be posted soon" even after the user added items.
  test('Agenda items added in the Agenda tab flow into the Page designer Agenda section preview', async ({ page, context }) => {
    const token = (await context.storageState()).origins
      .flatMap((o) => o.localStorage)
      .find((kv) => kv.name === ACCESS_KEY)?.value
      ?? '';

    // Use a fresh event so we don't fight whatever leftover sections / agenda exist on seeds.
    const slug = `agenda-cache-${Date.now()}`;
    const created = await context.request.post(`${API_BASE}/api/v1/events`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        slug, name: 'Agenda cache regression', category: 7,
        eventDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
        place: 'Test venue',
      },
    });
    expect(created.status()).toBe(201);
    const event = await created.json();
    const eventId = event.id as string;

    // 1) Add an agenda item via the API.
    const replaceAgenda = await context.request.put(`${API_BASE}/api/v1/events/${eventId}/agenda`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        items: [
          { title: 'Opening prayer', startTime: '09:00:00', endTime: '09:15:00', speaker: 'Imam', location: null, description: null },
          { title: 'Lecture', startTime: '09:30:00', endTime: '10:30:00', speaker: 'Guest speaker', location: null, description: 'Why we gather' },
        ],
      },
    });
    expect(replaceAgenda.status()).toBe(200);

    // 2) Add an Agenda page section (type=3) to the event.
    const addSection = await context.request.post(`${API_BASE}/api/v1/events/${eventId}/page/sections`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 3, contentJson: null, sortOrder: null },
    });
    expect(addSection.status()).toBeLessThan(300);

    // 3) Open the Page Designer in the browser.
    await page.goto(`/events/${eventId}`);
    await page.getByRole('tab', { name: /Page designer$/i }).click();

    // The preview pane should render the agenda items, not the empty-state fallback.
    await expect(page.getByText('Opening prayer')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Lecture')).toBeVisible();
    await expect(page.getByText(/Agenda will be posted soon/i)).toHaveCount(0);

    // Cleanup so the event list doesn't accumulate test fixtures.
    await context.request.delete(`${API_BASE}/api/v1/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  // Regression for the user's "I lost what I created when I clicked Save share settings" report.
  // We type values, click Save, reload, and assert each value is still in the form.
  test('Share & SEO tab: save persists title, description, share image', async ({ page, context }) => {
    const token = (await context.storageState()).origins
      .flatMap((o) => o.localStorage)
      .find((kv) => kv.name === ACCESS_KEY)?.value
      ?? '';
    const slug = `share-persist-${Date.now()}`;
    const created = await context.request.post(`${API_BASE}/api/v1/events`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        slug, name: 'Share persist test', category: 7,
        eventDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
      },
    });
    expect(created.status()).toBe(201);
    const eventId = (await created.json()).id as string;

    // Upload a share image via the API so we have a URL to plug into the form.
    const assetUp = await context.request.post(`${API_BASE}/api/v1/events/${eventId}/assets/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL_PNG } },
    });
    const asset = await assetUp.json();

    // Pre-set the share image via API so we can verify it survives the title/desc save.
    await context.request.put(`${API_BASE}/api/v1/events/${eventId}/share`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { shareTitle: null, shareDescription: null, shareImageUrl: asset.url },
    });

    await page.goto(`/events/${eventId}`);
    await page.getByRole('tab', { name: /Share & SEO$/i }).click();

    const shareTitle = 'My share title abc';
    const shareDesc = 'A short share description for testing';
    await page.getByLabel(/^Share title$/i).fill(shareTitle);
    await page.getByLabel(/^Share description$/i).fill(shareDesc);

    const respPromise = page.waitForResponse((r) =>
      r.url().includes(`/api/v1/events/${eventId}/share`) && r.request().method() === 'PUT', { timeout: 15_000 });
    await page.getByRole('button', { name: /^Save share settings$/ }).click();
    const resp = await respPromise;
    expect(resp.status()).toBeLessThan(300);

    // Reload from scratch - this is what the user does, and is where staleness would surface.
    await page.reload();
    await page.getByRole('tab', { name: /Share & SEO$/i }).click();

    await expect(page.getByLabel(/^Share title$/i)).toHaveValue(shareTitle);
    await expect(page.getByLabel(/^Share description$/i)).toHaveValue(shareDesc);

    // Read the event back via API to assert all three fields persisted server-side too.
    const after = await context.request.get(`${API_BASE}/api/v1/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ev = await after.json();
    expect(ev.shareTitle, 'title persisted').toBe(shareTitle);
    expect(ev.shareDescription, 'description persisted').toBe(shareDesc);
    expect(ev.shareImageUrl, 'pre-set share image was NOT wiped by the title/desc save').toBe(asset.url);

    await context.request.delete(`${API_BASE}/api/v1/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  // The Share & SEO tab grew a Share toolkit (QR + embed snippet). Verify the QR canvas is
  // actually rendered (canvas element with non-zero dimensions) and the embed snippet contains
  // the public URL so the user can paste it on a partner site.
  test('Share & SEO tab shows QR code + embed snippet for the public URL', async ({ page, context }) => {
    const token = (await context.storageState()).origins
      .flatMap((o) => o.localStorage)
      .find((kv) => kv.name === ACCESS_KEY)?.value
      ?? '';
    const slug = `share-toolkit-${Date.now()}`;
    const created = await context.request.post(`${API_BASE}/api/v1/events`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        slug, name: 'Share toolkit test', category: 7,
        eventDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
      },
    });
    expect(created.status()).toBe(201);
    const eventId = (await created.json()).id as string;

    await page.goto(`/events/${eventId}`);
    await page.getByRole('tab', { name: /Share & SEO$/i }).click();

    // QR canvas must be in the DOM and have a real bitmap.
    const qrCanvas = page.locator('#jm-share-qr canvas');
    await expect(qrCanvas).toBeVisible({ timeout: 5_000 });
    const qrSize = await qrCanvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));
    expect(qrSize.w).toBeGreaterThan(0);
    expect(qrSize.h).toBeGreaterThan(0);

    // Embed snippet must contain the slug and an iframe wrapper.
    const embedTextarea = page.locator('textarea[readonly]');
    await expect(embedTextarea).toBeVisible();
    const embedValue = await embedTextarea.inputValue();
    expect(embedValue).toContain('<iframe');
    expect(embedValue).toContain(`/portal/events/${slug}`);

    await context.request.delete(`${API_BASE}/api/v1/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
