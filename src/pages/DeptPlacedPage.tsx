import { useMemo, useState } from 'react';
import { CheckCircle, Eye } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { GuestViewModal } from '@/components/GuestViewModal';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import type { Guest } from '@/types';

interface PlacedRow {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  name: string;
  country: string;
  referenceNumber: string;
  relationship: string;
  isFamily: boolean;
  familyLastName: string;
  familyAllMembers: FamilyMemberInfo[];
  placedLocation: string;
  placedAt?: string;
}

function buildFamilyMemberList(g: Guest): FamilyMemberInfo[] {
  return [
    { name: g.fullName, relationship: 'Head', status: g.status, assignedDepartment: g.assignedDepartment, placedLocation: g.placedLocation },
    ...(g.familyMembers ?? []).map(m => ({
      name: m.name,
      relationship: m.relationship,
      status: m.status ?? g.status,
      assignedDepartment: m.assignedDepartment,
      placedLocation: m.placedLocation,
    })),
  ];
}

function buildRows(guests: Guest[], dept: string): PlacedRow[] {
  const rows: PlacedRow[] = [];
  for (const g of guests) {
    const isFamily = g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0;
    const lastName = g.fullName.split(' ').pop() ?? g.fullName;
    const familyAllMembers = isFamily ? buildFamilyMemberList(g) : [];

    // Head guest placed in this dept
    if (g.assignedDepartment === dept && g.placedLocation) {
      rows.push({
        rowKey: g.id,
        guestId: g.id,
        memberId: null,
        name: g.fullName,
        country: g.country,
        referenceNumber: g.referenceNumber,
        relationship: isFamily ? 'Head' : 'Individual',
        isFamily,
        familyLastName: lastName,
        familyAllMembers,
        placedLocation: g.placedLocation,
        placedAt: g.placedAt,
      });
    }

    // Family members placed in this dept
    if (isFamily) {
      for (const m of g.familyMembers ?? []) {
        if (m.assignedDepartment === dept && m.placedLocation) {
          rows.push({
            rowKey: `${g.id}-${m.id}`,
            guestId: g.id,
            memberId: m.id,
            name: m.name,
            country: g.country,
            referenceNumber: g.referenceNumber,
            relationship: m.relationship,
            isFamily: true,
            familyLastName: lastName,
            familyAllMembers,
            placedLocation: m.placedLocation,
            placedAt: m.placedAt,
          });
        }
      }
    }
  }
  return rows;
}

export default function DeptPlacedPage() {
  const { user } = useAuth();
  const { guests } = useGuests();
  const { departments, getLocPillCls } = useDepartments();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [filterLocation, setFilterLocation] = useState<string>('');

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const allRows = useMemo(() => buildRows(guests, dept), [guests, dept]);

  const filteredRows = useMemo(
    () => filterLocation ? allRows.filter(r => r.placedLocation === filterLocation) : allRows,
    [allRows, filterLocation],
  );

  const viewGuest = useMemo(
    () => guests.find(g => g.id === viewGuestId) ?? null,
    [guests, viewGuestId],
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Placed Guests</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Guests assigned to a location in {dept}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {locations.length > 0 && (
                  <select
                    value={filterLocation}
                    onChange={e => setFilterLocation(e.target.value)}
                    className="border border-[#D4CFC7] rounded-lg px-3 py-1.5 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] h-9"
                  >
                    <option value="">All locations</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                )}
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-200">
                  {filteredRows.length} placed
                </span>
                <DeptUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6">
            {filteredRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">No placed guests</h2>
                <p className="text-sm text-[#4A4A4A]">
                  {filterLocation ? `No guests placed at ${filterLocation}.` : 'No guests have been placed yet.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Role</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date Placed</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => (
                      <tr key={row.rowKey} className="hover:bg-[#F9F8F6]">
                        <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{row.referenceNumber}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                              {row.name.charAt(0)}
                            </div>
                            <span className="font-medium text-[#1A1A1A]">{row.name}</span>
                            {row.isFamily && (
                              <FamilyBadge
                                lastName={row.familyLastName}
                                members={row.familyAllMembers}
                                currentDept={dept}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{row.country}</td>
                        <td className="px-4 py-3 capitalize text-[#4A4A4A]">{row.relationship}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(dept, row.placedLocation)}`}>
                            {row.placedLocation}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">
                          {row.placedAt
                            ? new Date(row.placedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.memberId === null && (
                            <button
                              onClick={() => setViewGuestId(row.guestId)}
                              className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors"
                              title="View guest"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      <GuestViewModal
        guest={viewGuest}
        open={!!viewGuestId}
        onClose={() => setViewGuestId(null)}
      />
    </div>
  );
}
