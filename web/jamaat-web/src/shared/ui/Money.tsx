import { money } from '../format/format';

type Props = { value: number | null | undefined; currency?: string; muted?: boolean; size?: 'sm' | 'md' | 'lg' };

export function Money({ value, currency = 'INR', muted, size = 'md' }: Props) {
  const sizeMap = { sm: 13, md: 15, lg: 22 };
  return (
    <span
      className="jm-tnum"
      style={{
        fontFeatureSettings: "'tnum'",
        fontVariantNumeric: 'tabular-nums',
        fontWeight: size === 'lg' ? 600 : 500,
        fontSize: sizeMap[size],
        color: muted ? 'var(--jm-gray-500)' : 'var(--jm-gray-900)',
      }}
    >
      {money(value, currency)}
    </span>
  );
}
