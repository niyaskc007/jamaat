export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:5001',
  defaultLanguage: import.meta.env.VITE_DEFAULT_LANGUAGE ?? 'en',
} as const;
