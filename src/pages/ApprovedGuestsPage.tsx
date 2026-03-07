import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuestViewModal } from '@/components/GuestViewModal';
import {
  LayoutDashboard, ClipboardList, CheckSquare,
  Search, ChevronDown, LogOut, Eye, CheckCircle, MessageSquare,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import type { Guest } from '@/types';

const DESK_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
  { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
];

export default function ApprovedGuestsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();

  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [viewGuestId, setViewGuestId] = useState<string | null>(null);

  if (!user) return null;

  const assignedCountries = user.assignedCountries || [];

  // Guests from DI's countries that are approved/accommodated
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
    if (status === 'Approved')     return 'bg-green-50 text-green-700 border-green-200';
    if (status === 'Accommodated') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
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
                        {filtered.map(g => (
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
                              <Badge variant="outline" className={`text-xs ${statusBadge(g.status)}`}>
                                {GUEST_STATUS_LABELS[g.status] ?? g.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-[#4A4A4A]">{getApprovedDate(g)}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setViewGuestId(g.id)}
                                title="View details"
                                className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
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
