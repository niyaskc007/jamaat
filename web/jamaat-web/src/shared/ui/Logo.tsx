type Props = { size?: number; variant?: 'light' | 'dark'; withWord?: boolean };

/**
 * Jamaat mark — an 8-point star (traditional Islamic geometry, tastefully stylised)
 * with an inner dome curve. Pure SVG, no image dependency.
 */
export function Logo({ size = 32, variant = 'light', withWord = true }: Props) {
  const fg = variant === 'light' ? '#FFFFFF' : '#0B6E63';
  const accent = '#C9A34B';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
        <defs>
          <linearGradient id="jm-grad" x1="0" y1="0" x2="40" y2="40">
            <stop offset="0" stopColor={fg} />
            <stop offset="1" stopColor={accent} />
          </linearGradient>
        </defs>
        {/* 8-point star: two overlapping squares rotated 45° */}
        <g transform="translate(20 20)">
          <rect x="-14" y="-14" width="28" height="28" rx="3" fill="url(#jm-grad)" opacity="0.95" />
          <rect x="-14" y="-14" width="28" height="28" rx="3" fill="url(#jm-grad)" opacity="0.6" transform="rotate(45)" />
          {/* Inner dome */}
          <path d="M -7 6 Q -7 -5 0 -5 Q 7 -5 7 6 Z" fill={variant === 'light' ? '#0E1B26' : '#FFFFFF'} opacity="0.9" />
        </g>
      </svg>
      {withWord && (
        <span
          style={{
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
            fontWeight: 700,
            fontSize: size * 0.55,
            letterSpacing: '-0.02em',
            color: variant === 'light' ? '#FFFFFF' : '#0E1B26',
            lineHeight: 1,
          }}
        >
          Jamaat
        </span>
      )}
    </div>
  );
}
