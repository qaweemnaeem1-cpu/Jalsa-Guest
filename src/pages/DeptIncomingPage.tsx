import { useMemo, useState } from 'react';
import { Inbox, Eye, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { useDepartments } from '@/hooks/useDepartments';
import { GuestViewModal } from '@/components/GuestViewModal';
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

export default function DeptIncomingPage() {
  const { user } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { departments } = useDepartments();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<{ guestId: string; location: string } | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({});

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const incomingGuests = useMemo(
    () => guests.filter(g => g.assignedDepartment === dept && !g.placedLocation),
    [guests, dept],
  );

  const viewGuest = useMemo(
    () => guests.find(g => g.id === viewGuestId) ?? null,
    [guests, viewGuestId],
  );

  const handleSelectLocation = (guestId: string, loc: string) => {
    setSelectedLocations(prev => ({ ...prev, [guestId]: loc }));
  };

  const handleConfirmPlacement = () => {
    if (!pendingPlacement || !user) return;
    updateGuest(pendingPlacement.guestId, {
      placedLocation: pendingPlacement.location,
      placedAt: new Date().toISOString(),
      placedBy: user.id,
    });
    toast.success(`Guest placed at ${pendingPlacement.location}`);
    setSelectedLocations(prev => {
      const next = { ...prev };
      delete next[pendingPlacement.guestId];
      return next;
    });
    setPendingPlacement(null);
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
                <Inbox className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Incoming Guests</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Guests assigned to {dept} — awaiting placement</p>
                </div>
              </div>
              {incomingGuests.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full">
                  {incomingGuests.length} unplaced
                </span>
              )}
            </div>
          </header>

          <div className="p-6">
            {incomingGuests.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <Inbox className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-medium text-[#1A1A1A] mb-1">All guests placed</h2>
                <p className="text-sm text-[#4A4A4A]">No incoming guests awaiting placement.</p>
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
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Date Assigned</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Assign Location</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {incomingGuests.map(g => {
                      const selected = selectedLocations[g.id] ?? '';
                      return (
                        <tr key={g.id} className="hover:bg-[#F9F8F6]">
                          <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                          <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                          <td className="px-4 py-3 text-[#4A4A4A]">{g.country}</td>
                          <td className="px-4 py-3 text-[#4A4A4A] capitalize">{g.guestType}</td>
                          <td className="px-4 py-3 text-[#4A4A4A]">
                            {g.assignedDepartmentAt
                              ? new Date(g.assignedDepartmentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={selected}
                              onChange={e => handleSelectLocation(g.id, e.target.value)}
                              className="border border-[#D4CFC7] rounded-lg px-2 py-1.5 text-xs text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] min-w-[130px]"
                            >
                              <option value="">Select location…</option>
                              {locations.map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setViewGuestId(g.id)}
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors"
                                title="View guest"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (selected) setPendingPlacement({ guestId: g.id, location: selected });
                                  else toast.error('Please select a location first');
                                }}
                                disabled={!selected}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Place
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

      {/* View modal */}
      <GuestViewModal
        guest={viewGuest}
        open={!!viewGuestId}
        onClose={() => setViewGuestId(null)}
      />

      {/* Placement confirmation */}
      <AlertDialog open={!!pendingPlacement} onOpenChange={o => { if (!o) setPendingPlacement(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Placement</AlertDialogTitle>
            <AlertDialogDescription>
              Assign this guest to <strong>{pendingPlacement?.location}</strong>? This will move them to the Placed list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPlacement}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              Confirm Placement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
