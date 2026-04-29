/**
 * Subtle 8-fold Islamic geometric tile as an SVG pattern. Used as decorative
 * background on the login split. Very low opacity - tasteful, not gimmicky.
 */
type Props = { opacity?: number; colour?: string };

export function IslamicPattern({ opacity = 0.08, colour = '#C9A34B' }: Props) {
  return (
    <svg
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <defs>
        <pattern id="jm-tile" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={colour} strokeWidth="1" opacity={opacity}>
            {/* 8-point star rosette */}
            <g transform="translate(40 40)">
              <polygon points="0,-24 6,-10 22,-10 10,0 16,16 0,8 -16,16 -10,0 -22,-10 -6,-10" />
              <polygon points="0,-18 4,-8 16,-8 8,0 12,12 0,6 -12,12 -8,0 -16,-8 -4,-8" transform="rotate(22.5)" />
              <circle r="3" />
            </g>
            {/* Corner quarters (tiled seamlessly) */}
            <g transform="translate(0 0)"><polygon points="0,-12 3,-5 12,-5 5,0 8,8 0,4 -8,8 -5,0 -12,-5 -3,-5" /></g>
            <g transform="translate(80 0)"><polygon points="0,-12 3,-5 12,-5 5,0 8,8 0,4 -8,8 -5,0 -12,-5 -3,-5" /></g>
            <g transform="translate(0 80)"><polygon points="0,-12 3,-5 12,-5 5,0 8,8 0,4 -8,8 -5,0 -12,-5 -3,-5" /></g>
            <g transform="translate(80 80)"><polygon points="0,-12 3,-5 12,-5 5,0 8,8 0,4 -8,8 -5,0 -12,-5 -3,-5" /></g>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#jm-tile)" />
    </svg>
  );
}
