import type { Page, BrowserContext } from '@playwright/test';

const API_BASE = 'https://localhost:7024';
const ACCESS_KEY = 'jamaat.access';
const REFRESH_KEY = 'jamaat.refresh';
const USER_KEY = 'jamaat.user';

/// Logs into the API directly and seeds the resulting session into the page's
/// localStorage so the SPA's auth bootstrap finds them on next navigation. Avoids
/// driving the LoginPage UI in every test (faster + isolated from login form changes).
export async function loginAsAdmin(page: Page, context: BrowserContext) {
  const res = await context.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: 'admin@jamaat.local', password: 'Admin@12345' },
  });
  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  // Need to be on the same origin before writing localStorage.
  await page.goto('/login');
  // Map UserInfo (from API) to the AuthUser the SPA expects in localStorage.
  const user = {
    id: body.user.id,
    userName: body.user.userName,
    fullName: body.user.fullName,
    tenantId: body.user.tenantId,
    permissions: body.user.permissions ?? [],
    preferredLanguage: body.user.preferredLanguage,
  };
  await page.evaluate(
    ({ access, refresh, userJson, ACCESS_KEY, REFRESH_KEY, USER_KEY }) => {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
      localStorage.setItem(USER_KEY, userJson);
    },
    {
      access: body.accessToken,
      refresh: body.refreshToken,
      userJson: JSON.stringify(user),
      ACCESS_KEY,
      REFRESH_KEY,
      USER_KEY,
    },
  );
}
