'use client';

import type { DayTrend } from './compute';

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Props {
  days: DayTrend[];
}

/** Small inline SVG line chart — on-time rate among check-ins per day, last 7 days. */
export function WeeklyTrendChart({ days }: Props) {
  const width = 320;
  const height = 120;
  const padX = 20;
  const plotW = width - padX * 2;
  const stepX = days.length > 1 ? plotW / (days.length - 1) : 0;

  const toY = (rate: number) => 20 + (100 - rate) * 0.7; // 0%→90, 100%→20

  const points = days.map((d, i) => ({ x: padX + i * stepX, y: toY(d.rate), ...d }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1]?.x.toFixed(1)},112 L${points[0]?.x.toFixed(1)},112 Z`;

  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const delta = today && yesterday ? today.rate - yesterday.rate : 0;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">{today?.rate ?? 0}%</span>
        {yesterday && (
          <span className={`text-xs font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% so với hôm qua
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="attOpsAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={0} y1={20} x2={width} y2={20} stroke="#F1F2F5" />
        <line x1={0} y1={55} x2={width} y2={55} stroke="#F1F2F5" />
        <line x1={0} y1={90} x2={width} y2={90} stroke="#F1F2F5" />

        <path d={areaPath} fill="url(#attOpsAreaFill)" />
        <path d={linePath} fill="none" stroke="#4F46E5" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <circle
            key={p.dateStr}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 4.5 : 3.5}
            fill={i === points.length - 1 ? '#4F46E5' : '#fff'}
            stroke="#4F46E5"
            strokeWidth={2.25}
          />
        ))}

        {points.map((p, i) => (
          <text
            key={`${p.dateStr}-lbl`}
            x={p.x}
            y={112}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={i === points.length - 1 ? 700 : 600}
            fill={i === points.length - 1 ? '#4338CA' : '#9AA1B2'}
          >
            {DOW_VI[p.dow]}
          </text>
        ))}
      </svg>
    </div>
  );
}
