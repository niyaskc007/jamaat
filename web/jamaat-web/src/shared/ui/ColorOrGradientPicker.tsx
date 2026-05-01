import { useState, useEffect } from 'react';
import { ColorPicker, Tabs, Slider, Space, Input } from 'antd';
import type { Color } from 'antd/es/color-picker';

type Props = {
  value?: string | null;
  onChange: (value: string | null) => void;
  /// 'solid' = only the solid-color tab (used for text colour, accent etc.)
  /// 'full'  = tabs across solid + gradient + raw CSS (used for backgrounds).
  mode?: 'solid' | 'full';
  presets?: string[];
};

const DEFAULT_PRESETS = [
  '#0E5C40', '#0B6E63', '#B45309', '#D97706', '#7C3AED', '#0E7490',
  '#DC2626', '#0F172A', '#475569', '#94A3B8', '#FFFFFF', '#F8FAFC',
];

/// A unified picker for any field that wants a CSS colour or a CSS gradient. Replaces
/// `<Input type="color">` and free-form colour text fields across the app. Callers receive
/// either a `#RRGGBB` string, a `linear-gradient(...)` string, or whatever raw CSS the user
/// pasted into the "Custom" tab.
export function ColorOrGradientPicker({ value, onChange, mode = 'full', presets = DEFAULT_PRESETS }: Props) {
  const initialTab = pickInitialTab(value, mode);
  const [tab, setTab] = useState<string>(initialTab);

  if (mode === 'solid') {
    return (
      <ColorPicker
        value={value || '#000000'}
        onChange={(c: Color) => onChange(c.toHexString().toUpperCase())}
        presets={[{ label: 'Suggested', colors: presets }]}
        showText
      />
    );
  }

  return (
    <Tabs
      size="small"
      activeKey={tab}
      onChange={setTab}
      items={[
        {
          key: 'solid',
          label: 'Solid',
          children: (
            <ColorPicker
              value={isGradient(value) ? '#0E5C40' : (value || '#0E5C40')}
              onChange={(c: Color) => onChange(c.toHexString().toUpperCase())}
              presets={[{ label: 'Suggested', colors: presets }]}
              showText
            />
          ),
        },
        {
          key: 'gradient',
          label: 'Gradient',
          children: <GradientBuilder value={value ?? undefined} onChange={onChange} />,
        },
        {
          key: 'custom',
          label: 'Custom CSS',
          children: (
            <Input
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value || null)}
              placeholder="e.g. rgba(0,0,0,0.5) or radial-gradient(...)"
            />
          ),
        },
      ]}
    />
  );
}

function pickInitialTab(value: string | null | undefined, mode: 'solid' | 'full'): string {
  if (mode === 'solid') return 'solid';
  if (!value) return 'solid';
  if (isGradient(value)) return 'gradient';
  if (value.startsWith('#') || /^rgb/.test(value)) return 'solid';
  return 'custom';
}

function isGradient(v: string | null | undefined): v is string {
  return !!v && /gradient\s*\(/i.test(v);
}

// ---- Gradient builder ------------------------------------------------------

function GradientBuilder({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const parsed = parseLinearGradient(value);
  const [angle, setAngle] = useState<number>(parsed.angle);
  const [stop1, setStop1] = useState<string>(parsed.stops[0] ?? '#0E5C40');
  const [stop2, setStop2] = useState<string>(parsed.stops[1] ?? '#B45309');

  // When the parent value changes, re-sync local state (e.g. preset switched the gradient).
  useEffect(() => {
    const p = parseLinearGradient(value);
    setAngle(p.angle);
    setStop1(p.stops[0] ?? '#0E5C40');
    setStop2(p.stops[1] ?? '#B45309');
  }, [value]);

  const emit = (a: number, c1: string, c2: string) => {
    onChange(`linear-gradient(${a}deg, ${c1}, ${c2})`);
  };

  return (
    <Space direction="vertical" style={{ inlineSize: '100%' }}>
      <div style={{
        blockSize: 56, borderRadius: 8,
        background: `linear-gradient(${angle}deg, ${stop1}, ${stop2})`,
        border: '1px solid var(--jm-border)',
      }} />
      <Space>
        <span style={{ fontSize: 12, color: 'var(--jm-gray-500)', minInlineSize: 50 }}>Stop 1</span>
        <ColorPicker value={stop1}
          onChange={(c: Color) => { const v = c.toHexString().toUpperCase(); setStop1(v); emit(angle, v, stop2); }}
          showText />
      </Space>
      <Space>
        <span style={{ fontSize: 12, color: 'var(--jm-gray-500)', minInlineSize: 50 }}>Stop 2</span>
        <ColorPicker value={stop2}
          onChange={(c: Color) => { const v = c.toHexString().toUpperCase(); setStop2(v); emit(angle, stop1, v); }}
          showText />
      </Space>
      <div>
        <div style={{ fontSize: 12, color: 'var(--jm-gray-500)', marginBlockEnd: 4 }}>Angle: {angle}°</div>
        <Slider min={0} max={360} value={angle} onChange={(v) => { setAngle(v); emit(v, stop1, stop2); }} />
      </div>
    </Space>
  );
}

function parseLinearGradient(v: string | null | undefined): { angle: number; stops: string[] } {
  if (!v) return { angle: 135, stops: [] };
  // linear-gradient(135deg, #FF0000, #00FF00)
  const m = /linear-gradient\(\s*([\d.]+)deg\s*,\s*([^)]+)\)/i.exec(v);
  if (!m) return { angle: 135, stops: [] };
  const angle = Math.round(parseFloat(m[1]) || 135);
  const stops = m[2].split(/\s*,\s*/).map((s) => {
    // Strip any percent stops like "#FF0000 50%"
    return s.split(/\s+/)[0].trim();
  }).filter(Boolean);
  return { angle, stops };
}
