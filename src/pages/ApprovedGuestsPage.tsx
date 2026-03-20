import { useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import { useDepartments } from '@/hooks/useDepartments';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuestViewModal } from '@/components/GuestViewModal';
import { FamilyStatusCell } from '@/components/FamilyStatusCell';
import { DepartmentSelect } from '@/components/DepartmentSelect';
import { toast } from 'sonner';
import {
  LayoutDashboard, ClipboardList, CheckSquare,
  Search, ChevronDown, LogOut, Eye, CheckCircle, MessageSquare, ChevronRight,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import type { Guest } from '@/types';
import { DESK_NAV } from '@/lib/navItems';

export default function ApprovedGuestsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, assignFamilyMemberDepartment, updateGuest } = useGuests();
  const { addEntry } = useAuditTrail();
  const { getDeptBadgeCls } = useDepartments();

  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  if (!user) return null;

  const assignedCountries = user.assignedCountries || [];

  const approvedGuests = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) &&
      (g.status === 'Approved' || g.status === 'Accommodated')
    ),
    [guests, assignedCountries]
  );

  const approvedCount = approvedGuests.filter(g => g.status === 'Approved').length;
  const accommodatedCount = approvedGuests.filter(g => g.status === 'Accommodated').length;

  const reviewCount = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) &&
      (g.status === 'Awaiting Review' || g.status === 'Needs Correction')
    ).length,
    [guests, assignedCountries]
  );

  const countriesWithGuests = useMemo(() => {
    const s = new Set(approvedGuests.map(g => g.country));
    return Array.from(s).sort();
  }, [approvedGuests]);

  const getApprovedDate = (guest: Guest): string => {
    const event = guest.statusHistory?.find(sh => sh.status === 'Approved');
    if (!event) return '—';
    return new Date(event.changedAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const filtered = useMemo(() => {
    return approvedGuests
      .filter(g => {
        if (countryFilter !== 'all' && g.country !== countryFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!g.fullName.toLowerCase().includes(s) &&
              !g.referenceNumber.toLowerCase().includes(s) &&
              !g.country.toLowerCase().includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = a.statusHistory?.find(sh => sh.status === 'Approved')?.changedAt ?? '';
        const dateB = b.statusHistory?.find(sh => sh.status === 'Approved')?.changedAt ?? '';
        return dateB.localeCompare(dateA);
      });
  }, [approvedGuests, countryFilter, search]);

  const statusBadge = (status: string) => {
    if (status === 'Approved')         return 'bg-green-50 text-green-700 border-green-200';
    if (status === 'Accommodated')     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Needs Correction') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (status === 'Rejected')         return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleMemberDeptAssign = (g: Guest, memberId: string | null, memberName: string, dept: string) => {
    if (memberId === null) {
      updateGuest(g.id, {
        assignedDepartment: dept,
        assignedDepartmentAt: new Date().toISOString(),
        assignedDepartmentBy: user.id,
        assignedDepartmentByName: user.name,
      });
    } else {
      assignFamilyMemberDepartment(g.id, memberId, dept);
    }
    addEntry({
      guestId: g.id, guestName: g.fullName, guestReference: g.referenceNumber,
      type: 'assignment', action: memberId ? 'Member department assigned' : 'Department assigned',
      details: `${memberName} assigned to ${dept}`, newValue: dept,
      createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
      createdAt: new Date().toISOString(),
    });
    toast.success(`${memberName} assigned to ${dept}`);
  };

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
                <p className="text-xs text-[#4A4A4A]">Desk Incharge View</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {DESK_NAV.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/desk/processed'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.href === '/desk/review' && reviewCount > 0 && (
                  <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {reviewCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 ml-64">
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckSquare className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Approved Guests</h1>
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

          <div className="p-6 max-w-7xl mx-auto space-y-5">
            {/* Stats summary bar */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white border border-[#E8E3DB] rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#1A1A1A]">{approvedCount}</p>
                  <p className="text-xs text-[#4A4A4A]">Approved</p>
                </div>
              </div>
              <div className="bg-white border border-[#E8E3DB] rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#1A1A1A]">{accommodatedCount}</p>
                  <p className="text-xs text-[#4A4A4A]">Accommodated</p>
                </div>
              </div>
              <div className="bg-white border border-[#E8E3DB] rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-[#E8F5EE] rounded-lg flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-[#2D5A45]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#1A1A1A]">{approvedCount + accommodatedCount}</p>
                  <p className="text-xs text-[#4A4A4A]">Total Processed</p>
                </div>
              </div>
            </div>

            {/* Filter bar */}
            <Card className="shadow-sm">
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search guests..."
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                  />
                </div>
                <select
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value)}
                  className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9"
                >
                  <option value="all">All Countries</option>
                  {countriesWithGuests.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckSquare className="w-5 h-5 text-[#2D5A45]" />
                  Processed Guests
                  <span className="text-sm font-normal text-[#4A4A4A] ml-1">({filtered.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <CheckCircle className="w-12 h-12 text-gray-300" />
                    <p className="text-lg font-medium text-[#1A1A1A]">No approved guests found</p>
                    <p className="text-sm text-[#4A4A4A]">
                      {approvedGuests.length === 0
                        ? 'No guests have been approved yet.'
                        : 'No guests match the selected filters.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F9F8F6]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Approved Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {filtered.map(g => {
                          const isFamily = g.guestType === 'family' && g.familyMembers.length > 0;
                          const isExpanded = expandedRows.has(g.id);

                          const drawerMembers = [
                            { memberId: null as string | null, name: g.fullName, relationship: 'Head',
                              status: g.status as string, dept: g.assignedDepartment },
                            ...g.familyMembers.map(m => ({
                              memberId: m.id, name: m.name, relationship: m.relationship,
                              status: (m.status ?? g.status) as string, dept: m.assignedDepartment,
                            })),
                          ];

                          return (
                            <Fragment key={g.id}>
                              <tr
                                className={`hover:bg-[#FAFAFA] ${isFamily ? 'cursor-pointer select-none' : ''}`}
                                onClick={isFamily ? () => toggleRow(g.id) : undefined}
                              >
                                <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                                <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                                  <div className="flex items-center gap-1.5">
                                    {g.fullName}
                                    {isFamily && (
                                      isExpanded
                                        ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200 capitalize">
                                    {g.guestType}{isFamily && ` (${g.familyMembers.length + 1})`}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <FamilyStatusCell guest={g} />
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">{getApprovedDate(g)}</td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => setViewGuestId(g.id)}
                                    title="View details"
                                    className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>

                              {/* ── Family member drawer (read-only + dept assignment) ── */}
                              {isFamily && isExpanded && (
                                <tr>
                                  <td colSpan={7} className="p-0 bg-[#F9F8F6] border-b border-[#E8E3DB]">
                                    <div className="px-6 py-4 space-y-2">
                                      <p className="text-[10px] font-semibold text-[#4A4A4A] uppercase tracking-widest mb-3">
                                        Family Members · {drawerMembers.length} total
                                      </p>
                                      {drawerMembers.map((row, idx) => (
                                        <div
                                          key={row.memberId ?? 'head'}
                                          className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white border border-[#E8E3DB]"
                                        >
                                          {/* Number */}
                                          <span className="w-6 h-6 bg-[#2D5A45] rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                          </span>
                                          {/* Avatar */}
                                          <div className="w-7 h-7 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0">
                                            {row.name.charAt(0)}
                                          </div>
                                          {/* Name + relationship */}
                                          <div className="flex items-center gap-1.5 min-w-0 w-44 shrink-0">
                                            <span className="font-medium text-sm text-[#1A1A1A] truncate">{row.name}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize shrink-0">
                                              {row.relationship}
                                            </span>
                                          </div>
                                          {/* Status badge */}
                                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${statusBadge(row.status)}`}>
                                            {GUEST_STATUS_LABELS[row.status as keyof typeof GUEST_STATUS_LABELS] ?? row.status}
                                          </Badge>
                                          {/* Department — dropdown if unassigned, pill if assigned */}
                                          <div className="ml-auto shrink-0">
                                            {row.dept ? (
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getDeptBadgeCls(row.dept)}`}>
                                                {row.dept}
                                              </span>
                                            ) : (
                                              <DepartmentSelect
                                                value=""
                                                onValueChange={v => { if (v) handleMemberDeptAssign(g, row.memberId, row.name, v); }}
                                                placeholder="Assign dept..."
                                                className="text-[10px] min-w-[120px]"
                                              />
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <GuestViewModal
        guest={guests.find(g => g.id === viewGuestId) ?? null}
        open={!!viewGuestId}
        onClose={() => setViewGuestId(null)}
      />
    </div>
  );
}
