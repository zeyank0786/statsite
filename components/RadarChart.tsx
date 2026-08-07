'use client';

import React from 'react';
import { useReveal } from './Reveal';

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
  // Before the guard below: hooks can't sit behind an early return.
  const { ref, revealed } = useReveal<SVGSVGElement>();

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

  // The polygon draws itself on entry. Each series waits for the one before it,
  // then its own fill and vertices follow the outline round.
  const TRACE_MS = 900;
  const seriesDelay = (si: number) => si * 180;
  const fillDelay = (si: number) => seriesDelay(si) + TRACE_MS * 0.45;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${size} ${size}`}
      className={`w-full h-auto ${className}`}
      style={{ overflow: 'visible' }}
      role="img"
      aria-label={`Radar chart: ${series.map((s) => s.label).join(' vs ')}`}
    >
      {/* rings + axes — the grid settles first, so the polygon has something
          to be drawn onto rather than appearing in empty space */}
      <g
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0.94)',
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transition: 'opacity 420ms ease-out, transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {[0.2, 0.4, 0.6, 0.8, 1].map((f) => (
          <path
            key={f}
            d={ringPath(f)}
            fill={f === 1 ? 'rgba(255,255,255,0.02)' : 'none'}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

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
      </g>

      {/* series polygons */}
      {series.map((s, si) => (
        <g key={si}>
          <path
            d={seriesPath(s.values)}
            fill={`${s.color}26`}
            stroke="none"
            style={{
              opacity: revealed ? 1 : 0,
              transition: `opacity 560ms ease-out ${fillDelay(si)}ms`,
            }}
          />
          {/* Stroke split off the fill so the outline can be dashed round
              while the fill simply fades. pathLength normalises the perimeter
              to 1, so the dash maths needs no getTotalLength() measurement. */}
          <path
            d={seriesPath(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={revealed ? 0 : 1}
            style={{
              transition: `stroke-dashoffset ${TRACE_MS}ms cubic-bezier(0.65, 0, 0.35, 1) ${seriesDelay(si)}ms`,
            }}
          />
          {s.values.map((v, i) => {
            const clamped = Math.max(0, Math.min(max, v ?? 0));
            const [x, y] = point(i, (radius * clamped) / max);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={3}
                fill={s.color}
                style={{
                  opacity: revealed ? 1 : 0,
                  transform: revealed ? 'scale(1)' : 'scale(0)',
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                  transition: `opacity 240ms ease-out ${fillDelay(si) + i * 70}ms, transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1) ${fillDelay(si) + i * 70}ms`,
                }}
              />
            );
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
            style={{
              opacity: revealed ? 1 : 0,
              transition: `opacity 420ms ease-out ${180 + i * 45}ms`,
            }}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
