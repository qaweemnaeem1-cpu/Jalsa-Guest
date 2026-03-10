import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuestViewModal } from '@/components/GuestViewModal';
import {
  LayoutDashboard, ClipboardList, CheckSquare, MessageSquare, XCircle,
  Search, ChevronDown, LogOut, Eye, Pencil,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel } from '@/components/ProfileDialog';
import type { GuestStatus } from '@/types';

const DESK_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
  { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
  { icon: XCircle,         label: 'Rejected Guests',    href: '/desk/rejected' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
];

type StatusFilter = 'all' | 'Approved' | 'Accommodated';

const STATUS_CHIPS: { label: string; value: StatusFilter }[] = [
  { label: 'All',          value: 'all' },
  { label: 'Approved',     value: 'Approved' },
  { label: 'Accommodated', value: 'Accommodated' },
];

function statusBadgeCls(status: string): string {
  switch (status) {
    case 'Approved':         return 'bg-green-50 text-green-700 border-green-200';
    case 'Accommodated':     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Rejected':         return 'bg-red-50 text-red-700 border-red-200';
    case 'Needs Correction': return 'bg-orange-50 text-orange-700 border-orange-200';
    default:                 return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

const PAGE_SIZE = 15;

export default function DeskProcessedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [editGuestId, setEditGuestId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  if (!user) return null;

  const assignedCountries = user.assignedCountries || [];

  const reviewCount = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) && g.status === 'Awaiting Review'
    ).length,
    [guests, assignedCountries]
  );

  const rejectedCount = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) && g.status === 'Rejected'
    ).length,
    [guests, assignedCountries]
  );

  const processedGuests = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) &&
      (g.status === 'Approved' || g.status === 'Accommodated')
    ),
    [guests, assignedCountries]
  );

  const countriesWithGuests = useMemo(() => {
    const s = new Set(processedGuests.map(g => g.country));
    return Array.from(s).sort();
  }, [processedGuests]);

  const filtered = useMemo(() => {
    setPage(1);
    return processedGuests.filter(g => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (countryFilter !== 'all' && g.country !== countryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!g.fullName.toLowerCase().includes(s) &&
            !g.referenceNumber.toLowerCase().includes(s) &&
            !g.country.toLowerCase().includes(s)) return false;
      }
      return true;
    }).sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedGuests, statusFilter, countryFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const chipCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8] transition-all';

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
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
                {item.href === '/desk/rejected' && rejectedCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {rejectedCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <SidebarUserFooter />
        </aside>

        <main className="flex-1 ml-64">
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckSquare className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Processed Guests</h1>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {filtered.length} shown
                </Badge>
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
                    <p className="text-xs text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
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
            {/* Filters */}
            <Card className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
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
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_CHIPS.map(chip => (
                    <button
                      key={chip.value}
                      onClick={() => setStatusFilter(chip.value)}
                      className={chipCls(statusFilter === chip.value)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
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
                    <CheckSquare className="w-12 h-12 text-gray-300" />
                    <p className="text-lg font-medium text-[#1A1A1A]">No processed guests found</p>
                    <p className="text-sm text-[#4A4A4A]">
                      {processedGuests.length === 0
                        ? 'No guests have been processed yet.'
                        : 'No guests match the selected filters.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-[#F9F8F6]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Submitted</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {paginated.map(g => (
                            <tr key={g.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                              <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200 capitalize">
                                  {g.guestType}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={`text-xs ${statusBadgeCls(g.status)}`}>
                                  {GUEST_STATUS_LABELS[g.status] ?? g.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.submittedAt ?? '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={e => { e.stopPropagation(); setViewGuestId(g.id); }}
                                    title="View details"
                                    className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setEditGuestId(g.id); }}
                                    title="Edit guest"
                                    className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DB] bg-[#F9F8F6]">
                        <span className="text-xs text-[#4A4A4A]">
                          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-white disabled:opacity-40 transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs text-[#4A4A4A] px-2">Page {page} of {totalPages}</span>
                          <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-white disabled:opacity-40 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
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

      <GuestViewModal
        guest={guests.find(g => g.id === editGuestId) ?? null}
        open={!!editGuestId}
        onClose={() => setEditGuestId(null)}
        isEditMode={true}
      />
    </div>
  );
}
