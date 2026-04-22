import dayjs from 'dayjs';

/** Format amount with tabular figures + currency. Default AED. */
export function money(amount: number | null | undefined, currency = 'AED', locale?: string): string {
  if (amount === null || amount === undefined) return '—';
  const loc = locale ?? (currency === 'INR' ? 'en-IN' : currency === 'AED' ? 'en-AE' : 'en');
  const decimals = currency === 'KWD' || currency === 'BHD' || currency === 'OMR' ? 3 : 2;
  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(decimals)}`;
  }
}

/** Compact money for dense tiles (AED 12.4k, AED 1.2M) */
export function compactMoney(amount: number | null | undefined, currency = 'AED', locale?: string): string {
  if (amount === null || amount === undefined) return '—';
  const loc = locale ?? (currency === 'INR' ? 'en-IN' : 'en-AE');
  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatDate(d: string | Date | null | undefined, pattern = 'DD MMM YYYY'): string {
  if (!d) return '—';
  return dayjs(d).format(pattern);
}

export function formatDateTime(d: string | Date | null | undefined, pattern = 'DD MMM YYYY, HH:mm'): string {
  if (!d) return '—';
  return dayjs(d).format(pattern);
}

export function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const diff = dayjs(d).diff(dayjs(), 'minute');
  const abs = Math.abs(diff);
  const suffix = diff < 0 ? 'ago' : 'from now';
  if (abs < 1) return 'just now';
  if (abs < 60) return `${abs}m ${suffix}`;
  if (abs < 60 * 24) return `${Math.floor(abs / 60)}h ${suffix}`;
  return `${Math.floor(abs / (60 * 24))}d ${suffix}`;
}
