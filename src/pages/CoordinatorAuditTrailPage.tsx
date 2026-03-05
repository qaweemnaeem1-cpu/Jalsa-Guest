import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditTimeline } from '@/components/AuditTimeline';
import {
  LayoutDashboard, Users, Clock, ScrollText,
  ArrowLeft, ChevronDown, LogOut,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';

const COORD_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',       href: '/coordinator/dashboard' },
  { icon: Clock,           label: 'Pending Guests',  href: '/coordinator/pending' },
  { icon: Users,           label: 'Submitted Guests',href: '/coordinator/submitted' },
  { icon: ScrollText,      label: 'Audit Trail',     href: '/coordinator/audit-trail' },
];

type DateRange = 'all' | '7days' | '30days';

export default function CoordinatorAuditTrailPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const { entries } = useAuditTrail();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [guestFilter, setGuestFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  if (!user) return null;

  const pendingCount = guests.filter(g => g.status === 'pending-review').length;

  // Unique guest options from entries
  const guestOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!seen.has(e.guestId)) seen.set(e.guestId, `${e.guestName} (${e.guestReference})`);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [entries]);

  // Filtered entries for the timeline
  const filteredEntries = useMemo(() => {
    const now = new Date();
    return entries.filter(e => {
      if (guestFilter !== 'all' && e.guestId !== guestFilter) return false;
      if (dateRange === '7days') {
        const diff = (now.getTime() - new Date(e.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 7) return false;
      }
      if (dateRange === '30days') {
        const diff = (now.getTime() - new Date(e.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 30) return false;
      }
      return true;
    });
  }, [entries, guestFilter, dateRange]);

  const filterCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8] transition-all';

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Coordinator View</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {COORD_NAV.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/coordinator/audit-trail'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.href === '/coordinator/pending' && pendingCount > 0 && (
                  <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="absolute bottom-4 left-4 right-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors border border-[#D4CFC7]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Admin View
            </button>
          </div>
        </aside>

        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ScrollText className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Audit Trail</h1>
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

          <div className="p-6 max-w-4xl mx-auto space-y-5">
            {/* Filters */}
            <Card className="shadow-sm">
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                {/* Guest filter */}
                <div>
                  <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Filter by Guest</label>
                  <select
                    value={guestFilter}
                    onChange={e => setGuestFilter(e.target.value)}
                    className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                  >
                    <option value="all">All Guests</option>
                    {guestOptions.map(o => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Date range */}
                <div>
                  <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Date Range</label>
                  <div className="flex gap-1.5">
                    {([['all', 'All time'], ['7days', 'Last 7 days'], ['30days', 'Last 30 days']] as [DateRange, string][]).map(([v, l]) => (
                      <button key={v} onClick={() => setDateRange(v)} className={filterCls(dateRange === v)}>{l}</button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ScrollText className="w-5 h-5 text-[#2D5A45]" />
                  Activity Timeline
                  <span className="text-sm font-normal text-[#4A4A4A] ml-1">({filteredEntries.length} entries)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {/* We pass filtered entries via a local override — render using inline */}
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-10">
                    <ScrollText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No activity to show for selected filters.</p>
                  </div>
                ) : (
                  <AuditTimeline
                    guestId={guestFilter === 'all' ? undefined : guestFilter}
                    showGuestInfo={guestFilter === 'all'}
                    showFilters
                    allowComment={guestFilter !== 'all'}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
