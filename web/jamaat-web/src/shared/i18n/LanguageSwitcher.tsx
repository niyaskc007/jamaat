import { Dropdown, Button } from 'antd';
import { GlobalOutlined, CheckOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';
import { authStore } from '../auth/authStore';
import { portalMeApi } from '../../features/portal/me/portalMeApi';

const LANGS: { code: string; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
];

type Props = { variant?: 'dark' | 'light' };

export function LanguageSwitcher({ variant = 'light' }: Props) {
  const { i18n } = useTranslation();
  const active = i18n.resolvedLanguage ?? 'en';

  const items: MenuProps['items'] = LANGS.map((l) => ({
    key: l.code,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 160 }}>
        <span style={{ flex: 1 }}>
          {l.native} <span style={{ color: 'var(--jm-gray-500)' }}>· {l.label}</span>
        </span>
        {active.startsWith(l.code) && <CheckOutlined style={{ color: 'var(--jm-primary-500)' }} />}
      </div>
    ),
    // All four languages enabled (Phase D). Strings missing from a locale file fall back
    // to English at runtime via i18next. Translators top up keys incrementally.
  }));

  const color = variant === 'dark' ? '#CBD3DD' : 'var(--jm-gray-700)';

  // Persist server-side when signed in so the language follows the user across devices.
  // Anonymous (login screen) users get localStorage-only persistence via i18next-browser-
  // languagedetector. Server call is fire-and-forget; if the API rejects the value, the
  // local change still applies and the next refresh re-syncs from the JWT.
  const handleChange = async (key: string) => {
    await i18n.changeLanguage(key);
    if (authStore.getUser()) {
      try { await portalMeApi.setLanguage(key as 'en' | 'ar' | 'hi' | 'ur'); }
      catch { /* swallow - localStorage already updated */ }
    }
  };

  return (
    <Dropdown
      menu={{ items, onClick: ({ key }) => void handleChange(key) }}
      placement="bottomRight"
      trigger={['click']}
    >
      <Button type="text" icon={<GlobalOutlined />} style={{ color }}>
        {LANGS.find((l) => active.startsWith(l.code))?.native ?? 'English'}
      </Button>
    </Dropdown>
  );
}
