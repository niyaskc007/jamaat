// Default to empty baseURL so axios issues SAME-ORIGIN relative requests. In production the
// SPA is served from the API's wwwroot (single Kestrel process, single port), so relative
// paths like '/api/v1/auth/login' resolve against whatever URL the operator actually opened
// (e.g. http://corp-server:5174 or https://jamaat.example.com). Hard-coding a host here was
// a real bug: a SPA bundle built with apiBaseUrl='https://localhost:5001' would always try to
// POST there, regardless of what URL the user loaded the page from.
//
// Dev mode: vite.config.ts has a /api proxy targeting VITE_API_BASE_URL, so relative URLs
// work the same way in dev. The .env.development file sets VITE_API_BASE_URL for that.
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  defaultLanguage: import.meta.env.VITE_DEFAULT_LANGUAGE ?? 'en',
  // Portal URL prefix. Defaults to '/portal' so member URLs read /portal/me/*. Setting
  // this to '' makes the portal live at the site root - useful for a future subdomain
  // split where members.jamaat.com hosts ONLY the portal and the prefix is redundant.
  // The /m shortcut route always 302s to ${portalBase}/me regardless of this value.
  portalBase: import.meta.env.VITE_PORTAL_BASE ?? '/portal',
} as const;
