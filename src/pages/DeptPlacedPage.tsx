import { useMemo, useState } from 'react';
import { CheckCircle, Eye } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { useDepartments } from '@/hooks/useDepartments';
import { GuestViewModal } from '@/components/GuestViewModal';

export default function DeptPlacedPage() {
  const { user } = useAuth();
  const { guests } = useGuests();
  const { departments, getLocPillCls } = useDepartments();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [filterLocation, setFilterLocation] = useState<string>('');

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const placedGuests = useMemo(
    () => guests.filter(g => g.assignedDepartment === dept && !!g.placedLocation),
    [guests, dept],
  );

  const filtered = useMemo(
    () => filterLocation ? placedGuests.filter(g => g.placedLocation === filterLocation) : placedGuests,
    [placedGuests, filterLocation],
  );

  const viewGuest = useMemo(
    () => guests.find(g => g.id === viewGuestId) ?? null,
    [guests, viewGuestId],
  );

  const getLocationPill = (loc: string) => getLocPillCls(dept, loc);

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
              <div className="flex items-center gap-3">
                {locations.length > 0 && (
                  <select
                    value={filterLocation}
                    onChange={e => setFilterLocation(e.target.value)}
                    className="border border-[#D4CFC7] rounded-lg px-3 py-1.5 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
                  >
                    <option value="">All locations</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                )}
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
                  {filtered.length} placed
                </span>
              </div>
            </div>
          </header>

          <div className="p-6">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-medium text-[#1A1A1A] mb-1">No placed guests</h2>
                <p className="text-sm text-[#4A4A4A]">
                  {filterLocation ? `No guests placed at ${filterLocation}.` : 'No guests have been placed yet.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Date Placed</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filtered.map(g => (
                      <tr key={g.id} className="hover:bg-[#F9F8F6]">
                        <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                        <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{g.country}</td>
                        <td className="px-4 py-3 text-[#4A4A4A] capitalize">{g.guestType}</td>
                        <td className="px-4 py-3">
                          {g.placedLocation && (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLocationPill(g.placedLocation)}`}>
                              {g.placedLocation}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">
                          {g.placedAt
                            ? new Date(g.placedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setViewGuestId(g.id)}
                            className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors"
                            title="View guest"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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
