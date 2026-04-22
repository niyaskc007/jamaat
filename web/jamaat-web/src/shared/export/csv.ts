/// Tiny client-side CSV export helper.
///
/// Why client-side: our list endpoints already paginate + filter, so pulling the filtered
/// result set and flattening to CSV is simpler than building parallel export endpoints for
/// every module. Cap at 5000 rows so operators don't accidentally DDoS the API — larger
/// exports should go through the Reports screen where the server renders asynchronously.

const ROW_CAP = 5000;
const PAGE_SIZE = 200;

type Pager<TItem, TQuery> = (query: TQuery & { page: number; pageSize: number }) => Promise<{ items: TItem[]; total: number }>;

/// Pull every page up to ROW_CAP and return the flat list.
export async function fetchAllPages<TItem, TQuery>(list: Pager<TItem, TQuery>, query: TQuery): Promise<{ items: TItem[]; truncated: boolean }> {
  const out: TItem[] = [];
  let page = 1;
  let truncated = false;
  for (;;) {
    const { items, total } = await list({ ...query, page, pageSize: PAGE_SIZE });
    out.push(...items);
    if (out.length >= ROW_CAP && out.length < total) {
      out.length = ROW_CAP;
      truncated = true;
      break;
    }
    if (out.length >= total || items.length === 0) break;
    page += 1;
  }
  return { items: out, truncated };
}

/// Escape a value for a CSV cell. Dates/numbers/bools stringify; null/undefined → empty.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  // Always quote — handles commas, quotes, newlines, and leading = (Excel formula-injection guard).
  const escaped = s.replace(/"/g, '""');
  const needsPrefixGuard = /^[=+\-@]/.test(s);
  return `"${needsPrefixGuard ? "'" : ''}${escaped}"`;
}

/// Turn row objects into a CSV string using the given column definitions.
export function toCsv<T>(rows: T[], columns: { header: string; value: (r: T) => unknown }[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(',')).join('\n');
  return `${header}\n${body}`;
}

/// Trigger a browser download for a CSV string.
export function downloadCsv(filename: string, csv: string) {
  // UTF-8 BOM so Excel opens Arabic/diacritics correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
