import { api } from '../api/client';

/// Fetch a server-rendered XLSX (or any binary) and trigger a browser download.
/// Uses axios so the JWT auth header rides along automatically — that's why we
/// can't just use a raw <a download> link.
export async function downloadServerXlsx(
  path: string,
  params: Record<string, unknown>,
  filename: string,
): Promise<void> {
  const { data } = await api.get<Blob>(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
