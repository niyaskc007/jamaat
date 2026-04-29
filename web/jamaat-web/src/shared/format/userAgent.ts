/// Turn a raw User-Agent header string into a short human-readable label like
/// "Chrome 142 on Windows 11" or "Safari on iPhone". Best-effort heuristics - the goal is
/// readability for an admin glancing at audit info, not exhaustive UA parsing. Falls back
/// to the raw string if nothing matches; the caller should also expose the raw value via
/// a tooltip so power users can still see the full UA.
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  if (!browser && !os) return ua;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? ua;
}

function detectBrowser(ua: string): string | null {
  // Order matters: Edge UA contains "Chrome", Opera contains "Chrome", etc.
  const edge = ua.match(/Edg\/(\d+)/);
  if (edge) return `Edge ${edge[1]}`;
  const opera = ua.match(/OPR\/(\d+)/);
  if (opera) return `Opera ${opera[1]}`;
  const firefox = ua.match(/Firefox\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  // Safari ships its version in Version/X, not Safari/X.
  const safari = ua.match(/Version\/(\d+).*Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return null;
}

function detectOs(ua: string): string | null {
  if (/Windows NT 10\.0.*?(Win64|x64)/i.test(ua)) return 'Windows 10/11';
  if (/Windows NT 10\.0/i.test(ua)) return 'Windows 10';
  if (/Windows NT 6\.3/i.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.2/i.test(ua)) return 'Windows 8';
  if (/Windows NT 6\.1/i.test(ua)) return 'Windows 7';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android (\d+)/i.test(ua)) {
    const m = ua.match(/Android (\d+)/i);
    return `Android ${m?.[1] ?? ''}`.trim();
  }
  if (/Mac OS X (\d+[._]\d+)/i.test(ua)) {
    const m = ua.match(/Mac OS X (\d+)[._](\d+)/i);
    return m ? `macOS ${m[1]}.${m[2]}` : 'macOS';
  }
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}
