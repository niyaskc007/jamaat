import { api } from '../../shared/api/client';

// Wire format mirrors the C# enum CmsPageSection (Legal=0, Help=1, Marketing=2). The API
// has no global JsonStringEnumConverter so this stays numeric end-to-end.
export const CmsPageSection = { Legal: 0, Help: 1, Marketing: 2 } as const;
export type CmsPageSection = 0 | 1 | 2;

export const sectionLabel = (s: CmsPageSection): 'Legal' | 'Help' | 'Marketing' =>
  s === 0 ? 'Legal' : s === 1 ? 'Help' : 'Marketing';

export type CmsPage = {
  id: string;
  slug: string;
  title: string;
  body: string;
  section: CmsPageSection;
  isPublished: boolean;
  createdAtUtc: string;
  updatedAtUtc: string | null;
};

export type CmsPageListItem = {
  id: string;
  slug: string;
  title: string;
  section: CmsPageSection;
  isPublished: boolean;
  updatedAtUtc: string | null;
};

export type CmsBlock = { key: string; value: string };

export type CreateCmsPageDto = {
  slug: string;
  title: string;
  body: string;
  section: CmsPageSection;
  isPublished?: boolean;
};

export type UpdateCmsPageDto = {
  title: string;
  body: string;
  section: CmsPageSection;
  isPublished: boolean;
};

// The C# enum is serialised as a string by default thanks to JsonStringEnumConverter; the
// list endpoint reflects that. But CreateCmsPageDto/UpdateCmsPageDto are deserialised, and
// integer values match the enum index. We send strings; ASP.NET tolerates both.

export const cmsApi = {
  // Public reads
  listPages: () => api.get<CmsPageListItem[]>('/api/v1/cms/pages').then((r) => r.data),
  getPageBySlug: (slug: string) => api.get<CmsPage>(`/api/v1/cms/pages/${encodeURIComponent(slug)}`).then((r) => r.data),
  listBlocks: (prefix?: string) =>
    api.get<CmsBlock[]>('/api/v1/cms/blocks', { params: prefix ? { prefix } : undefined }).then((r) => r.data),
  getBlock: (key: string) => api.get<CmsBlock>(`/api/v1/cms/blocks/${encodeURIComponent(key)}`).then((r) => r.data),

  // Admin (cms.manage)
  adminListPages: () => api.get<CmsPageListItem[]>('/api/v1/cms/admin/pages').then((r) => r.data),
  adminGetPage: (id: string) => api.get<CmsPage>(`/api/v1/cms/admin/pages/${id}`).then((r) => r.data),
  createPage: (dto: CreateCmsPageDto) => api.post<CmsPage>('/api/v1/cms/admin/pages', dto).then((r) => r.data),
  updatePage: (id: string, dto: UpdateCmsPageDto) =>
    api.put<CmsPage>(`/api/v1/cms/admin/pages/${id}`, dto).then((r) => r.data),
  deletePage: (id: string) => api.delete(`/api/v1/cms/admin/pages/${id}`).then(() => undefined),
  adminListBlocks: (prefix?: string) =>
    api.get<CmsBlock[]>('/api/v1/cms/admin/blocks', { params: prefix ? { prefix } : undefined }).then((r) => r.data),
  upsertBlock: (key: string, value: string) =>
    api.put<CmsBlock>(`/api/v1/cms/admin/blocks/${encodeURIComponent(key)}`, { value }).then((r) => r.data),
  deleteBlock: (key: string) =>
    api.delete(`/api/v1/cms/admin/blocks/${encodeURIComponent(key)}`).then(() => undefined),
};

/// Hook helper: fetch all login.* blocks once, return a map keyed by the block name.
/// Falls back to `null` while loading; pages should render their static defaults until
/// the response arrives. Errors swallow to null too - the login screen MUST render even
/// if the CMS endpoint is down.
export async function fetchLoginBlocks(): Promise<Record<string, string>> {
  try {
    const blocks = await cmsApi.listBlocks('login.');
    const map: Record<string, string> = {};
    for (const b of blocks) map[b.key] = b.value;
    return map;
  } catch {
    return {};
  }
}

export async function fetchFooterBlocks(): Promise<Record<string, string>> {
  try {
    const blocks = await cmsApi.listBlocks('footer.');
    const map: Record<string, string> = {};
    for (const b of blocks) map[b.key] = b.value;
    return map;
  } catch {
    return {};
  }
}
