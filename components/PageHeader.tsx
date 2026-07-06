import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
  eyebrowColor?: string;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  eyebrowColor = 'var(--accent-cyan)',
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-rise">
      <div>
        {eyebrow && (
          <p
            className="text-xs font-bold uppercase tracking-[0.18em] mb-2"
            style={{ color: eyebrowColor }}
          >
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm md:text-base" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
