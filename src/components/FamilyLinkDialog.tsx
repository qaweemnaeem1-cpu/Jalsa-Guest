import { useState } from 'react';
import { AlertTriangle, Link2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { GUEST_STATUS_LABELS } from '@/lib/constants';
import type { GuestStatus } from '@/types';

interface FamilyMember {
  id: string;
  full_name: string;
  relationship: string | null;
  is_head_of_family: boolean;
  assigned_department: string | null;
  placed_location: string | null;
  room_assignment: string | null;
  status: string;
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

interface FamilyLinkDialogProps {
  familyGroupId: string;
  familyName: string;
}

export function FamilyLinkDialog({ familyGroupId, familyName }: FamilyLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [fetched, setFetched] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (fetched) return;
    setLoading(true);
    const { data } = await supabase
      .from('guests')
      .select('id, full_name, relationship, is_head_of_family, assigned_department, placed_location, room_assignment, status')
      .eq('family_group_id', familyGroupId)
      .order('is_head_of_family', { ascending: false });
    setMembers((data as FamilyMember[]) ?? []);
    setFetched(true);
    setLoading(false);
  }

  const placed       = members.filter(m => m.placed_location).length;
  const accommodated = members.filter(m => m.status === 'Accommodated').length;
  const depts        = [...new Set(members.map(m => m.assigned_department).filter(Boolean))];
  const locs         = [...new Set(members.map(m => m.placed_location).filter(Boolean))];

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); handleOpen(); }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap"
      >
        <Link2 className="w-3 h-3 shrink-0" />
        {familyName} Family
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-[#E8E3DB] bg-[#F9F8F6] rounded-t-lg">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <DialogTitle className="text-base font-semibold text-[#1A1A1A]">
                {familyName} Family
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-[#4A4A4A]">
                Loading…
              </div>
            ) : (
              <>
                {/* Warnings */}
                {(depts.length > 1 || locs.length > 1) && (
                  <div className="mb-4 space-y-1.5">
                    {depts.length > 1 && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Family members are split across {depts.length} departments
                      </div>
                    )}
                    {locs.length > 1 && (
                      <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Family members are placed in {locs.length} different locations
                      </div>
                    )}
                  </div>
                )}

                {/* Summary pills */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="text-xs text-[#4A4A4A] bg-[#F5F0E8] border border-[#E8E3DB] rounded-full px-2.5 py-1">
                    {members.length} member{members.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                    {placed} placed
                  </span>
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                    {accommodated} accommodated
                  </span>
                </div>

                {/* Members table */}
                <div className="rounded-lg border border-[#E8E3DB] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#F5F0E8] border-b border-[#E8E3DB]">
                        <th className="text-left px-3 py-2.5 font-semibold text-[#4A4A4A] uppercase tracking-wider w-8">#</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-[#4A4A4A] uppercase tracking-wider">Role</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-[#4A4A4A] uppercase tracking-wider">Department</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {members.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-[#4A4A4A]">No members found</td>
                        </tr>
                      ) : members.map((m, i) => (
                        <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF9]'}>
                          <td className="px-3 py-2.5 text-[#4A4A4A]">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-[#1A1A1A]">
                            {m.is_head_of_family && (
                              <span className="mr-1 text-amber-500" title="Head of family">⭐</span>
                            )}
                            {m.full_name}
                          </td>
                          <td className="px-3 py-2.5 text-[#4A4A4A] capitalize">
                            {m.is_head_of_family ? 'Head' : (m.relationship ?? '—')}
                          </td>
                          <td className="px-3 py-2.5 text-[#4A4A4A]">{m.assigned_department ?? '—'}</td>
                          <td className="px-3 py-2.5 text-[#4A4A4A]">{m.placed_location ?? '—'}</td>
                          <td className="px-3 py-2.5 text-[#4A4A4A]">{m.room_assignment ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium border ${statusBadgeCls(m.status)}`}>
                              {GUEST_STATUS_LABELS[m.status as GuestStatus] ?? m.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
