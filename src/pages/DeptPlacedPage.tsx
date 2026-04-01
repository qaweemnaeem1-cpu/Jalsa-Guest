import { useState, useMemo, useEffect } from 'react';
import { CheckCircle, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { GuestViewModal } from '@/components/GuestViewModal';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { supabase } from '@/lib/supabase';
import { formatDesignation } from '@/lib/constants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  guestArrivalDate?: string;
  guestDepartureDate?: string;
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
    // New model
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
          arrivalTime: g.arrivalTime,
          arrivalAirport: g.arrivalAirport,
          departureTime: g.departureTime,
          departureAirport: g.departureAirport,
          designation: g.designation,
          roomAssignment: g.roomAssignment,
          guestArrivalDate: g.arrivalTime?.substring(0, 10),
          guestDepartureDate: g.departureTime?.substring(0, 10),
        });
      }
      continue;
    }

    // Old model
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
        arrivalTime: g.arrivalTime,
        arrivalAirport: g.arrivalAirport,
        departureTime: g.departureTime,
        departureAirport: g.departureAirport,
        designation: g.designation,
        roomAssignment: g.roomAssignment,
        guestArrivalDate: g.arrivalTime?.substring(0, 10),
        guestDepartureDate: g.departureTime?.substring(0, 10),
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
            // Inherit from parent guest for old-model family members
            arrivalTime: g.arrivalTime,
            arrivalAirport: g.arrivalAirport,
            departureTime: g.departureTime,
            departureAirport: g.departureAirport,
            designation: g.designation,
            roomAssignment: g.roomAssignment,
            guestArrivalDate: g.arrivalTime?.substring(0, 10),
            guestDepartureDate: g.departureTime?.substring(0, 10),
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
  const [selectedRooms, setSelectedRooms] = useState<Record<string, string>>({});
  const [roomsByLocation, setRoomsByLocation] = useState<Record<string, Array<{
    id: string; name: string; capacity: number; available_from?: string; available_to?: string; occupancy: number;
  }>>>({});
  const [dateMismatch, setDateMismatch] = useState<{
    rowKey: string; guestId: string; name: string;
    roomId: string; roomName: string; roomCapacity: number;
    guestArrival?: string; guestDeparture?: string;
    roomFrom?: string; roomTo?: string;
  } | null>(null);

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

  const fetchRoomsForLocation = async (locationName: string) => {
    if (roomsByLocation[locationName]) return;
    const { data: locData } = await supabase.from('locations').select('id').eq('name', locationName).maybeSingle();
    const locationId = locData?.id;
    const { data } = await supabase.from('rooms').select('id, name, capacity, available_from, available_to').eq('is_active', true).order('name');
    if (!data) return;
    const filtered = locationId ? data.filter((r: any) => r.location_id === locationId) : data;
    const { data: beds } = await supabase.from('bed_assignments').select('room_id');
    const occMap: Record<string, number> = {};
    if (beds) { for (const b of beds) { occMap[b.room_id] = (occMap[b.room_id] ?? 0) + 1; } }
    setRoomsByLocation(prev => ({
      ...prev,
      [locationName]: filtered.map((r: any) => ({
        id: r.id, name: r.name, capacity: r.capacity,
        available_from: r.available_from ?? undefined, available_to: r.available_to ?? undefined,
        occupancy: occMap[r.id] ?? 0,
      })),
    }));
  };

  useEffect(() => {
    const locs = [...new Set(filteredRows.map(r => r.placedLocation))];
    locs.forEach(loc => fetchRoomsForLocation(loc));
  }, [filteredRows.length]);

  const assignRoom = async (row: PlacedRow, roomId: string) => {
    const rooms = roomsByLocation[row.placedLocation] ?? [];
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    const guest = guests.find(g => g.id === row.guestId);
    const guestArrival = guest?.arrivalTime?.substring(0, 10);
    const guestDeparture = guest?.departureTime?.substring(0, 10);
    const mismatch = (room.available_from && guestArrival && guestArrival < room.available_from) ||
      (room.available_to && guestDeparture && guestDeparture > room.available_to);
    if (mismatch) {
      setDateMismatch({
        rowKey: row.rowKey, guestId: row.guestId, name: row.name,
        roomId, roomName: room.name, roomCapacity: room.capacity,
        guestArrival, guestDeparture, roomFrom: room.available_from, roomTo: room.available_to,
      });
      return;
    }
    await doAssignRoom(row.rowKey, row.guestId, row.name, roomId, room.name, room.capacity, row.placedLocation);
  };

  const doAssignRoom = async (rowKey: string, guestId: string, guestName: string, roomId: string, roomName: string, roomCapacity: number, locationName: string) => {
    if (!user) return;
    const { data: beds } = await supabase.from('bed_assignments').select('bed_number').eq('room_id', roomId);
    const nextBed = (beds?.length ?? 0) + 1;
    if (nextBed > roomCapacity) { toast.error('Room is full'); return; }
    const now = new Date().toISOString();
    await supabase.from('bed_assignments').insert({ room_id: roomId, bed_number: nextBed, guest_id: guestId, guest_name: guestName, assigned_at: now });
    await supabase.from('guests').update({ room_assignment: roomName, status: 'Accommodated', accommodated_at: now, accommodated_by: user.id }).eq('id', guestId);
    updateGuest(guestId, { roomAssignment: roomName, status: 'Accommodated', accommodatedAt: now, accommodatedBy: user.id });
    toast.success(`${guestName} assigned to ${roomName} (Bed ${nextBed})`);
    setSelectedRooms(prev => { const n = { ...prev }; delete n[rowKey]; return n; });
    setRoomsByLocation(prev => { const n = { ...prev }; delete n[locationName]; return n; });
  };

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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Designation</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date Placed</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Assign Room</th>
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
                        <td className="px-4 py-3 text-[#4A4A4A] text-xs">{formatDesignation(row.designation)}</td>
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
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.departureTime ? (
                            <div>
                              <div className="text-sm text-[#1A1A1A]">
                                {new Date(row.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                              {row.departureAirport && <div className="text-xs text-gray-400">{row.departureAirport}</div>}
                            </div>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">
                          {row.placedAt
                            ? new Date(row.placedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.roomAssignment ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <select
                              value={selectedRooms[row.rowKey] ?? ''}
                              onChange={e => setSelectedRooms(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                              className="border border-[#D4CFC7] rounded-lg px-2 py-1.5 text-xs text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] min-w-[130px]"
                            >
                              <option value="">Select room…</option>
                              {(roomsByLocation[row.placedLocation] ?? []).map(room => {
                                const isFull = room.occupancy >= room.capacity;
                                return (
                                  <option key={room.id} value={room.id} disabled={isFull}>
                                    {isFull ? '🔴 ' : ''}{room.name} ({room.occupancy}/{room.capacity} beds)
                                  </option>
                                );
                              })}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
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
                            {selectedRooms[row.rowKey] && !row.roomAssignment && (
                              <button
                                onClick={() => assignRoom(row, selectedRooms[row.rowKey])}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                              >
                                Assign Room
                              </button>
                            )}
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

      <AlertDialog open={!!dateMismatch} onOpenChange={o => { if (!o) setDateMismatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Date Mismatch
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dateMismatch && (
                <span>
                  Guest stay ({dateMismatch.guestArrival ?? '—'} – {dateMismatch.guestDeparture ?? '—'}) does not match room <strong>{dateMismatch.roomName}</strong> availability ({dateMismatch.roomFrom ?? '—'} – {dateMismatch.roomTo ?? '—'}).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDateMismatch(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!dateMismatch) return;
                await doAssignRoom(
                  dateMismatch.rowKey,
                  dateMismatch.guestId,
                  dateMismatch.name,
                  dateMismatch.roomId,
                  dateMismatch.roomName,
                  dateMismatch.roomCapacity,
                  filteredRows.find(r => r.rowKey === dateMismatch.rowKey)?.placedLocation ?? '',
                );
                setDateMismatch(null);
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Assign Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
