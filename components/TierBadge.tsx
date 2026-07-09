import { getStatTier } from '@/lib/categories';

/**
 * Small tier chip for an individual stat total — every stat display should
 * carry one so the ladder (Starting Out → … → Legendary) is always visible.
 */
export default function TierBadge({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}) {
  const tier = getStatTier(value);
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${className}`}
      style={{ background: `${tier.hex}1f`, color: tier.hex }}
      title={`${tier.name} (${tier.min}–${tier.max} pts)`}
    >
      {tier.name}
    </span>
  );
}
