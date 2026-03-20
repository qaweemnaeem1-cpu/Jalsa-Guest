import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRooms } from '@/hooks/useRooms';
import { useDepartments } from '@/hooks/useDepartments';
import {
  LayoutDashboard, Users, Briefcase, Globe, ScrollText,
  BedDouble, ChevronDown, LogOut, Search, User,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ROLE_LABELS } from '@/lib/constants';
import { ProfileDialog } from '@/components/ProfileDialog';
import { SUPER_ADMIN_NAV } from '@/lib/navItems';

const NAV_ITEMS = SUPER_ADMIN_NAV;

function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-[#2D5A45]';
  return (
    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AdminRoomsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { rooms, blocks, bedAssignments, getOccupancy } = useRooms();
  const { departments } = useDepartments();

  const [deptFilter, setDeptFilter] = useState('all');
  const [locFilter, setLocFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;

  // Build dept→locations map from departments context
  const allLocations = useMemo(() => {
    const locs = new Set<string>();
    Object.values(departments).forEach(ls => ls.forEach(l => locs.add(l)));
    return Array.from(locs).sort();
  }, [departments]);

  const deptList = useMemo(() => Object.keys(departments).sort(), [departments]);

  // Locations filtered by selected dept
  const filteredLocOptions = useMemo(() => {
    if (deptFilter === 'all') return allLocations;
    return departments[deptFilter] ?? [];
  }, [deptFilter, departments, allLocations]);

  // Find which dept a location belongs to
  const locToDept = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(departments).forEach(([dept, locs]) => locs.forEach(l => m.set(l, dept)));
    return m;
  }, [departments]);

  // Build rows: one per room
  const rows = useMemo(() => {
    return rooms
      .filter(r => r.isActive)
      .map(r => {
        const block = blocks.find(b => b.id === r.blockId);
        const occ = getOccupancy(r.id);
        const dept = locToDept.get(r.locationId) ?? '—';
        const pct = r.capacity > 0 ? Math.round((occ.occupied / r.capacity) * 100) : 0;
        return { room: r, block, dept, occ, pct };
      })
      .filter(row => {
        if (deptFilter !== 'all' && row.dept !== deptFilter) return false;
        if (locFilter !== 'all' && row.room.locationId !== locFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          return (
            row.room.name.toLowerCase().includes(s) ||
            row.room.locationId.toLowerCase().includes(s) ||
            (row.block?.name ?? '').toLowerCase().includes(s) ||
            row.dept.toLowerCase().includes(s)
          );
        }
        return true;
      });
  }, [rooms, blocks, getOccupancy, locToDept, deptFilter, locFilter, search]);

  // Summary stats
  const stats = useMemo(() => {
    const totalRooms = rows.length;
    const totalBeds = rows.reduce((s, r) => s + r.room.capacity, 0);
    const occupiedBeds = rows.reduce((s, r) => s + r.occ.occupied, 0);
    const availableBeds = totalBeds - occupiedBeds;
    return { totalRooms, totalBeds, occupiedBeds, availableBeds };
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Jalsa Salana UK</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {NAV_ITEMS.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/admin/rooms'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BedDouble className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Rooms &amp; Capacity</h1>
                  <p className="text-xs text-[#4A4A4A]">Read-only overview of all rooms across all locations</p>
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors"
                >
                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                    <p className="text-xs text-[#4A4A4A]">{ROLE_LABELS[user.role]}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
                    <button
                      onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#4A4A4A]" />
                      Profile
                    </button>
                    <button
                      onClick={() => { logout(); navigate('/login'); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="p-6 space-y-5">
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Rooms',   value: stats.totalRooms,    color: 'bg-[#E8F5EE] text-[#2D5A45]' },
                { label: 'Total Beds',    value: stats.totalBeds,     color: 'bg-blue-50 text-blue-600' },
                { label: 'Occupied',      value: stats.occupiedBeds,  color: 'bg-amber-50 text-amber-600' },
                { label: 'Available',     value: stats.availableBeds, color: 'bg-green-50 text-green-600' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-[#E8E3DB] rounded-xl p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                    <BedDouble className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#1A1A1A]">{s.value}</p>
                    <p className="text-xs text-[#4A4A4A]">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-[#E8E3DB] p-4 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search rooms, blocks, locations…"
                  className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                />
              </div>
              <select
                value={deptFilter}
                onChange={e => { setDeptFilter(e.target.value); setLocFilter('all'); }}
                className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9"
              >
                <option value="all">All Departments</option>
                {deptList.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                value={locFilter}
                onChange={e => setLocFilter(e.target.value)}
                className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9"
              >
                <option value="all">All Locations</option>
                {filteredLocOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {(deptFilter !== 'all' || locFilter !== 'all' || search) && (
                <button
                  onClick={() => { setDeptFilter('all'); setLocFilter('all'); setSearch(''); }}
                  className="text-xs text-red-600 hover:text-red-800 px-2 h-9"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Rooms table */}
            <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E8E3DB] bg-[#F9F8F6] flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1A1A1A]">Room List</span>
                <span className="text-xs text-[#4A4A4A]/60">{rows.length} rooms shown</span>
              </div>
              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <BedDouble className="w-10 h-10 text-[#D4CFC7]" />
                  <p className="text-sm font-medium text-[#1A1A1A]">No rooms found</p>
                  <p className="text-xs text-[#4A4A4A]">Try adjusting your filters.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Department</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Block</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Capacity</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Occupied</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Available</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Occupancy</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {rows.map(({ room, block, dept, occ, pct }) => (
                      <tr key={room.id} className="hover:bg-[#F9F8F6]">
                        <td className="px-4 py-3">
                          <span className="text-xs bg-[#E8F5EE] text-[#2D5A45] border border-[#D6E4D9] px-2 py-0.5 rounded-full font-medium">
                            {dept}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#1A1A1A] font-medium">{room.locationId}</td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{block?.name ?? <span className="text-[#4A4A4A]/40 italic">—</span>}</td>
                        <td className="px-4 py-3 font-medium text-[#1A1A1A]">{room.name}</td>
                        <td className="px-4 py-3 text-right text-[#4A4A4A]">{room.capacity}</td>
                        <td className="px-4 py-3 text-right text-[#4A4A4A]">{occ.occupied}</td>
                        <td className="px-4 py-3 text-right text-[#4A4A4A]">{occ.available}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <OccupancyBar pct={pct} />
                            <span className="text-xs text-[#4A4A4A]">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {occ.available === 0 ? (
                            <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">Full</span>
                          ) : occ.occupied === 0 ? (
                            <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full font-medium">Empty</span>
                          ) : (
                            <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Available</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
