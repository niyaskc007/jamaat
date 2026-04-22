import { Dropdown, Button } from 'antd';
import { GlobalOutlined, CheckOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';

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
    disabled: l.code !== 'en', // Phase 1 — en only; others populate in Phase 2
  }));

  const color = variant === 'dark' ? '#CBD3DD' : 'var(--jm-gray-700)';

  return (
    <Dropdown
      menu={{ items, onClick: ({ key }) => void i18n.changeLanguage(key) }}
      placement="bottomRight"
      trigger={['click']}
    >
      <Button type="text" icon={<GlobalOutlined />} style={{ color }}>
        {LANGS.find((l) => active.startsWith(l.code))?.native ?? 'English'}
      </Button>
    </Dropdown>
  );
}
