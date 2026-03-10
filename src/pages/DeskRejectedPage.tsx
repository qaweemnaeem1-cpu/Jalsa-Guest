import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useCoordinators } from '@/hooks/useCoordinators';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuestViewModal } from '@/components/GuestViewModal';
import {
  LayoutDashboard, ClipboardList, CheckSquare, MessageSquare, XCircle,
  Search, ChevronDown, LogOut, Eye,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel } from '@/components/ProfileDialog';

const DESK_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
  { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
  { icon: XCircle,         label: 'Rejected Guests',    href: '/desk/rejected' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
];

function appealBadge(status?: string) {
  if (!status || status === 'none') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">No Appeal</span>;
  }
  if (status === 'pending') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Pending Appeal</span>;
  }
  if (status === 'overturned') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">Overturned</span>;
  }
  if (status === 'denied') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">Denied</span>;
  }
  return null;
}

export default function DeskRejectedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const { coordinators } = useCoordinators();

  const [search, setSearch] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [viewGuestId, setViewGuestId] = useState<string | null>(null);

  if (!user) return null;

  const assignedCountries = user.assignedCountries || [];

  const reviewCount = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) && g.status === 'Awaiting Review'
    ).length,
    [guests, assignedCountries]
  );

  const rejectedGuests = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) && g.status === 'Rejected'
    ),
    [guests, assignedCountries]
  );

  const filtered = useMemo(() => {
    if (!search) return rejectedGuests;
    const s = search.toLowerCase();
    return rejectedGuests.filter(g =>
      g.fullName.toLowerCase().includes(s) ||
      g.referenceNumber.toLowerCase().includes(s) ||
      g.country.toLowerCase().includes(s)
    );
  }, [rejectedGuests, search]);

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
                  item.href === '/desk/rejected'
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
                {item.href === '/desk/rejected' && rejectedGuests.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {rejectedGuests.length}
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
                <XCircle className="w-5 h-5 text-red-500" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Rejected Guests</h1>
                {rejectedGuests.length > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    {rejectedGuests.length} rejected
                  </Badge>
                )}
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
            {/* Search */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, reference, country..."
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <XCircle className="w-5 h-5 text-red-500" />
                  Rejected Guests
                  <span className="text-sm font-normal text-[#4A4A4A] ml-1">({filtered.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <XCircle className="w-12 h-12 text-gray-300" />
                    <p className="text-lg font-medium text-[#1A1A1A]">
                      {rejectedGuests.length === 0 ? 'No rejected guests' : 'No guests match your search.'}
                    </p>
                    {rejectedGuests.length === 0 && (
                      <p className="text-sm text-[#4A4A4A]">No guests from your assigned countries have been rejected.</p>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F9F8F6]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Coordinator</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Rejection Reason</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Appeal Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">View</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {filtered.map(g => {
                          const coord = coordinators.find(c => c.country === g.country);
                          return (
                            <tr key={g.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                              <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{coord?.name ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A] max-w-xs">
                                {g.rejectionReason
                                  ? <span title={g.rejectionReason} className="truncate block max-w-[200px]">
                                      {g.rejectionReason.slice(0, 60)}{g.rejectionReason.length > 60 ? '…' : ''}
                                    </span>
                                  : <span className="text-[#4A4A4A]/40">—</span>}
                              </td>
                              <td className="px-4 py-3">{appealBadge(g.appealStatus)}</td>
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
