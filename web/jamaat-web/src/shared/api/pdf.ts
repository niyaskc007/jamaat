import { api } from './client';

/**
 * Fetches a PDF from an authenticated endpoint and opens it in a new tab
 * via an object URL. This is necessary because `window.open(url)` does NOT
 * carry the JWT bearer header, so the API would reject it with 401.
 *
 * The returned promise resolves once the tab has been opened (or a download
 * triggered if the browser blocks the popup).
 */
export async function openAuthenticatedPdf(path: string, filename?: string): Promise<void> {
  const response = await api.get<Blob>(path, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);

  // Opening the blob URL in a new tab is what most browsers do best - they render
  // the PDF with their native viewer which has Print / Download buttons.
  const win = window.open(objectUrl, '_blank', 'noopener,noreferrer');

  if (!win) {
    // Popup blocked - fall back to a download.
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename ?? 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Free the object URL after a moment (the tab will have loaded its own copy).
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
