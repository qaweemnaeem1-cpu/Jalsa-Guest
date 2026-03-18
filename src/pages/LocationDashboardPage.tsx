import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Inbox, CheckCircle, BedDouble, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { LocationSidebar } from '@/components/LocationSidebar';
import { LocationUserMenu } from '@/components/LocationUserMenu';
import type { Guest, Room, BedAssignment } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

interface PersonRow {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  placedAt?: string;
}

function buildLocationRows(guests: Guest[], loc: string): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const g of guests) {
    if (g.placedLocation === loc) {
      rows.push({ rowKey: g.id, guestId: g.id, memberId: null, placedAt: g.placedAt });
    }
    for (const m of g.familyMembers ?? []) {
      if (m.placedLocation === loc) {
        rows.push({ rowKey: `${g.id}-${m.id}`, guestId: g.id, memberId: m.id, placedAt: m.placedAt });
      }
    }
  }
  return rows;
}

function buildAssignedKeys(rooms: Room[], bedAssignments: Record<string, BedAssignment[]>): Set<string> {
  const s = new Set<string>();
  for (const room of rooms) {
    for (const bed of bedAssignments[room.id] ?? []) {
      if (bed.guestId) s.add(bed.familyMemberId ? `${bed.guestId}-${bed.familyMemberId}` : bed.guestId);
    }
  }
  return s;
}

// ── OccupancyBar ───────────────────────────────────────────────────────────────

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-[#2D5A45] rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{occupied}/{total} beds</span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LocationDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { guests } = useGuests();
  const { rooms, bedAssignments, getRoomsByLocation, getOccupancy, getLocationOccupancy } = useRooms();

  const loc = user?.location ?? '';
  const dept = user?.department ?? '';

  const locationRows = useMemo(() => buildLocationRows(guests, loc), [guests, loc]);

  const locationRooms = useMemo(() => rooms.filter(r => r.locationId === loc && r.isActive), [rooms, loc]);

  const assignedKeys = useMemo(() => buildAssignedKeys(locationRooms, bedAssignments), [locationRooms, bedAssignments]);

  const incomingCount = useMemo(
    () => locationRows.filter(r => !assignedKeys.has(r.rowKey)).length,
    [locationRows, assignedKeys],
  );

  const accommodatedCount = useMemo(
    () => locationRows.filter(r => assignedKeys.has(r.rowKey)).length,
    [locationRows, assignedKeys],
  );

  const { totalBeds, occupiedBeds } = useMemo(() => getLocationOccupancy(loc), [loc, getLocationOccupancy]);

  const roomGroups = useMemo(() => getRoomsByLocation(loc), [loc, getRoomsByLocation]);

  const flatRooms = useMemo(() => roomGroups.flatMap(g => g.rooms), [roomGroups]);

  const quickActions = [
    { label: 'Assign Rooms →', href: '/location/incoming' },
    { label: 'View All Rooms →', href: '/location/rooms' },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <LocationSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">{loc} Dashboard</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">{dept} — {user.name}</p>
                </div>
              </div>
              <LocationUserMenu />
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Action Cards */}
            <div className="grid grid-cols-3 gap-4">
              {/* Incoming */}
              <button
                onClick={() => navigate('/location/incoming')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Inbox className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-2xl font-bold text-amber-600">{incomingCount}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Incoming</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Placed but no bed assigned</p>
              </button>

              {/* Accommodated */}
              <button
                onClick={() => navigate('/location/accommodated')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-2xl font-bold text-green-600">{accommodatedCount}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Accommodated</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Bed assigned</p>
              </button>

              {/* Room Capacity */}
              <button
                onClick={() => navigate('/location/rooms')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <BedDouble className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-2xl font-bold text-blue-600">{occupiedBeds}/{totalBeds}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Room Capacity</p>
                <OccupancyBar occupied={occupiedBeds} total={totalBeds} />
              </button>
            </div>

            {/* Room Overview */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BedDouble className="w-4 h-4 text-[#2D5A45]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Room Overview</h2>
              </div>
              {flatRooms.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-10 text-center">
                  <BedDouble className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                  <p className="text-sm font-medium text-[#1A1A1A] mb-1">No rooms configured</p>
                  <p className="text-xs text-[#4A4A4A]">Add rooms from the Rooms &amp; Blocks page.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {flatRooms.map(room => {
                    const occ = getOccupancy(room.id);
                    const isFull = occ.total > 0 && occ.occupied >= occ.total;
                    const isEmpty = occ.occupied === 0;
                    const borderColor = isFull
                      ? 'border-l-red-400'
                      : isEmpty
                        ? 'border-l-gray-300'
                        : 'border-l-green-500';
                    return (
                      <div
                        key={room.id}
                        className={`bg-white border border-[#E8E3DB] border-l-4 ${borderColor} rounded-xl p-4`}
                      >
                        <p className="font-medium text-sm text-[#1A1A1A] mb-2">{room.name}</p>
                        <OccupancyBar occupied={occ.occupied} total={occ.total} />
                        <p className="text-xs text-[#4A4A4A] mt-1">{occ.occupied}/{occ.total} beds</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight className="w-4 h-4 text-[#2D5A45]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Quick Actions</h2>
              </div>
              <div className="bg-white border border-[#E8E3DB] rounded-xl overflow-hidden">
                {quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => navigate(action.href)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F5F0E8] transition-colors border-b border-[#E8E3DB] last:border-b-0 text-left"
                  >
                    <span className="text-sm text-[#1A1A1A]">{action.label}</span>
                    <ArrowRight className="w-4 h-4 text-[#4A4A4A]" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
