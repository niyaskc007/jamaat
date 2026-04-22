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
    ns: ['common', 'auth', 'members', 'receipts', 'vouchers', 'reports', 'admin'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'jamaat.lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
