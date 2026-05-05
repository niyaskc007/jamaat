import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import { env } from '../config/env';

export const supportedLanguages = ['en', 'ar', 'hi', 'ur'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const rtlLanguages: SupportedLanguage[] = ['ar', 'ur'];

export function isRtl(lang: string): boolean {
  return rtlLanguages.includes(lang as SupportedLanguage);
}

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: env.defaultLanguage,
    supportedLngs: [...supportedLanguages],
    // Phase 1: only 'en' is populated. Ar/Hi/Ur are reserved and will be filled in Phase 2.
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
    ns: ['common', 'auth', 'members', 'receipts', 'vouchers', 'reports', 'admin', 'portal'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'jamaat.lang',
      caches: ['localStorage'],
    },
  });

// Apply <html dir> based on the active language. Wired here (not at App mount) so the
// document direction stays in sync even when language changes mid-session via the
// LanguageSwitcher. Initial pass once i18n initialises; subsequent passes on each
// languageChanged event.
function applyDir(lang: string) {
  const dir = isRtl(lang) ? 'rtl' : 'ltr';
  if (typeof document !== 'undefined') {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }
}
i18n.on('initialized', () => applyDir(i18n.resolvedLanguage ?? 'en'));
i18n.on('languageChanged', (lng) => applyDir(lng));

export default i18n;
