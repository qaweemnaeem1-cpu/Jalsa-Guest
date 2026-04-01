import { useCallback, useMemo, useState } from 'react';
import { CheckCircle, Eye, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { GuestViewModal } from '@/components/GuestViewModal';
import { PlaceGuestDialog } from '@/components/PlaceGuestDialog';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { supabase } from '@/lib/supabase';
import { formatDesignation } from '@/lib/constants';
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
  arrivalTime?: string;
  arrivalAirport?: string;
  departureTime?: string;
  departureAirport?: string;
  designation: string | string[];
  roomAssignment?: string;
}

function buildFamilyMemberListFromGroup(allGuests: Guest[], familyGroupId: string): FamilyMemberInfo[] {
  return allGuests
    .filter(g => g.familyGroupId === familyGroupId)
    .map(g => ({
      name: g.fullName,
      relationship: g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'),
      status: g.status,
      assignedDepartment: g.assignedDepartment,
      placedLocation: g.placedLocation,
    }));
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
    if (g.familyGroupId) {
      if (g.assignedDepartment === dept && g.placedLocation) {
        const lastName = (g.familyName ?? g.fullName).replace(' Family', '').split(' ').pop() ?? g.fullName;
        rows.push({
          rowKey: g.id, guestId: g.id, memberId: null,
          name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
          relationship: g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'),
          isFamily: true, familyLastName: lastName,
          familyAllMembers: buildFamilyMemberListFromGroup(guests, g.familyGroupId),
          placedLocation: g.placedLocation, placedAt: g.placedAt,
          arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
          departureTime: g.departureTime, departureAirport: g.departureAirport,
          designation: g.designation, roomAssignment: g.roomAssignment,
        });
      }
      continue;
    }

    const isFamily = g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0;
    const lastName = g.fullName.split(' ').pop() ?? g.fullName;
    const familyAllMembers = isFamily ? buildFamilyMemberList(g) : [];

    if (g.assignedDepartment === dept && g.placedLocation) {
      rows.push({
        rowKey: g.id, guestId: g.id, memberId: null,
        name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
        relationship: isFamily ? 'Head' : 'Individual',
        isFamily, familyLastName: lastName, familyAllMembers,
        placedLocation: g.placedLocation, placedAt: g.placedAt,
        arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
        departureTime: g.departureTime, departureAirport: g.departureAirport,
        designation: g.designation, roomAssignment: g.roomAssignment,
      });
    }
    if (isFamily) {
      for (const m of g.familyMembers ?? []) {
        if (m.assignedDepartment === dept && m.placedLocation) {
          rows.push({
            rowKey: `${g.id}-${m.id}`, guestId: g.id, memberId: m.id,
            name: m.name, country: g.country, referenceNumber: g.referenceNumber,
            relationship: m.relationship,
            isFamily: true, familyLastName: lastName, familyAllMembers,
            placedLocation: m.placedLocation, placedAt: m.placedAt,
            arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
            departureTime: g.departureTime, departureAirport: g.departureAirport,
            designation: g.designation, roomAssignment: g.roomAssignment,
          });
        }
      }
    }
  }
  return rows;
}

export default function DeptPlacedPage() {
  const { user } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { departments, getLocPillCls } = useDepartments();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [filterLocation, setFilterLocation] = useState<string>('');
  const [changeDialogRow, setChangeDialogRow] = useState<PlacedRow | null>(null);
  const [saving, setSaving] = useState(false);

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

  const guestCountByLocation = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const loc of locations) {
      counts[loc] = guests.filter(g => g.placedLocation === loc && g.assignedDepartment === dept).length;
    }
    return counts;
  }, [guests, locations, dept]);

  const handleChangeConfirm = useCallback(async (
    locationName: string,
    room?: { id: string; name: string; capacity: number },
  ) => {
    if (!user || !changeDialogRow) return;
    setSaving(true);
    const now = new Date().toISOString();
    const { guestId, name } = changeDialogRow;

    try {
      if (room) {
        const { data: existingBeds } = await supabase
          .from('bed_assignments')
          .select('bed_number')
          .eq('room_id', room.id);
        const nextBed = (existingBeds?.length ?? 0) + 1;
        if (nextBed > room.capacity) {
          toast.error('Room is full');
          setSaving(false);
          return;
        }

        await supabase.from('bed_assignments').insert({
          room_id: room.id, bed_number: nextBed,
          guest_id: guestId, guest_name: name, assigned_at: now,
        });

        await supabase.from('guests').update({
          placed_location: locationName,
          placed_at: now, placed_by: user.id,
          room_assignment: room.name,
          status: 'Accommodated',
          accommodated_at: now, accommodated_by: user.id,
          updated_at: now,
        }).eq('id', guestId);

        updateGuest(guestId, {
          status: 'Accommodated',
          placedLocation: locationName, placedAt: now, placedBy: user.id,
          roomAssignment: room.name, accommodatedAt: now, accommodatedBy: user.id,
        });
        toast.success(`${name} moved to ${locationName} — Room ${room.name} (Bed ${nextBed})`);
      } else {
        await supabase.from('guests').update({
          placed_location: locationName,
          placed_at: now, placed_by: user.id,
          status: 'Placed', updated_at: now,
        }).eq('id', guestId);

        updateGuest(guestId, {
          status: 'Placed',
          placedLocation: locationName, placedAt: now, placedBy: user.id,
        });
        toast.success(`${name} moved to ${locationName}`);
      }

      setChangeDialogRow(null);
    } finally {
      setSaving(false);
    }
  }, [user, changeDialogRow, updateGuest]);

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
                  <h1 className="text-2xl font-semibold text-[#1A1A1A]">Placed Guests</h1>
                  <p className="text-sm text-[#4A4A4A] mt-0.5">Guests assigned to a location in {dept}</p>
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
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Designation</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Placed</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => (
                      <tr key={row.rowKey} className="hover:bg-[#F9F8F6]">
                        <td className="px-4 py-3 font-mono text-sm text-[#4A4A4A]">{row.referenceNumber}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="w-9 h-9 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-base font-medium shrink-0">
                              {row.name.charAt(0)}
                            </div>
                            <span className="font-medium text-base text-[#1A1A1A]">{row.name}</span>
                            {row.isFamily && (
                              <FamilyBadge
                                lastName={row.familyLastName}
                                members={row.familyAllMembers}
                                currentDept={dept}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#4A4A4A]">{row.country}</td>
                        <td className="px-4 py-3 text-sm text-[#4A4A4A]">{formatDesignation(row.designation)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(dept, row.placedLocation)}`}>
                            {row.placedLocation}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {row.roomAssignment ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                              {row.roomAssignment}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No room</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.arrivalTime ? (
                            <div>
                              <div className="text-sm text-[#1A1A1A]">
                                {new Date(row.arrivalTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                              {row.arrivalAirport && <div className="text-xs text-gray-400">{row.arrivalAirport}</div>}
                            </div>
                          ) : <span className="text-gray-400 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.departureTime ? (
                            <div>
                              <div className="text-sm text-[#1A1A1A]">
                                {new Date(row.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                              {row.departureAirport && <div className="text-xs text-gray-400">{row.departureAirport}</div>}
                            </div>
                          ) : <span className="text-gray-400 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#4A4A4A]">
                          {row.placedAt
                            ? new Date(row.placedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {row.memberId === null && (
                              <button
                                onClick={() => setViewGuestId(row.guestId)}
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors"
                                title="View guest"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setChangeDialogRow(row)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-[#2D5A45] text-[#2D5A45] bg-white hover:bg-[#F5F0E8] transition-colors"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              Change
                            </button>
                          </div>
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

      {changeDialogRow && (
        <PlaceGuestDialog
          open={!!changeDialogRow}
          onClose={() => setChangeDialogRow(null)}
          mode="change"
          guestName={changeDialogRow.name}
          guestCountry={changeDialogRow.country}
          arrivalTime={changeDialogRow.arrivalTime}
          arrivalAirport={changeDialogRow.arrivalAirport}
          departureTime={changeDialogRow.departureTime}
          departureAirport={changeDialogRow.departureAirport}
          locations={locations}
          guestCountByLocation={guestCountByLocation}
          initialLocation={changeDialogRow.placedLocation}
          saving={saving}
          onConfirm={handleChangeConfirm}
        />
      )}
    </div>
  );
}
