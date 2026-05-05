import { useEffect, useMemo, useState } from 'react';
import { Select, Spin } from 'antd';
import { portalMeApi } from './portalMeApi';

/// Debounced typeahead picker for selecting another member as a guarantor (or any other
/// member-pointer field on the portal). The portal-side /portal/me/members/search endpoint
/// returns minimal fields (id, ITS, fullName) capped at 25 hits — no full member directory
/// scrape. Members can be searched by either name or ITS number.
export function MemberSearchSelect({
  value, onChange, placeholder, disabled, excludeId,
}: {
  value?: string | null;
  onChange?: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [options, setOptions] = useState<Array<{ value: string; label: string; its: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  // Debounce so we don't hammer the API on every keystroke. 250ms feels responsive without
  // emitting 4 requests for a 4-character prefix. Min 2 chars (matched by the API).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced || debounced.length < 2) { setOptions([]); return; }
    let cancelled = false;
    setLoading(true);
    portalMeApi.searchMembers(debounced)
      .then((rows) => {
        if (cancelled) return;
        setOptions(rows
          .filter((r) => r.id !== excludeId)
          .map((r) => ({
            value: r.id, its: r.itsNumber, name: r.fullName,
            label: `${r.fullName} · ${r.itsNumber}`,
          })));
      })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, excludeId]);

  // The currently-selected value may not appear in the search options (e.g. on edit + first
  // render). Inject a placeholder option so the Select can render the chosen label.
  const merged = useMemo(() => {
    if (!value || options.some((o) => o.value === value)) return options;
    return [{ value, label: '(selected)', its: '', name: '(selected)' }, ...options];
  }, [options, value]);

  return (
    <Select
      showSearch
      allowClear
      filterOption={false}
      value={value ?? undefined}
      onChange={(v) => onChange?.((v as string | null) ?? null)}
      onSearch={setQuery}
      notFoundContent={loading ? <Spin size="small" /> : (debounced.length < 2 ? 'Type 2+ chars (name or ITS)' : 'No matches')}
      placeholder={placeholder ?? 'Search by name or ITS'}
      disabled={disabled}
      options={merged}
      className="jm-full-width"
    />
  );
}
