import { Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDesignations } from '@/hooks/useDesignations';
import { getTierBadgeLabel, getTierBadgeClass, TIER_ORDER } from '@/lib/constants';
import type { Designation } from '@/types';

// Tiers that qualify a guest as "special" for dept-head/transport/driver views
const SPECIAL_TIERS = new Set<string>(['1(a)', '1(b)', '2']);

/**
 * Returns true if any of the guest's designation names map to a special tier
 * (1(a), 1(b), or 2) in the given designations list.
 */
export function isSpecialGuest(
  designation: string | string[] | null | undefined,
  allDesignations: Designation[],
): boolean {
  if (!designation) return false;
  const names = Array.isArray(designation) ? designation : [designation];
  if (names.length === 0) return false;
  const tierMap = new Map(allDesignations.map(d => [d.name, d.tier]));
  return names.some(name => {
    const tier = tierMap.get(name);
    return tier != null && SPECIAL_TIERS.has(tier);
  });
}

/** Returns the highest (most important) tier among a guest's designations. */
function getHighestTier(
  names: string[],
  allDesignations: Designation[],
): string | null | undefined {
  const tierMap = new Map(allDesignations.map(d => [d.name, d.tier]));
  let best: string | null | undefined = null;
  let bestIdx = Infinity;
  for (const name of names) {
    const tier = tierMap.get(name);
    if (tier == null) continue;
    const idx = TIER_ORDER.indexOf(tier as typeof TIER_ORDER[number]);
    if (idx !== -1 && idx < bestIdx) {
      bestIdx = idx;
      best = tier;
    }
  }
  return best;
}

interface DesignationDisplayProps {
  designation?: string | string[] | null;
  /** Extra Tailwind classes on the outer element */
  className?: string;
}

/**
 * Role-aware designation display:
 * - super-admin / desk-in-charge → name + tier badge (full info)
 * - coordinator → name only, no badge
 * - department-head / transport / location-manager / driver → ⭐ if tier 1-2, else name only
 */
export default function DesignationDisplay({ designation, className = '' }: DesignationDisplayProps) {
  const { user } = useAuth();
  const { activeDesignations } = useDesignations();

  if (!designation) return <span className={`text-gray-300 ${className}`}>—</span>;
  const names = Array.isArray(designation) ? designation : [designation];
  if (names.length === 0) return <span className={`text-gray-300 ${className}`}>—</span>;

  const role = user?.role ?? 'viewer';
  const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];

  // ── super-admin / desk-in-charge: full tier badge ─────────────────────────
  if (role === 'super-admin' || role === 'desk-in-charge') {
    const tier = getHighestTier(names, activeDesignations);
    const badge = getTierBadgeLabel(tier);
    return (
      <span className={`flex items-center gap-1 flex-wrap ${className}`}>
        <span className="text-sm text-[#1A1A1A]">{label}</span>
        {badge && (
          <span className={`text-[10px] font-bold px-1.5 py-px rounded-full shrink-0 ${getTierBadgeClass(tier)}`}>
            {badge}
          </span>
        )}
      </span>
    );
  }

  // ── coordinator: name only, no badge ─────────────────────────────────────
  if (role === 'coordinator') {
    return <span className={`text-sm text-[#1A1A1A] ${className}`}>{label}</span>;
  }

  // ── dept-head / transport / location-manager / driver: ⭐ or name ─────────
  const special = isSpecialGuest(designation, activeDesignations);
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {special && (
        <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" />
      )}
      <span className="text-sm text-[#1A1A1A]">{label}</span>
    </span>
  );
}
