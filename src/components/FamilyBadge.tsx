import { Link2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GUEST_STATUS_LABELS } from '@/lib/constants';
import type { GuestStatus } from '@/types';

export interface FamilyMemberInfo {
  name: string;
  relationship: string;
  status: string;
  assignedDepartment?: string;
  placedLocation?: string;
}

function statusBadgeCls(s: string): string {
  if (s === 'Awaiting Review')  return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'Needs Correction') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (s === 'Approved')         return 'bg-green-50 text-green-700 border-green-200';
  if (s === 'Accommodated')     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'Rejected')         return 'bg-red-50 text-red-700 border-red-200';
  if (s.startsWith('Assigned')) return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
}

interface FamilyBadgeProps {
  lastName: string;
  members: FamilyMemberInfo[];
  currentDept: string;
}

export function FamilyBadge({ lastName, members, currentDept }: FamilyBadgeProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
        >
          <Link2 className="w-3 h-3 shrink-0" />
          {lastName} Family
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-sm p-0 shadow-lg" align="start" side="bottom">
        <div className="px-4 py-2.5 border-b border-[#E8E3DB] bg-[#F9F8F6] rounded-t-md">
          <p className="text-sm font-semibold text-[#1A1A1A]">{lastName} Family</p>
          <p className="text-xs text-[#4A4A4A]">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="p-2 space-y-1 max-h-72 overflow-y-auto">
          {members.map((m, i) => {
            const inThisDept = m.assignedDepartment === currentDept;
            return (
              <div
                key={i}
                className={`px-3 py-2 rounded-lg ${
                  inThisDept ? 'bg-white border border-[#E8E3DB]' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={`text-xs font-medium truncate ${inThisDept ? 'text-[#1A1A1A]' : 'text-gray-400'}`}>
                      {m.name}
                    </span>
                    <span className={`text-[10px] capitalize shrink-0 ${inThisDept ? 'text-[#4A4A4A]' : 'text-gray-400'}`}>
                      ({m.relationship})
                    </span>
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium border shrink-0 ${
                    inThisDept ? statusBadgeCls(m.status) : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}>
                    {GUEST_STATUS_LABELS[m.status as GuestStatus] ?? m.status}
                  </span>
                </div>
                <p className={`text-[10px] ${inThisDept ? 'text-[#4A4A4A]' : 'text-gray-400'}`}>
                  {m.placedLocation
                    ? <span className={inThisDept ? 'text-[#2D5A45] font-medium' : ''}> → {m.placedLocation}</span>
                    : m.assignedDepartment
                      ? <span> → {inThisDept ? 'not placed yet' : m.assignedDepartment}</span>
                      : <span className="text-gray-400"> → not assigned</span>
                  }
                </p>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
