import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

type LookupRow = {
  id: string; category: string; code: string; name: string; nameArabic?: string | null;
  sortOrder: number; isActive: boolean;
};

export type EventCategoryEntry = { id: string; code: number; name: string; isActive: boolean; sortOrder: number };

/// Fetches the EventCategory lookup rows once and shares the cache across every page that needs
/// to label, filter, or pick an event's category. The numeric `code` is what gets stored on the
/// event row (historically the EventCategory enum int) - admins can extend the list by adding a
/// new lookup with the next available numeric code on the Lookups master-data tab.
export function useEventCategories() {
  return useQuery({
    queryKey: ['lookups', 'EventCategory'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EventCategoryEntry[]> => {
      const r = await api.get('/api/v1/lookups', { params: { category: 'EventCategory', pageSize: 500 } });
      const items = (r.data?.items ?? []) as LookupRow[];
      return items
        .map((l) => ({ id: l.id, code: Number.parseInt(l.code, 10), name: l.name, isActive: l.isActive, sortOrder: l.sortOrder }))
        .filter((x) => Number.isFinite(x.code))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code - b.code);
    },
  });
}

/// Convenience helper: turn the fetched list into a code→name map. Falls back to `Category {code}`
/// when an event references a code that's no longer in the lookup table.
export function categoryLabelOf(entries: EventCategoryEntry[] | undefined, code: number | null | undefined): string {
  if (code == null) return '-';
  const hit = entries?.find((e) => e.code === code);
  return hit?.name ?? `Category ${code}`;
}
