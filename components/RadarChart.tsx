'use client';

import React from 'react';

export interface RadarSeries {
  label: string;
  /** hex color, e.g. "#22d3ee" */
  color: string;
  /** one value (0..max) per axis, same order as labels */
  values: number[];
}

interface RadarChartProps {
  /** axis labels, canonical category order */
  labels: string[];
  /** optional per-axis label colors */
  labelColors?: string[];
  series: RadarSeries[];
  max?: number;
  size?: number;
  className?: string;
}

export default function RadarChart({
  labels,
  labelColors,
  series,
  max = 10,
  size = 320,
  className = '',
}: RadarChartProps) {
  const n = labels.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 42; // room for labels

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const point = (i: number, r: number): [number, number] => [
    cx + r * Math.cos(angle(i)),
    cy + r * Math.sin(angle(i)),
  ];

  const ringPath = (frac: number) =>
    labels
      .map((_, i) => {
        const [x, y] = point(i, radius * frac);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z';

  const seriesPath = (values: number[]) =>
    labels
      .map((_, i) => {
        const v = Math.max(0, Math.min(max, values[i] ?? 0));
        const [x, y] = point(i, (radius * v) / max);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z';

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={`w-full h-auto ${className}`}
      style={{ overflow: 'visible' }}
      role="img"
      aria-label={`Radar chart: ${series.map((s) => s.label).join(' vs ')}`}
    >
      {/* rings */}
      {[0.2, 0.4, 0.6, 0.8, 1].map((f) => (
        <path
          key={f}
          d={ringPath(f)}
          fill={f === 1 ? 'rgba(255,255,255,0.02)' : 'none'}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}

      {/* axes */}
      {labels.map((_, i) => {
        const [x, y] = point(i, radius);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
        );
      })}

      {/* series polygons */}
      {series.map((s, si) => (
        <g key={si}>
          <path
            d={seriesPath(s.values)}
            fill={`${s.color}26`}
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {s.values.map((v, i) => {
            const clamped = Math.max(0, Math.min(max, v ?? 0));
            const [x, y] = point(i, (radius * clamped) / max);
            return <circle key={i} cx={x} cy={y} r={3} fill={s.color} />;
          })}
        </g>
      ))}

      {/* labels */}
      {labels.map((label, i) => {
        const [x, y] = point(i, radius + 22);
        const anchor =
          Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
        return (
          <text
            key={i}
            x={x}
            y={y + 4}
            textAnchor={anchor}
            fontSize={12}
            fontWeight={700}
            fill={labelColors?.[i] || 'rgba(255,255,255,0.6)'}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
