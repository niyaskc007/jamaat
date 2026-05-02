import { useMemo } from 'react';
import { Card, Space, Select, DatePicker, Segmented, Button, Tooltip, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../shared/api/client';

/// Filter contract used by every dashboard that wants user-controlled scope.
export type DashboardFilters = {
  /// ISO date (yyyy-MM-dd) or null when the dashboard doesn't filter by date.
  from: string | null;
  to: string | null;
  fundTypeId: string | null;
  sectorId: string | null;
};

export const emptyFilters: DashboardFilters = { from: null, to: null, fundTypeId: null, sectorId: null };

type Props = {
  value: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  /// Which controls to render. Time range is shown by default.
  showTimeRange?: boolean;
  showFundFilter?: boolean;
  showSectorFilter?: boolean;
  /// Default preset shown in the segmented control when no custom range is set.
  defaultPreset?: '7d' | '30d' | '90d' | '6m' | '12m' | 'ytd';
};

const PRESETS: { key: NonNullable<Props['defaultPreset']>; label: string; days: number }[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '6m', label: '6m', days: 183 },
  { key: '12m', label: '12m', days: 365 },
  { key: 'ytd', label: 'YTD', days: -1 },
];

/// Compute the `from` ISO date for a preset relative to today.
function presetFromDate(preset: NonNullable<Props['defaultPreset']>): string {
  const today = dayjs().startOf('day');
  if (preset === 'ytd') return today.startOf('year').format('YYYY-MM-DD');
  const def = PRESETS.find((p) => p.key === preset)!;
  return today.subtract(def.days - 1, 'day').format('YYYY-MM-DD');
}

function detectActivePreset(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const today = dayjs().startOf('day').format('YYYY-MM-DD');
  if (to !== today) return null;
  for (const p of PRESETS) {
    if (presetFromDate(p.key) === from) return p.key;
  }
  return null;
}

export function DashboardFilterBar({
  value, onChange,
  showTimeRange = true, showFundFilter = false, showSectorFilter = false,
  defaultPreset = '90d',
}: Props) {
  const fundsQ = useQuery({
    queryKey: ['lookups', 'fund-types-active'],
    queryFn: async () => {
      // The lookup endpoint returns a paginated envelope `{ items: [...] }` rather than a bare
      // array, so unwrap defensively. If the shape ever changes back to an array, the fallback
      // returns it as-is.
      const r = await api.get<{ items: { id: string; code: string; nameEnglish: string; isActive: boolean }[] }
        | { id: string; code: string; nameEnglish: string; isActive: boolean }[]>('/api/v1/fund-types');
      const data = r.data as { items?: unknown };
      return (Array.isArray(r.data) ? r.data : (Array.isArray(data.items) ? data.items : [])) as { id: string; code: string; nameEnglish: string; isActive: boolean }[];
    },
    enabled: showFundFilter,
    staleTime: 5 * 60_000,
  });
  const sectorsQ = useQuery({
    queryKey: ['lookups', 'sectors-active'],
    queryFn: async () => {
      const r = await api.get<{ items: { id: string; code: string; name: string; isActive: boolean }[] }
        | { id: string; code: string; name: string; isActive: boolean }[]>('/api/v1/sectors');
      const data = r.data as { items?: unknown };
      return (Array.isArray(r.data) ? r.data : (Array.isArray(data.items) ? data.items : [])) as { id: string; code: string; name: string; isActive: boolean }[];
    },
    enabled: showSectorFilter,
    staleTime: 5 * 60_000,
  });

  const activePreset = useMemo(() => detectActivePreset(value.from, value.to), [value.from, value.to]);
  const isCustom = !!(value.from || value.to) && !activePreset;

  const setPreset = (key: string) => {
    if (key === 'custom') {
      // When user explicitly switches to "Custom" we leave whatever range was there;
      // if there's nothing, seed with the current preset.
      if (!value.from || !value.to) {
        onChange({ ...value, from: presetFromDate(defaultPreset), to: dayjs().format('YYYY-MM-DD') });
      }
      return;
    }
    const preset = key as NonNullable<Props['defaultPreset']>;
    onChange({ ...value, from: presetFromDate(preset), to: dayjs().format('YYYY-MM-DD') });
  };

  const onRangeChange = (range: [Dayjs | null, Dayjs | null] | null) => {
    if (!range || !range[0] || !range[1]) {
      onChange({ ...value, from: null, to: null });
      return;
    }
    onChange({ ...value, from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') });
  };

  const reset = () => onChange(emptyFilters);
  const hasAnyFilter = !!(value.from || value.to || value.fundTypeId || value.sectorId);

  // Selected segmented value: preset key, "custom" when a custom range is active, or '' when nothing
  const segValue = activePreset ?? (isCustom ? 'custom' : '');

  return (
    <Card size="small" className="jm-card" styles={{ body: { padding: 12 } }}>
      <Space wrap size={[12, 8]} style={{ width: '100%' }}>
        {showTimeRange && (
          <>
            <Segmented
              size="small"
              value={segValue}
              onChange={(v) => setPreset(String(v))}
              options={[
                ...PRESETS.map((p) => ({ label: p.label, value: p.key })),
                { label: 'Custom', value: 'custom' },
              ]}
            />
            {(isCustom || activePreset == null) && (value.from || value.to) && (
              <DatePicker.RangePicker
                size="small"
                value={value.from && value.to ? [dayjs(value.from), dayjs(value.to)] : null}
                onChange={(r) => onRangeChange(r as [Dayjs | null, Dayjs | null] | null)}
                allowClear
              />
            )}
          </>
        )}

        {showFundFilter && (
          <Select
            size="small"
            placeholder="All funds"
            value={value.fundTypeId ?? undefined}
            onChange={(v) => onChange({ ...value, fundTypeId: v ?? null })}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minInlineSize: 200 }}
            loading={fundsQ.isLoading}
            options={(fundsQ.data ?? [])
              .filter((f) => f.isActive)
              .map((f) => ({ value: f.id, label: `${f.code} · ${f.nameEnglish}` }))}
          />
        )}

        {showSectorFilter && (
          <Select
            size="small"
            placeholder="All sectors"
            value={value.sectorId ?? undefined}
            onChange={(v) => onChange({ ...value, sectorId: v ?? null })}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minInlineSize: 200 }}
            loading={sectorsQ.isLoading}
            options={(sectorsQ.data ?? [])
              .filter((s) => s.isActive)
              .map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
          />
        )}

        {hasAnyFilter && (
          <Tooltip title="Clear all filters">
            <Button size="small" icon={<ReloadOutlined />} onClick={reset}>Reset</Button>
          </Tooltip>
        )}

        {value.from && value.to && (
          <Tag style={{ marginInlineStart: 'auto' }} className="jm-tnum">
            {dayjs(value.from).format('DD MMM YYYY')} → {dayjs(value.to).format('DD MMM YYYY')}
          </Tag>
        )}
      </Space>
    </Card>
  );
}

/// URL-synced filter state. Encodes filters as ?from=&to=&fund=&sector= so the page
/// is shareable. Reads the URL once on mount; pushes back via setSearchParams.
export function useDashboardFilters(defaults?: Partial<DashboardFilters>): [DashboardFilters, (next: DashboardFilters) => void] {
  const [params, setParams] = useSearchParams();
  const filters: DashboardFilters = {
    from: params.get('from') ?? defaults?.from ?? null,
    to: params.get('to') ?? defaults?.to ?? null,
    fundTypeId: params.get('fund') ?? defaults?.fundTypeId ?? null,
    sectorId: params.get('sector') ?? defaults?.sectorId ?? null,
  };
  const setFilters = (next: DashboardFilters) => {
    const out = new URLSearchParams(params);
    if (next.from) out.set('from', next.from); else out.delete('from');
    if (next.to) out.set('to', next.to); else out.delete('to');
    if (next.fundTypeId) out.set('fund', next.fundTypeId); else out.delete('fund');
    if (next.sectorId) out.set('sector', next.sectorId); else out.delete('sector');
    setParams(out, { replace: true });
  };
  return [filters, setFilters];
}

/// Helper: convert filters to API params object. Returns only set keys so the URL
/// stays clean when defaults are in effect.
export function filtersToApiParams(f: DashboardFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.fundTypeId) out.fundTypeId = f.fundTypeId;
  if (f.sectorId) out.sectorId = f.sectorId;
  return out;
}

/// Convert a time-range filter to a "months" approximation for endpoints that take int months.
/// Falls back to `defaultMonths` when the filter has no range.
export function filtersToMonths(f: DashboardFilters, defaultMonths: number): number {
  if (!f.from || !f.to) return defaultMonths;
  const months = dayjs(f.to).diff(dayjs(f.from), 'month') + 1;
  return Math.max(1, Math.min(36, months));
}

/// Convert a time-range filter to a "days" approximation for endpoints that take int days.
/// Falls back to `defaultDays` when the filter has no range.
export function filtersToDays(f: DashboardFilters, defaultDays: number): number {
  if (!f.from || !f.to) return defaultDays;
  const days = dayjs(f.to).diff(dayjs(f.from), 'day') + 1;
  return Math.max(1, Math.min(365, days));
}

/// Download an XLSX from the given endpoint and trigger a browser save. Uses axios
/// (via the `api` client) so the bearer token + tenant headers are attached automatically.
/// Mirrors the helper in features/reports — duplicated here to keep dashboards self-contained.
export async function downloadDashboardXlsx(
  path: string,
  params: Record<string, string | number | null | undefined>,
  filename: string,
): Promise<void> {
  // Strip nullish params so the URL stays clean.
  const cleanParams: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') cleanParams[k] = v;
  }
  const { data } = await api.get<Blob>(path, { params: cleanParams, responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
