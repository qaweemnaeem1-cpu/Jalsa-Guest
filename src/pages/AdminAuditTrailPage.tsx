import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useUsers } from '@/hooks/useUsers';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import { sanitizeComment } from '@/hooks/useAuditTrail';
import type { AuditEntry } from '@/hooks/useAuditTrail';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  FileText, Users, Briefcase, Globe, ScrollText,
  ChevronDown, LogOut, MessageSquare, Send, Search,
  Clock,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import type { Guest } from '@/types';

const NAV_ITEMS = [
  { icon: FileText,   label: 'Dashboard',         href: '/dashboard' },
  { icon: Users,      label: 'Guests',             href: '/guests' },
  { icon: Users,      label: 'Users',              href: '/users' },
  { icon: Briefcase,  label: 'Designation List',   href: '/designations' },
  { icon: Globe,      label: 'Countries & Depts',  href: '/countries-departments' },
  { icon: ScrollText, label: 'Audit Trail',        href: '/admin/audit-trail' },
];

type FilterType = 'all' | 'comments' | 'status_changes' | 'edits';
type DateRange = 'all' | '7days' | '30days';

const TYPE_MAP: Record<string, string> = {
  comments: 'comment',
  status_changes: 'status_change',
  edits: 'field_edit',
};

const TYPE_DOT: Record<string, string> = {
  submission: 'bg-blue-400',
  status_change: 'bg-amber-400',
  field_edit: 'bg-gray-400',
  assignment: 'bg-purple-400',
  comment: 'bg-[#2D5A45]',
};

const ROLE_BADGE_CLS: Record<string, string> = {
  'super-admin': 'bg-red-50 text-red-700 border-red-200',
  'desk-in-charge': 'bg-blue-50 text-blue-700 border-blue-200',
  'coordinator': 'bg-[#E8F5EE] text-[#2D5A45] border-[#D6E4D9]',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffD = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  if (diffD <= 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

interface TimelineEntryProps {
  entry: AuditEntry;
  guest: Guest | undefined;
}

function TimelineEntry({ entry, guest }: TimelineEntryProps) {
  const isComment = entry.type === 'comment';
  const isUnread = !entry.isRead;
  const role = entry.createdBy.role;

  return (
    <div className="relative pl-8">
      <span
        className={`absolute left-2 top-3.5 w-3 h-3 rounded-full border-2 border-white shadow z-10 ${TYPE_DOT[entry.type] ?? 'bg-gray-400'}`}
      />

      {/* Guest info + country badge */}
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {guest && (
          <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-100">
            {guest.country}
          </span>
        )}
        <p className="text-xs text-[#4A4A4A] font-medium">
          {entry.guestName}
          <span className="font-normal text-[#4A4A4A]/50 ml-1">({entry.guestReference})</span>
        </p>
      </div>

      {isComment ? (
        <div
          className={`bg-white rounded-lg px-4 py-3 shadow-sm border ${
            isUnread ? 'border-l-4 border-l-blue-400 border-blue-200 bg-blue-50/30' : 'border-[#D6E4D9]'
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-full bg-[#2D5A45] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {getInitials(entry.createdBy.name)}
            </div>
            <span className="text-sm font-medium text-[#1A1A1A]">{entry.createdBy.name}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                ROLE_BADGE_CLS[role] ?? 'bg-gray-50 text-gray-600 border-gray-200'
              }`}
            >
              {ROLE_LABELS[role] ?? role}
            </span>
            {isUnread && (
              <span className="w-2 h-2 bg-red-500 rounded-full shrink-0" title="Unread" />
            )}
            <span className="text-xs text-[#4A4A4A]/60 ml-auto">{formatTime(entry.createdAt)}</span>
          </div>
          <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap break-words">
            {entry.comment}
          </p>
        </div>
      ) : (
        <div
          className={`bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 ${
            isUnread ? 'border-l-4 border-l-blue-400 bg-blue-50/20' : ''
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#1A1A1A]">{entry.action}</span>
            {entry.details && (
              <span className="text-xs text-[#4A4A4A] bg-white border border-[#E8E3DB] px-2 py-0.5 rounded font-mono">
                {entry.details}
              </span>
            )}
            <span className="text-xs text-[#4A4A4A]/60 ml-auto">{formatTime(entry.createdAt)}</span>
          </div>
          <p className="text-xs text-[#4A4A4A]/70 mt-1">By: {entry.createdBy.name}</p>
        </div>
      )}
    </div>
  );
}

export default function AdminAuditTrailPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const { users } = useUsers();
  const { entries, addComment } = useAuditTrail();

  // Filters
  const [countryFilter, setCountryFilter] = useState('all');
  const [diFilter, setDiFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<DateRange>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');

  // Comment input
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [commentText, setCommentText] = useState('');

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (!user) return null;

  // Guest lookup map
  const guestMap = useMemo(() => {
    const map = new Map<string, Guest>();
    guests.forEach(g => map.set(g.id, g));
    return map;
  }, [guests]);

  // Desk incharges for filter
  const diUsers = useMemo(() =>
    users.filter(u => u.userType === 'desk-in-charge'),
    [users]
  );

  // All countries from guests
  const allCountries = useMemo(() => {
    const s = new Set<string>();
    guests.forEach(g => s.add(g.country));
    return Array.from(s).sort();
  }, [guests]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    const now = Date.now();
    return [...entries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter(e => {
        const guest = guestMap.get(e.guestId);

        if (countryFilter !== 'all') {
          if (!guest || guest.country !== countryFilter) return false;
        }
        if (diFilter !== 'all') {
          const di = diUsers.find(u => u.id === diFilter);
          if (!di || !guest || !(di.assignedCountries ?? []).includes(guest.country)) return false;
        }
        if (typeFilter !== 'all' && e.type !== TYPE_MAP[typeFilter]) return false;
        if (dateFilter !== 'all') {
          const diffDays = (now - new Date(e.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          if (dateFilter === '7days' && diffDays > 7) return false;
          if (dateFilter === '30days' && diffDays > 30) return false;
        }
        if (unreadOnly && e.isRead) return false;
        if (search) {
          const s = search.toLowerCase();
          if (
            !e.guestName.toLowerCase().includes(s) &&
            !e.guestReference.toLowerCase().includes(s) &&
            !(e.comment ?? '').toLowerCase().includes(s) &&
            !e.action.toLowerCase().includes(s)
          ) return false;
        }
        return true;
      });
  }, [entries, guestMap, countryFilter, diFilter, typeFilter, dateFilter, unreadOnly, search, diUsers]);

  // Summary stats
  const totalUnread = useMemo(() =>
    entries.filter(e => e.type === 'comment' && !e.isRead).length,
    [entries]
  );
  const totalComments = useMemo(() =>
    entries.filter(e => e.type === 'comment').length,
    [entries]
  );
  const needsReviewTotal = useMemo(() =>
    guests.filter(g => g.status === 'pending-review').length,
    [guests]
  );

  const handleSendComment = () => {
    const guest = guestMap.get(selectedGuestId);
    if (!guest) return;
    const safe = sanitizeComment(commentText);
    if (!safe) return;
    addComment({
      guestId: guest.id,
      guestName: guest.fullName,
      guestReference: guest.referenceNumber,
      comment: safe,
      createdBy: { id: user.id, name: user.name, role: 'super-admin' },
    });
    setCommentText('');
    setSelectedGuestId('');
    toast.success('Comment added');
  };

  const chipCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8] transition-all';

  const clearFilters = () => {
    setCountryFilter('all'); setDiFilter('all');
    setTypeFilter('all'); setDateFilter('all');
    setUnreadOnly(false); setSearch('');
  };
  const hasActiveFilters = countryFilter !== 'all' || diFilter !== 'all' ||
    typeFilter !== 'all' || dateFilter !== 'all' || unreadOnly || search !== '';

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
                  item.href === '/admin/audit-trail'
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
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ScrollText className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Audit Trail</h1>
                  <p className="text-xs text-[#4A4A4A]">Complete activity log across all countries</p>
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

          <div className="p-6 max-w-5xl mx-auto space-y-5">

            {/* Summary Bar */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white border border-[#E8E3DB] rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-[#E8F5EE] rounded-lg flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-[#2D5A45]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#1A1A1A]">{totalComments}</p>
                  <p className="text-xs text-[#4A4A4A]">Total Comments</p>
                </div>
              </div>
              <button
                onClick={() => setUnreadOnly(true)}
                className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-red-100 transition-colors"
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700">{totalUnread}</p>
                  <p className="text-xs text-red-600 font-medium">Unread</p>
                </div>
              </button>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-700">{needsReviewTotal}</p>
                  <p className="text-xs text-amber-600 font-medium">Guests Pending Review</p>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <Card className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                {/* Row 1: Country + DI dropdowns */}
                <div className="flex flex-wrap gap-3">
                  <select
                    value={countryFilter}
                    onChange={e => setCountryFilter(e.target.value)}
                    className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9"
                  >
                    <option value="all">All Countries</option>
                    {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select
                    value={diFilter}
                    onChange={e => setDiFilter(e.target.value)}
                    className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9"
                  >
                    <option value="all">All Desk Incharges</option>
                    {diUsers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="text-xs text-red-600 hover:text-red-800 px-2 h-9">
                      Clear filters
                    </button>
                  )}
                </div>

                {/* Row 2: Type chips */}
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'comments', 'status_changes', 'edits'] as FilterType[]).map(t => (
                    <button key={t} onClick={() => setTypeFilter(t)} className={chipCls(typeFilter === t)}>
                      {t === 'all' ? 'All' : t === 'comments' ? 'Comments' : t === 'status_changes' ? 'Status Changes' : 'Edits'}
                    </button>
                  ))}
                </div>

                {/* Row 3: Date chips + unread */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {(['all', '7days', '30days'] as DateRange[]).map(d => (
                    <button key={d} onClick={() => setDateFilter(d)} className={chipCls(dateFilter === d)}>
                      {d === 'all' ? 'All Time' : d === '7days' ? 'Last 7 days' : 'Last 30 days'}
                    </button>
                  ))}
                  <label className="flex items-center gap-1.5 ml-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unreadOnly}
                      onChange={e => setUnreadOnly(e.target.checked)}
                      className="rounded border-[#D4CFC7] text-[#2D5A45]"
                    />
                    <span className="text-xs text-[#4A4A4A]">Unread only</span>
                  </label>
                </div>

                {/* Row 4: Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by guest name, reference, or comment text..."
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ScrollText className="w-5 h-5 text-[#2D5A45]" />
                  Activity Timeline
                  <span className="text-sm font-normal text-[#4A4A4A] ml-1">
                    ({filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-10">
                    <ScrollText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No activity matches the selected filters.</p>
                    {hasActiveFilters && (
                      <button onClick={clearFilters} className="mt-3 text-sm text-[#2D5A45] hover:underline">
                        Clear all filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative space-y-4">
                    <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[#E8E3DB]" />
                    {filteredEntries.map(entry => (
                      <TimelineEntry
                        key={entry.id}
                        entry={entry}
                        guest={guestMap.get(entry.guestId)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comment Input */}
            <Card className="shadow-sm border-[#D6E4D9]">
              <CardHeader className="bg-[#F9F8F6] pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="w-4 h-4 text-[#2D5A45]" />
                  Add a Comment
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#4A4A4A] mb-1 block">Guest</label>
                  <select
                    value={selectedGuestId}
                    onChange={e => setSelectedGuestId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                  >
                    <option value="">Select a guest...</option>
                    {guests.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.fullName} ({g.referenceNumber}) — {g.country}
                      </option>
                    ))}
                  </select>
                </div>
                <Textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Type your comment..."
                  rows={3}
                  maxLength={1000}
                  className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#4A4A4A]/50">{commentText.length}/1000</span>
                  <Button
                    onClick={handleSendComment}
                    disabled={!selectedGuestId || !commentText.trim()}
                    className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                  >
                    <Send className="w-4 h-4 mr-1.5" />
                    Send Comment
                  </Button>
                </div>
              </CardContent>
            </Card>

          </div>
        </main>
      </div>
    </div>
  );
}
