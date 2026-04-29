import type { ReactNode } from 'react';
import { Card } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { compactMoney } from '../format/format';

type Props = {
  icon: ReactNode;
  label: string;
  value: number | null | undefined;
  format?: 'money' | 'number';
  deltaPercent?: number | null;
  sparkline?: number[];
  accent?: string; // hex for icon chip bg
};

export function KpiCard({ icon, label, value, format = 'money', deltaPercent, sparkline, accent = 'var(--jm-primary-500)' }: Props) {
  const hasData = value !== null && value !== undefined;
  const formatted = !hasData ? '-' : format === 'money' ? compactMoney(value) : new Intl.NumberFormat('en-IN').format(value);

  const deltaColor =
    deltaPercent === null || deltaPercent === undefined
      ? 'var(--jm-gray-400)'
      : deltaPercent >= 0
        ? 'var(--jm-success)'
        : 'var(--jm-danger)';

  return (
    <Card
      size="small"
      styles={{
        body: { padding: 20 },
      }}
      style={{
        boxShadow: 'var(--jm-shadow-1)',
        border: '1px solid var(--jm-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: `color-mix(in srgb, ${accent} 12%, transparent)`,
            color: accent,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--jm-gray-500)', fontWeight: 500, marginBlockEnd: 4 }}>{label}</div>
          <div
            className="jm-tnum"
            style={{
              fontFamily: "'Inter Tight', 'Inter', sans-serif",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: hasData ? 'var(--jm-gray-900)' : 'var(--jm-gray-400)',
              lineHeight: 1.1,
              marginBlockEnd: 6,
            }}
          >
            {formatted}
          </div>
          {deltaPercent !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: deltaColor }}>
              {deltaPercent !== null && deltaPercent >= 0 && <ArrowUpOutlined style={{ fontSize: 10 }} />}
              {deltaPercent !== null && deltaPercent < 0 && <ArrowDownOutlined style={{ fontSize: 10 }} />}
              <span style={{ fontWeight: 500 }}>
                {deltaPercent === null ? 'No data yet' : `${Math.abs(deltaPercent).toFixed(1)}% vs yesterday`}
              </span>
            </div>
          )}
        </div>
        {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} colour={accent} />}
      </div>
    </Card>
  );
}

function Sparkline({ data, colour }: { data: number[]; colour: string }) {
  const w = 72, h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const path = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(h - ((v - min) / range) * h).toFixed(2)}`)
    .join(' ');
  return (
    <svg width={w} height={h} aria-hidden style={{ flexShrink: 0 }}>
      <path d={path} fill="none" stroke={colour} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
