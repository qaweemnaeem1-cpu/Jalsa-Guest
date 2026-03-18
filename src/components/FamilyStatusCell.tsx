import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GUEST_STATUS_LABELS } from '@/lib/constants';
import type { Guest, GuestStatus, FamilyMemberStatus } from '@/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Status a member shows — falls back to the parent guest's status when unset. */
function effectiveStatus(
  memberStatus: FamilyMemberStatus | undefined,
  guestStatus: GuestStatus,
): string {
  return memberStatus ?? guestStatus;
}

function dotCls(status: string): string {
  if (status === 'Awaiting Review')  return 'bg-amber-400';
  if (status === 'Needs Correction') return 'bg-orange-500';
  if (status === 'Approved')         return 'bg-green-500';
  if (status === 'Accommodated')     return 'bg-emerald-500';
  if (status === 'Rejected')         return 'bg-red-500';
  if (status.startsWith('Assigned')) return 'bg-blue-500';
  return 'bg-gray-400';
}

function badgeCls(status: string): string {
  if (status === 'Awaiting Review')  return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Needs Correction') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (status === 'Approved')         return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'Accommodated')     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Rejected')         return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

function statusLabel(status: string): string {
  return GUEST_STATUS_LABELS[status as GuestStatus] ?? status;
}

// ─── main component ───────────────────────────────────────────────────────────

interface FamilyStatusCellProps {
  guest: Guest;
  /** When true the cell shows a chevron that expands per-member rows inline */
  expandable?: boolean;
}

export function FamilyStatusCell({ guest, expandable = false }: FamilyStatusCellProps) {
  const [open, setOpen] = useState(false);

  // ── Individual guest — plain badge, no expansion ──
  if (guest.guestType !== 'family' || guest.familyMembers.length === 0) {
    return (
      <Badge variant="outline" className={`text-xs ${badgeCls(guest.status)}`}>
        {statusLabel(guest.status)}
      </Badge>
    );
  }

  // ── Build list: [head, ...members] ──
  const allStatuses = [
    guest.status as string,
    ...guest.familyMembers.map(m => effectiveStatus(m.status, guest.status)),
  ];
  const allNames = [
    guest.fullName,
    ...guest.familyMembers.map(m => m.name),
  ];
  const total = allStatuses.length;

  // ── All same status ──
  const allSame = allStatuses.every(s => s === allStatuses[0]);
  if (allSame) {
    const s = allStatuses[0];
    if (s === 'Accommodated') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
          {total} of {total} Accommodated ✅
        </span>
      );
    }
    return (
      <Badge variant="outline" className={`text-xs ${badgeCls(s)}`}>
        {statusLabel(s)}
      </Badge>
    );
  }

  // ── Mixed statuses ──
  const approvedCount = allStatuses.filter(
    s => s === 'Approved' || s === 'Accommodated' || s.startsWith('Assigned'),
  ).length;

  const dotsRow = (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {allStatuses.map((s, i) => (
          <span
            key={i}
            title={`${allNames[i]}: ${s}`}
            className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${dotCls(s)}`}
          />
        ))}
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {approvedCount} of {total} Approved
      </span>
      {expandable && (
        <button
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          className="ml-0.5 text-gray-400 hover:text-gray-700 transition-colors"
          title={open ? 'Collapse' : 'Expand members'}
        >
          {open
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );

  if (!expandable) return dotsRow;

  return (
    <div className="space-y-1.5">
      {dotsRow}
      {open && (
        <div className="space-y-0.5 pl-1">
          {allNames.map((name, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls(allStatuses[i])}`} />
              <span className="text-xs text-[#4A4A4A] truncate max-w-[140px]" title={name}>{name}</span>
              <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium border ${badgeCls(allStatuses[i])}`}>
                {statusLabel(allStatuses[i])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
