import { Fragment, useMemo, useState } from 'react';
import { Inbox, Eye, Check, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { useDepartments } from '@/hooks/useDepartments';
import { GuestViewModal } from '@/components/GuestViewModal';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { Input } from '@/components/ui/input';
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

// A flattened row representing a single person (head or family member)
interface PersonRow {
  rowKey: string;
  guestId: string;
  memberId: string | null; // null = the head guest itself
  name: string;
  country: string;
  referenceNumber: string;
  relationship: string;
  isFamily: boolean;
  familyLastName: string;
  familyGroupId: string; // = guestId, used to cluster siblings
  familyAllMembers: FamilyMemberInfo[];
  assignedDepartmentAt?: string;
  status: string;
}

function buildFamilyMemberList(g: Guest): FamilyMemberInfo[] {
  const head: FamilyMemberInfo = {
    name: g.fullName,
    relationship: 'Head',
    status: g.status,
    assignedDepartment: g.assignedDepartment,
    placedLocation: g.placedLocation,
  };
  const rest: FamilyMemberInfo[] = (g.familyMembers ?? []).map(m => ({
    name: m.name,
    relationship: m.relationship,
    status: m.status ?? g.status,
    assignedDepartment: m.assignedDepartment,
    placedLocation: m.placedLocation,
  }));
  return [head, ...rest];
}

function buildRows(guests: Guest[], dept: string): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const g of guests) {
    const isFamily = g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0;
    const lastName = g.fullName.split(' ').pop() ?? g.fullName;
    const familyAllMembers = isFamily ? buildFamilyMemberList(g) : [];

    // Head guest
    if (g.assignedDepartment === dept && !g.placedLocation) {
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
        familyGroupId: g.id,
        familyAllMembers,
        assignedDepartmentAt: g.assignedDepartmentAt,
        status: g.status,
      });
    }

    // Family member rows
    if (isFamily) {
      for (const m of g.familyMembers ?? []) {
        if (m.assignedDepartment === dept && !m.placedLocation) {
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
            familyGroupId: g.id,
            familyAllMembers,
            assignedDepartmentAt: m.assignedDepartmentAt,
            status: m.status ?? g.status,
          });
        }
      }
    }
  }
  return rows;
}

interface PendingPlacement {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  name: string;
  location: string;
}

interface BulkPending {
  guestId: string;
  location: string;
  rows: PersonRow[];
}

export default function DeptIncomingPage() {
  const { user } = useAuth();
  const { guests, updateGuest, placeFamilyMember } = useGuests();
  const { departments } = useDepartments();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [bulkPending, setBulkPending] = useState<BulkPending | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({});
  const [bulkLocations, setBulkLocations] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const allRows = useMemo(() => buildRows(guests, dept), [guests, dept]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.country.toLowerCase().includes(q) ||
      r.referenceNumber.toLowerCase().includes(q) ||
      r.familyLastName.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  // Precompute group metadata for bulk banner
  const groupMeta = useMemo(() => {
    const counts = new Map<string, number>();
    const firstRowKey = new Map<string, string>();
    for (const r of filteredRows) {
      if (!r.isFamily) continue;
      const prev = counts.get(r.familyGroupId) ?? 0;
      counts.set(r.familyGroupId, prev + 1);
      if (prev === 0) firstRowKey.set(r.familyGroupId, r.rowKey);
    }
    return { counts, firstRowKey };
  }, [filteredRows]);

  const viewGuest = useMemo(
    () => guests.find(g => g.id === viewGuestId) ?? null,
    [guests, viewGuestId],
  );

  const handleConfirmPlacement = () => {
    if (!pendingPlacement || !user) return;
    const { guestId, memberId, location, name } = pendingPlacement;
    if (memberId) {
      placeFamilyMember(guestId, memberId, location);
    } else {
      updateGuest(guestId, {
        placedLocation: location,
        placedAt: new Date().toISOString(),
        placedBy: user.id,
      });
    }
    toast.success(`${name} placed at ${location}`);
    setSelectedLocations(prev => {
      const next = { ...prev };
      delete next[pendingPlacement.rowKey];
      return next;
    });
    setPendingPlacement(null);
  };

  const handleConfirmBulk = () => {
    if (!bulkPending || !user) return;
    const { guestId, location, rows } = bulkPending;
    for (const r of rows) {
      if (r.memberId) {
        placeFamilyMember(guestId, r.memberId, location);
      } else {
        updateGuest(guestId, {
          placedLocation: location,
          placedAt: new Date().toISOString(),
          placedBy: user.id,
        });
      }
    }
    toast.success(`${rows.length} members placed at ${location}`);
    setBulkLocations(prev => {
      const next = { ...prev };
      delete next[guestId];
      return next;
    });
    setBulkPending(null);
  };

  const placeRow = (row: PersonRow) => {
    const selected = selectedLocations[row.rowKey] ?? '';
    if (!selected) { toast.error('Please select a location first'); return; }
    setPendingPlacement({ rowKey: row.rowKey, guestId: row.guestId, memberId: row.memberId, name: row.name, location: selected });
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
              {allRows.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full border border-amber-200">
                  {allRows.length} unplaced
                </span>
              )}
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
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">All guests placed</h2>
                <p className="text-sm text-[#4A4A4A]">No incoming guests awaiting placement.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-10 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">No results found</p>
                <p className="text-xs text-[#4A4A4A]">Try a different name, country, or reference number.</p>
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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date Assigned</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Assign Location</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => {
                      const selected = selectedLocations[row.rowKey] ?? '';
                      const isFirstInGroup =
                        row.isFamily &&
                        groupMeta.firstRowKey.get(row.familyGroupId) === row.rowKey;
                      const groupCount = groupMeta.counts.get(row.familyGroupId) ?? 0;
                      const showBulkBanner = isFirstInGroup && groupCount > 1;
                      const bulkLoc = bulkLocations[row.familyGroupId] ?? '';

                      // Collect sibling rows in this group for bulk action
                      const siblingRows = showBulkBanner
                        ? filteredRows.filter(r => r.familyGroupId === row.familyGroupId)
                        : [];

                      return (
                        <Fragment key={row.rowKey}>
                          {/* Bulk assignment banner — rendered before first sibling row */}
                          {showBulkBanner && (
                            <tr className="bg-indigo-50 border-b border-indigo-100">
                              <td colSpan={7} className="px-4 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    <span className="text-xs text-indigo-700 font-medium">
                                      {groupCount} members from {row.familyLastName} Family — assign all to the same location?
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={bulkLoc}
                                      onChange={e => setBulkLocations(prev => ({ ...prev, [row.familyGroupId]: e.target.value }))}
                                      className="border border-indigo-200 rounded-lg px-2 py-1 text-xs text-[#1A1A1A] bg-white focus:outline-none focus:border-indigo-400 min-w-[130px]"
                                    >
                                      <option value="">Select location…</option>
                                      {locations.map(loc => (
                                        <option key={loc} value={loc}>{loc}</option>
                                      ))}
                                    </select>
                                    <button
                                      disabled={!bulkLoc}
                                      onClick={() => {
                                        if (bulkLoc) setBulkPending({ guestId: row.familyGroupId, location: bulkLoc, rows: siblingRows });
                                        else toast.error('Please select a location first');
                                      }}
                                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Check className="w-3 h-3" />
                                      Assign All
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Person row */}
                          <tr className="hover:bg-[#F9F8F6]">
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
                            <td className="px-4 py-3">
                              <span className="capitalize text-[#4A4A4A]">{row.relationship}</span>
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A]">
                              {row.assignedDepartmentAt
                                ? new Date(row.assignedDepartmentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={selected}
                                onChange={e => setSelectedLocations(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
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
                                  onClick={() => placeRow(row)}
                                  disabled={!selected}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Place
                                </button>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
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

      {/* Individual placement confirmation */}
      <AlertDialog open={!!pendingPlacement} onOpenChange={o => { if (!o) setPendingPlacement(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Placement</AlertDialogTitle>
            <AlertDialogDescription>
              Assign <strong>{pendingPlacement?.name}</strong> to <strong>{pendingPlacement?.location}</strong>?
              This will move them to the Placed list.
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

      {/* Bulk placement confirmation */}
      <AlertDialog open={!!bulkPending} onOpenChange={o => { if (!o) setBulkPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign All Family Members</AlertDialogTitle>
            <AlertDialogDescription>
              Assign all <strong>{bulkPending?.rows.length} members</strong> to{' '}
              <strong>{bulkPending?.location}</strong>? Each will be moved to the Placed list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulk}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Assign All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
