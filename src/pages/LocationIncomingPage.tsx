import { useMemo, useState } from 'react';
import { Inbox, Eye, Check, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { LocationSidebar } from '@/components/LocationSidebar';
import { LocationUserMenu } from '@/components/LocationUserMenu';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { FamilyLinkDialog } from '@/components/FamilyLinkDialog';
import { GuestViewModal } from '@/components/GuestViewModal';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import DesignationDisplay from '@/components/DesignationDisplay';
import type { Guest, Room, BedAssignment } from '@/types';

// ── Row model ─────────────────────────────────────────────────────────────────

interface PersonRow {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  name: string;
  country: string;
  referenceNumber: string;
  relationship: string;
  isFamily: boolean;
  familyLastName: string;
  familyGroupId: string | null;
  familyAllMembers: FamilyMemberInfo[];
  placedAt?: string;
  designation: string | string[];
  guestType: string;
  arrivalTime?: string;
  arrivalFlightNumber?: string;
  arrivalAirport?: string;
  departureTime?: string;
  departureFlightNumber?: string;
  departureAirport?: string;
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
      name: m.name, relationship: m.relationship, status: m.status ?? g.status,
      assignedDepartment: m.assignedDepartment, placedLocation: m.placedLocation,
    })),
  ];
}

function buildLocationRows(guests: Guest[], loc: string): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const g of guests) {
    // New model: guest has familyGroupId
    if (g.familyGroupId) {
      if (g.placedLocation === loc) {
        const lastName = (g.familyName ?? g.fullName).replace(' Family', '').split(' ').pop() ?? g.fullName;
        rows.push({
          rowKey: g.id, guestId: g.id, memberId: null,
          name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
          relationship: g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'),
          isFamily: true, familyLastName: lastName,
          familyGroupId: g.familyGroupId,
          familyAllMembers: buildFamilyMemberListFromGroup(guests, g.familyGroupId),
          placedAt: g.placedAt,
          designation: g.designation, guestType: g.guestType,
          arrivalTime: g.arrivalTime, arrivalFlightNumber: g.arrivalFlightNumber, arrivalAirport: g.arrivalAirport,
          departureTime: g.departureTime, departureFlightNumber: g.departureFlightNumber, departureAirport: g.departureAirport,
        });
      }
      continue;
    }

    // Old model
    const isFamily = g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0;
    const lastName = g.fullName.split(' ').pop() ?? g.fullName;
    const familyAllMembers = isFamily ? buildFamilyMemberList(g) : [];

    if (g.placedLocation === loc) {
      rows.push({
        rowKey: g.id, guestId: g.id, memberId: null,
        name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
        relationship: isFamily ? 'Head' : 'Individual',
        isFamily, familyLastName: lastName, familyGroupId: null, familyAllMembers, placedAt: g.placedAt,
        designation: g.designation, guestType: g.guestType,
        arrivalTime: g.arrivalTime, arrivalFlightNumber: g.arrivalFlightNumber, arrivalAirport: g.arrivalAirport,
        departureTime: g.departureTime, departureFlightNumber: g.departureFlightNumber, departureAirport: g.departureAirport,
      });
    }
    if (isFamily) {
      for (const m of g.familyMembers ?? []) {
        if (m.placedLocation === loc) {
          rows.push({
            rowKey: `${g.id}-${m.id}`, guestId: g.id, memberId: m.id,
            name: m.name, country: g.country, referenceNumber: g.referenceNumber,
            relationship: m.relationship,
            isFamily: true, familyLastName: lastName, familyGroupId: null, familyAllMembers, placedAt: m.placedAt,
            designation: m.designation ?? g.designation, guestType: g.guestType,
            arrivalTime: g.arrivalTime, arrivalFlightNumber: g.arrivalFlightNumber, arrivalAirport: g.arrivalAirport,
            departureTime: g.departureTime, departureFlightNumber: g.departureFlightNumber, departureAirport: g.departureAirport,
          });
        }
      }
    }
  }
  return rows;
}

function buildAssignedKeys(locationRooms: Room[], bedAssignments: Record<string, BedAssignment[]>): Set<string> {
  const s = new Set<string>();
  for (const room of locationRooms) {
    for (const bed of bedAssignments[room.id] ?? []) {
      if (bed.guestId) s.add(bed.familyMemberId ? `${bed.guestId}-${bed.familyMemberId}` : bed.guestId);
    }
  }
  return s;
}

function getNextAvailableBed(roomId: string, bedAssignments: Record<string, BedAssignment[]>): number | null {
  return (bedAssignments[roomId] ?? []).find(b => !b.guestName)?.bedNumber ?? null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface PendingAssign {
  rowKey: string; guestId: string; memberId: string | null;
  name: string; roomId: string; roomName: string; bedNumber: number;
}

export default function LocationIncomingPage() {
  const { user } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { rooms, blocks, bedAssignments, assignGuestToRoom, getRoomsByLocation } = useRooms();
  const { addEntry: addEntry2 } = useAuditTrail2();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Record<string, string>>({});
  const [pendingAssign, setPendingAssign] = useState<PendingAssign | null>(null);
  const [search, setSearch] = useState('');

  const loc = user?.location ?? '';

  const locationRooms = useMemo(() => rooms.filter(r => r.locationId === loc && r.isActive), [rooms, loc]);
  const roomGroups = useMemo(() => getRoomsByLocation(loc), [getRoomsByLocation, loc]);

  const allRows = useMemo(() => {
    const rows = buildLocationRows(guests, loc);
    const assignedKeys = buildAssignedKeys(locationRooms, bedAssignments);
    return rows.filter(r => !assignedKeys.has(r.rowKey));
  }, [guests, loc, locationRooms, bedAssignments]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.country.toLowerCase().includes(q) ||
      r.referenceNumber.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const viewGuest = useMemo(() => guests.find(g => g.id === viewGuestId) ?? null, [guests, viewGuestId]);

  const handleAssignClick = (row: PersonRow) => {
    const roomId = selectedRoom[row.rowKey] ?? '';
    if (!roomId) { toast.error('Please select a room first'); return; }
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    const bed = getNextAvailableBed(roomId, bedAssignments);
    if (bed === null) { toast.error('No available beds in this room'); return; }
    setPendingAssign({ rowKey: row.rowKey, guestId: row.guestId, memberId: row.memberId, name: row.name, roomId, roomName: room.name, bedNumber: bed });
  };

  const handleConfirmAssign = () => {
    if (!pendingAssign || !user) return;
    const { guestId, memberId, name, roomId, roomName, bedNumber } = pendingAssign;
    const guest = guests.find(g => g.id === guestId);
    assignGuestToRoom(roomId, bedNumber, guestId, name, memberId ?? undefined);
    // Persist accommodation to Supabase (only for the head guest, not family members)
    if (!memberId) {
      updateGuest(guestId, {
        status: 'Accommodated',
        accommodatedBy: user.id,
        accommodatedAt: new Date().toISOString(),
      });
    }
    if (guest) {
      addEntry2({
        guestId, guestName: name, guestReference: guest.referenceNumber,
        locationId: loc, locationName: loc,
        departmentId: guest.assignedDepartment ?? '', departmentName: guest.assignedDepartment ?? '',
        type: 'room_assignment',
        action: `Assigned to Room ${roomName}, Bed ${bedNumber}`,
        newValue: `${roomName} / Bed ${bedNumber}`,
        createdBy: { id: user.id, name: user.name, role: 'location-manager' },
        createdAt: new Date().toISOString(),
      });
    }
    toast.success(`${name} assigned to ${roomName} · Bed ${bedNumber}`);
    setSelectedRoom(prev => { const n = { ...prev }; delete n[pendingAssign.rowKey]; return n; });
    setPendingAssign(null);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <LocationSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Inbox className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Incoming Guests</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Placed at {loc} — awaiting room assignment</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {allRows.length > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full border border-amber-200">
                    {allRows.length} unassigned
                  </span>
                )}
                <LocationUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6 space-y-4">
            {allRows.length > 0 && (
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                <Input
                  placeholder="Search by name, country, reference…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10 bg-white"
                />
              </div>
            )}

            {allRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <Inbox className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">No guests waiting</h2>
                <p className="text-sm text-[#4A4A4A]">All placed guests have been assigned a room.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-10 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">No results found</p>
                <p className="text-xs text-[#4A4A4A]">Try a different name, country, or reference.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Family</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Designation</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Assign Room</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => {
                      const sel = selectedRoom[row.rowKey] ?? '';
                      return (
                        <tr key={row.rowKey} className="hover:bg-[#F9F8F6]">
                          <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{row.referenceNumber}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                                {row.name.charAt(0)}
                              </div>
                              <span className="font-medium text-[#1A1A1A]">{row.name}</span>
                              {row.isFamily && (
                                <FamilyBadge lastName={row.familyLastName} members={row.familyAllMembers} currentDept={loc} />
                              )}
                            </div>
                          </td>
                          {/* Family */}
                          <td className="px-4 py-3">
                            {row.isFamily && row.familyGroupId ? (
                              <FamilyLinkDialog
                                familyGroupId={row.familyGroupId}
                                familyName={row.familyLastName}
                              />
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#4A4A4A]">{row.country}</td>
                          {/* Designation */}
                          <td className="px-4 py-3 text-xs text-[#4A4A4A]"><DesignationDisplay designation={row.designation} /></td>
                          {/* Arrival */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.arrivalTime ? (
                              <div>
                                <div className="text-xs text-[#1A1A1A]">
                                  {new Date(row.arrivalTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  {' '}{new Date(row.arrivalTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                {(row.arrivalFlightNumber || row.arrivalAirport) && (
                                  <div className="text-xs text-gray-400">
                                    {[row.arrivalFlightNumber, row.arrivalAirport].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          {/* Departure */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.departureTime ? (
                              <div>
                                <div className="text-xs text-[#1A1A1A]">
                                  {new Date(row.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  {' '}{new Date(row.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                {(row.departureFlightNumber || row.departureAirport) && (
                                  <div className="text-xs text-gray-400">
                                    {[row.departureFlightNumber, row.departureAirport].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          {/* Type */}
                          <td className="px-4 py-3 text-xs capitalize text-[#4A4A4A]">{row.guestType}</td>
                          {/* Assign Room */}
                          <td className="px-4 py-3">
                            <select
                              value={sel}
                              onChange={e => setSelectedRoom(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                              className="border border-[#D4CFC7] rounded-lg px-2 py-1.5 text-xs text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] min-w-[160px]"
                            >
                              <option value="">Select room…</option>
                              {roomGroups.map(group => {
                                if (group.rooms.length === 0) return null;
                                const groupLabel = group.block ? group.block.name : 'Unassigned Rooms';
                                return (
                                  <optgroup key={group.block?.id ?? 'none'} label={groupLabel}>
                                    {group.rooms.map(room => {
                                      const beds = bedAssignments[room.id] ?? [];
                                      const occupied = beds.filter(b => !!b.guestName).length;
                                      const total = beds.length;
                                      const full = occupied >= total;
                                      const almostFull = !full && (total - occupied) === 1;
                                      const dot = full ? '🔴' : almostFull ? '🟡' : '🟢';
                                      // Check date availability
                                      const today = new Date().toISOString().split('T')[0];
                                      const dateWarning = (room.availableFrom && room.availableFrom > today) || (room.availableTo && room.availableTo < today);
                                      return (
                                        <option key={room.id} value={room.id} disabled={full}>
                                          {dot} {room.name} ({occupied}/{total}){full ? ' — Full' : ''}{dateWarning ? ' ⚠️' : ''}
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                );
                              })}
                            </select>
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
                                onClick={() => handleAssignClick(row)}
                                disabled={!sel}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Assign
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      <GuestViewModal guest={viewGuest} open={!!viewGuestId} onClose={() => setViewGuestId(null)} />

      <AlertDialog open={!!pendingAssign} onOpenChange={o => { if (!o) setPendingAssign(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Room Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Assign <strong>{pendingAssign?.name}</strong> to room{' '}
              <strong>{pendingAssign?.roomName}</strong>?{' '}
              Bed <strong>{pendingAssign?.bedNumber}</strong> will be used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAssign} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
