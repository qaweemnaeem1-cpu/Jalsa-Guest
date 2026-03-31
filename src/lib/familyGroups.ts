/**
 * Family group utilities — shared by all pages that display guests.
 *
 * With the new data model, each family member is a separate guest row
 * linked by `family_group_id`. This module provides helpers to group
 * and work with these rows.
 */
import type { Guest } from '@/types';

export interface FamilyGroup {
  groupId: string;
  familyName: string;
  head: Guest;
  members: Guest[]; // includes head + all other members, sorted head-first
}

/** Build an ordered list of display items: individuals first, then one entry per family group. */
export function buildDisplayGroups(guests: Guest[]): Array<
  { type: 'individual'; guest: Guest } |
  { type: 'family'; group: FamilyGroup }
> {
  const result: Array<{ type: 'individual'; guest: Guest } | { type: 'family'; group: FamilyGroup }> = [];
  const seenGroups = new Set<string>();

  for (const g of guests) {
    if (!g.familyGroupId) {
      result.push({ type: 'individual', guest: g });
    } else if (!seenGroups.has(g.familyGroupId)) {
      seenGroups.add(g.familyGroupId);
      const allInGroup = guests.filter(x => x.familyGroupId === g.familyGroupId);
      const head = allInGroup.find(x => x.isHeadOfFamily) ?? allInGroup[0];
      const nonHead = allInGroup.filter(x => x.id !== head.id);
      result.push({
        type: 'family',
        group: {
          groupId: g.familyGroupId,
          familyName: g.familyName ?? `${head.fullName.split(' ').pop()} Family`,
          head,
          members: [head, ...nonHead],
        },
      });
    }
  }

  return result;
}

/** Status dot colour for a single guest's status. */
export function statusDotColor(status: string): string {
  if (status === 'Approved' || status === 'Accommodated') return 'bg-green-500';
  if (status === 'Awaiting Review') return 'bg-amber-400';
  if (status === 'Needs Correction') return 'bg-orange-500';
  if (status === 'Rejected') return 'bg-red-500';
  return 'bg-gray-400';
}

/** Status badge classes for a status string. */
export function statusBadgeCls(status: string): string {
  if (status === 'Approved' || status === 'Accommodated') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'Awaiting Review')  return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Needs Correction') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (status === 'Rejected')         return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
}
