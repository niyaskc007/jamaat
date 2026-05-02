import { GlobalOutlined } from '@ant-design/icons';
import * as Flags from 'country-flag-icons/react/3x2';

/// Renders a country flag as an inline SVG. Works on every OS (Windows ships no flag-emoji
/// font, so the unicode regional-indicator pairs render as bare letters there - we use
/// SVGs instead so the flag is identical on Windows, macOS, iOS, Android).
///
/// Resolution: caller passes EITHER a country name (e.g. "United Arab Emirates") OR a
/// 2-letter ISO-3166 code. Names are mapped to codes via the table below; unknowns fall
/// back to a globe icon.
export function CountryFlag({
  country, code, size = 14, rounded = true, title,
}: {
  country?: string | null;
  code?: string | null;
  size?: number;
  rounded?: boolean;
  title?: string;
}) {
  const iso = (code ?? countryToIso(country))?.toUpperCase();
  const Component = iso ? (Flags as Record<string, React.ComponentType<{ title?: string; style?: React.CSSProperties }>>)[iso] : undefined;
  const aspect = 1.5; // 3:2
  const width = Math.round(size * aspect);
  // Inline style here is intentional - width/height are dynamic based on the `size` prop.
  // The visual chrome (border-radius, ring) is moved into .jm-country-flag in portal.css so
  // a token swap propagates automatically.
  const style: React.CSSProperties = { inlineSize: width, blockSize: size };
  if (Component) {
    return (
      <Component
        title={title ?? country ?? iso ?? ''}
        className={`jm-country-flag ${rounded ? 'jm-country-flag--rounded' : ''}`}
        style={style}
      />
    );
  }
  return (
    <GlobalOutlined
      className="jm-country-flag-fallback"
      style={{ fontSize: size }}
      title={title ?? country ?? 'Unknown country'}
    />
  );
}

/// Country-name → ISO-3166-alpha-2 lookup. Covers the regions Jamaat members typically
/// connect from. Unknown names fall back to a globe icon, so adding a new market only
/// matters for the visual touch — functionality is unaffected.
function countryToIso(name?: string | null): string | undefined {
  if (!name) return undefined;
  const map: Record<string, string> = {
    'United Arab Emirates': 'AE',
    'India': 'IN',
    'Pakistan': 'PK',
    'Saudi Arabia': 'SA',
    'United States': 'US',
    'United Kingdom': 'GB',
    'Canada': 'CA',
    'Australia': 'AU',
    'Bahrain': 'BH',
    'Kuwait': 'KW',
    'Qatar': 'QA',
    'Oman': 'OM',
    'Egypt': 'EG',
    'Jordan': 'JO',
    'Lebanon': 'LB',
    'Morocco': 'MA',
    'Tunisia': 'TN',
    'Turkey': 'TR',
    'Iran': 'IR',
    'Iraq': 'IQ',
    'Syria': 'SY',
    'Yemen': 'YE',
    'Sudan': 'SD',
    'Tanzania': 'TZ',
    'Kenya': 'KE',
    'Uganda': 'UG',
    'Singapore': 'SG',
    'Malaysia': 'MY',
    'Indonesia': 'ID',
    'Bangladesh': 'BD',
    'Sri Lanka': 'LK',
    'Germany': 'DE',
    'France': 'FR',
    'Italy': 'IT',
    'Spain': 'ES',
    'Netherlands': 'NL',
    'Belgium': 'BE',
    'Switzerland': 'CH',
    'Norway': 'NO',
    'Sweden': 'SE',
    'Finland': 'FI',
    'Denmark': 'DK',
    'Ireland': 'IE',
    'Russia': 'RU',
    'China': 'CN',
    'Japan': 'JP',
    'South Korea': 'KR',
    'Korea, Republic of': 'KR',
    'Hong Kong': 'HK',
    'Taiwan': 'TW',
    'Thailand': 'TH',
    'Vietnam': 'VN',
    'Philippines': 'PH',
    'New Zealand': 'NZ',
    'South Africa': 'ZA',
    'Brazil': 'BR',
    'Mexico': 'MX',
    'Argentina': 'AR',
  };
  return map[name];
}
