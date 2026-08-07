'use client';

import React, { useId } from 'react';
import { useReveal } from './Reveal';

interface SparklineProps {
  data: number[];
  /** hex color */
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
}

export default function Sparkline({
  data,
  color = '#22d3ee',
  width = 120,
  height = 36,
  strokeWidth = 2,
  fill = true,
  className = '',
}: SparklineProps) {
  const gradId = useId();
  const { ref, revealed } = useReveal<SVGSVGElement>();

  if (!data || data.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={className} width={width} height={height}>
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={strokeWidth}
          strokeDasharray="3 4"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = strokeWidth + 1;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;

  // Trace the line left to right on entry, then let the area and the head
  // dot catch up — the dot lands where the line just stopped.
  const TRACE_MS = 820;

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} className={className} width={width} height={height}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={area}
            fill={`url(#${gradId})`}
            style={{
              opacity: revealed ? 1 : 0,
              transition: `opacity 620ms ease-out ${TRACE_MS * 0.35}ms`,
            }}
          />
        </>
      )}
      {/* pathLength=1 normalises the line's length, so one dash covers it
          whatever the data or the chart's size. */}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={revealed ? 0 : 1}
        style={{ transition: `stroke-dashoffset ${TRACE_MS}ms cubic-bezier(0.33, 0.9, 0.35, 1)` }}
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r={strokeWidth + 0.5}
        fill={color}
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0)',
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transition: `opacity 200ms ease-out ${TRACE_MS * 0.85}ms, transform 340ms cubic-bezier(0.34, 1.56, 0.64, 1) ${TRACE_MS * 0.85}ms`,
        }}
      />
    </svg>
  );
}
