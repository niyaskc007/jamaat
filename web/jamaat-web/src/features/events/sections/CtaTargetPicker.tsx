import { Select, Input, Space } from 'antd';

type Props = {
  value?: string | null;
  onChange: (v: string) => void;
  /// 'register' is the page-level magic value that scrolls to the in-page Registration section.
  /// Hide it for buttons that don't sit on a page that has registration (e.g. sponsor link).
  includeRegister?: boolean;
  /// External-event registration page (`/events/{slug}/register` style) - useful for CTA blocks
  /// that sit on portals and want to deep-link to the registration form.
  eventSlug?: string;
};

type Option = { value: string; label: string; group: string };

/// Curated dropdown of valid CTA / button-target destinations. Authors pick from sensible
/// destinations (in-page register, common app routes, the event's portal register URL) instead
/// of typing a path and risking a typo. "Custom URL" reveals an Input for everything else.
export function CtaTargetPicker({ value, onChange, includeRegister = true, eventSlug }: Props) {
  const options = buildOptions(includeRegister, eventSlug);
  const isCustom = value !== undefined && value !== null && value !== '' && !options.some((o) => o.value === value);
  const selectValue = isCustom ? '__custom__' : (value || (includeRegister ? 'register' : ''));

  return (
    <Space direction="vertical" style={{ inlineSize: '100%' }}>
      <Select
        value={selectValue}
        style={{ inlineSize: '100%' }}
        onChange={(v) => {
          if (v === '__custom__') onChange('https://');
          else onChange(v);
        }}
        options={[
          ...groupOptions(options),
          { label: 'Other', options: [{ value: '__custom__', label: 'Custom URL…' }] },
        ]}
      />
      {isCustom && (
        <Input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/path"
        />
      )}
    </Space>
  );
}

function buildOptions(includeRegister: boolean, eventSlug?: string): Option[] {
  const list: Option[] = [];
  if (includeRegister) list.push({ value: 'register', label: 'Scroll to in-page Registration form', group: 'On this page' });
  if (eventSlug) list.push({ value: `/portal/events/${eventSlug}/register`, label: 'Public registration page', group: 'On this page' });

  list.push(
    { value: '/dashboard', label: 'Operations dashboard', group: 'App routes' },
    { value: '/dashboards', label: 'All dashboards', group: 'App routes' },
    { value: '/members', label: 'Members', group: 'App routes' },
    { value: '/families', label: 'Families', group: 'App routes' },
    { value: '/events', label: 'Events', group: 'App routes' },
    { value: '/commitments', label: 'Commitments', group: 'App routes' },
    { value: '/commitments/new', label: 'New commitment', group: 'App routes' },
    { value: '/fund-enrollments', label: 'Patronages', group: 'App routes' },
    { value: '/qarzan-hasana', label: 'Qarzan Hasana', group: 'App routes' },
    { value: '/receipts', label: 'Receipts', group: 'App routes' },
    { value: '/receipts/new', label: 'New receipt', group: 'App routes' },
    { value: '/vouchers', label: 'Vouchers', group: 'App routes' },
    { value: '/cheques', label: 'Cheques', group: 'App routes' },
    { value: '/accounting', label: 'Accounting', group: 'App routes' },
    { value: '/ledger', label: 'Ledger', group: 'App routes' },
    { value: '/reports', label: 'Reports', group: 'App routes' },
  );
  return list;
}

function groupOptions(options: Option[]): { label: string; options: { value: string; label: string }[] }[] {
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const o of options) {
    if (!groups.has(o.group)) groups.set(o.group, []);
    groups.get(o.group)!.push({ value: o.value, label: o.label });
  }
  return Array.from(groups.entries()).map(([label, opts]) => ({ label, options: opts }));
}
