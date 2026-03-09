import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail, sanitizeComment } from '@/hooks/useAuditTrail';
import type { AuditEntry } from '@/hooks/useAuditTrail';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  LayoutDashboard, ClipboardList, CheckSquare, MessageSquare, XCircle,
  ChevronDown, LogOut, Search, Send,
  Clock, CheckCircle,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import type { Guest } from '@/types';

const DESK_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
  { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
  { icon: XCircle,         label: 'Rejected Guests',    href: '/desk/rejected' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function statusBadgeCls(status: string): string {
  if (status === 'Awaiting Review')  return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Needs Correction') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (status === 'Approved')         return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'Accommodated')     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Rejected')         return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

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

function DialogEntryCard({ entry }: { entry: AuditEntry }) {
  const isComment = entry.type === 'comment';
  const role = entry.createdBy.role;

  return (
    <div className="relative pl-8">
      <span className={`absolute left-2 top-3.5 w-3 h-3 rounded-full border-2 border-white shadow z-10 ${TYPE_DOT[entry.type] ?? 'bg-gray-400'}`} />

      {isComment ? (
        <div className="bg-white rounded-lg px-4 py-3 shadow-sm border border-[#D6E4D9]">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <div className="w-7 h-7 rounded-full bg-[#2D5A45] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {getInitials(entry.createdBy.name)}
            </div>
            <span className="text-sm font-medium text-[#1A1A1A]">{entry.createdBy.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ROLE_BADGE_CLS[role] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
            </span>
            <span className="text-xs text-[#4A4A4A]/60 ml-auto">{formatTime(entry.createdAt)}</span>
          </div>
          <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap break-words">{entry.comment}</p>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#1A1A1A]">{entry.action}</span>
            {entry.details && (
              <span className="text-xs text-[#4A4A4A] bg-white border border-[#E8E3DB] px-2 py-0.5 rounded font-mono">
                {entry.details}
              </span>
            )}
            <span className="text-xs text-[#4A4A4A]/60 ml-auto">{formatTime(entry.createdAt)}</span>
          </div>
          {entry.fieldName && (
            <p className="text-xs text-[#4A4A4A] mt-1">
              Changed <span className="font-medium">{entry.fieldName}</span>
              {' '}from <span className="line-through text-red-500">{entry.oldValue}</span>
              {' '}to <span className="text-green-600 font-medium">{entry.newValue}</span>
            </p>
          )}
          <p className="text-xs text-[#4A4A4A]/70 mt-1">By: {entry.createdBy.name}</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type QuickFilter = 'all' | 'unread' | 'awaiting-review' | 'needs-correction';
type DialogFilter = 'all' | 'comments' | 'status_changes';

export default function DeskAuditTrailPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const { entries, addComment, markGuestEntriesAsRead } = useAuditTrail();

  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Dialog state
  const [openGuestId, setOpenGuestId] = useState<string | null>(null);
  const [dialogFilter, setDialogFilter] = useState<DialogFilter>('all');
  const [commentText, setCommentText] = useState('');

  if (!user) return null;

  const assignedCountries = user.assignedCountries ?? [];

  // Guests in DI's assigned countries
  const myGuests = useMemo(
    () => guests.filter(g => assignedCountries.includes(g.country)),
    [guests, assignedCountries]
  );

  // Map for quick guest lookup
  const guestMap = useMemo(() => {
    const map = new Map<string, Guest>();
    myGuests.forEach(g => map.set(g.id, g));
    return map;
  }, [myGuests]);

  // Entries scoped to DI's guests
  const myEntries = useMemo(
    () => entries.filter(e => guestMap.has(e.guestId)),
    [entries, guestMap]
  );

  // Countries that have guests (for filter dropdown)
  const countriesWithGuests = useMemo(() => {
    const s = new Set(myGuests.map(g => g.country));
    return Array.from(s).sort();
  }, [myGuests]);

  // Review count for sidebar badge
  const reviewCount = useMemo(() =>
    myGuests.filter(g => g.status === 'Awaiting Review' || g.status === 'Needs Correction').length,
    [myGuests]
  );

  const rejectedCount = useMemo(() =>
    myGuests.filter(g => g.status === 'Rejected').length,
    [myGuests]
  );

  // Summary stats
  const totalUnreadCount = useMemo(() =>
    myEntries.filter(e => !e.readBy?.includes(user.id) && e.createdBy.id !== user.id).length,
    [myEntries, user.id]
  );
  const needsReviewCount = useMemo(() =>
    myGuests.filter(g => g.status === 'Awaiting Review').length,
    [myGuests]
  );
  const approvedThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return myGuests.filter(g =>
      g.statusHistory?.some(sh => sh.status === 'Approved' && new Date(sh.changedAt).getTime() > cutoff)
    ).length;
  }, [myGuests]);

  // Guest list rows
  const guestRows = useMemo(() => {
    return myGuests
      .map(guest => {
        const guestEntries = myEntries
          .filter(e => e.guestId === guest.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const unreadCount = guestEntries.filter(
          e => !e.readBy?.includes(user.id) && e.createdBy.id !== user.id
        ).length;
        const lastEntry = guestEntries[0];
        return {
          guest,
          entries: guestEntries,
          unreadCount,
          lastActivityAt: lastEntry?.createdAt ?? '',
          lastActivity: lastEntry
            ? (lastEntry.type === 'comment' ? lastEntry.comment ?? lastEntry.action : lastEntry.action)
            : 'No activity yet',
        };
      })
      .filter(row => {
        if (countryFilter !== 'all' && row.guest.country !== countryFilter) return false;
        if (quickFilter === 'unread' && row.unreadCount === 0) return false;
        if (quickFilter === 'awaiting-review' && row.guest.status !== 'Awaiting Review') return false;
        if (quickFilter === 'needs-correction' && row.guest.status !== 'Needs Correction') return false;
        if (search) {
          const s = search.toLowerCase();
          if (
            !row.guest.fullName.toLowerCase().includes(s) &&
            !row.guest.referenceNumber.toLowerCase().includes(s) &&
            !row.guest.country.toLowerCase().includes(s)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
      });
  }, [myGuests, myEntries, user.id, countryFilter, quickFilter, search]);

  // Mark as read when dialog opens
  useEffect(() => {
    if (openGuestId) {
      markGuestEntriesAsRead(openGuestId, user.id);
      setDialogFilter('all');
      setCommentText('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGuestId]);

  const openGuestData = guestMap.get(openGuestId ?? '');

  const dialogEntries = useMemo(() => {
    if (!openGuestId) return [];
    return entries
      .filter(e => e.guestId === openGuestId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter(e => e.type === 'comment' || e.type === 'status_change')
      .filter(e => {
        if (dialogFilter === 'comments') return e.type === 'comment';
        if (dialogFilter === 'status_changes') return e.type === 'status_change';
        return true;
      });
  }, [entries, openGuestId, dialogFilter]);

  const handleSendComment = () => {
    if (!openGuestData) return;
    const safe = sanitizeComment(commentText);
    if (!safe) return;
    addComment({
      guestId: openGuestData.id,
      guestName: openGuestData.fullName,
      guestReference: openGuestData.referenceNumber,
      comment: safe,
      createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
    });
    setCommentText('');
    toast.success('Comment added');
  };

  const chipCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8] transition-all';

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
                  item.href === '/desk/messages'
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
        </aside>

        <main className="flex-1 ml-64">
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Messages &amp; Updates</h1>
                  <p className="text-xs text-[#4A4A4A]">Comments and status changes across your countries</p>
                </div>
                {totalUnreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {totalUnreadCount} unread
                  </span>
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
            {/* Summary Bar */}
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setQuickFilter('unread')}
                className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-red-100 transition-colors"
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700">{totalUnreadCount}</p>
                  <p className="text-xs text-red-600 font-medium">Unread</p>
                </div>
              </button>

              <button
                onClick={() => navigate('/desk/review')}
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-amber-100 transition-colors"
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-700">{needsReviewCount}</p>
                  <p className="text-xs text-amber-600 font-medium">Need Your Review</p>
                </div>
              </button>

              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700">{approvedThisWeek}</p>
                  <p className="text-xs text-green-600 font-medium">Approved This Week</p>
                </div>
              </div>
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm p-4 flex flex-wrap items-center gap-3">
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
                {countriesWithGuests.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setQuickFilter('all')} className={chipCls(quickFilter === 'all')}>All</button>
                <button onClick={() => setQuickFilter('unread')} className={chipCls(quickFilter === 'unread')}>With Unread</button>
                <button onClick={() => setQuickFilter('awaiting-review')} className={chipCls(quickFilter === 'awaiting-review')}>Awaiting Review</button>
                <button onClick={() => setQuickFilter('needs-correction')} className={chipCls(quickFilter === 'needs-correction')}>Needs Correction</button>
              </div>
            </div>

            {/* Guest inbox list */}
            <div className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E8E3DB] bg-[#F9F8F6] flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1A1A1A]">Guests</span>
                <span className="text-xs text-[#4A4A4A]/60">{guestRows.length} shown</span>
              </div>

              {guestRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <MessageSquare className="w-10 h-10 text-gray-300" />
                  <p className="text-sm font-medium text-[#1A1A1A]">No guests match the selected filters.</p>
                  {(search || countryFilter !== 'all' || quickFilter !== 'all') && (
                    <button
                      onClick={() => { setSearch(''); setCountryFilter('all'); setQuickFilter('all'); }}
                      className="text-xs text-[#2D5A45] hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                guestRows.map(({ guest, unreadCount, lastActivityAt, lastActivity }) => (
                  <button
                    key={guest.id}
                    onClick={() => setOpenGuestId(guest.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#F9F8F6] transition-colors border-b border-[#E8E3DB] last:border-b-0 text-left"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {guest.fullName.charAt(0)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[#1A1A1A] ${unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>
                          {guest.fullName}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadgeCls(guest.status)}`}>
                          {GUEST_STATUS_LABELS[guest.status as keyof typeof GUEST_STATUS_LABELS] ?? guest.status}
                        </Badge>
                        <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                          {guest.country}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A4A4A] mt-0.5">{guest.referenceNumber}</p>
                      <p className={`text-xs mt-0.5 truncate ${unreadCount > 0 ? 'text-[#1A1A1A]' : 'text-[#4A4A4A]/60'}`}>
                        {lastActivity}
                      </p>
                    </div>

                    {/* Right: time + unread badge */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {lastActivityAt && (
                        <span className="text-xs text-[#4A4A4A]/50">{formatTime(lastActivityAt)}</span>
                      )}
                      {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Guest Audit Trail Dialog */}
      <Dialog open={!!openGuestId} onOpenChange={open => { if (!open) setOpenGuestId(null); }}>
        <DialogContent className="max-w-2xl w-full h-[85vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-[#E8E3DB] shrink-0">
            <div>
              <DialogTitle className="text-lg font-semibold text-[#1A1A1A]">
                {openGuestData?.fullName ?? ''}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-[#4A4A4A]">{openGuestData?.referenceNumber}</span>
                <span className="text-[#4A4A4A]/40">·</span>
                <span className="text-xs text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                  {openGuestData?.country}
                </span>
                {openGuestData && (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadgeCls(openGuestData.status)}`}>
                    {GUEST_STATUS_LABELS[openGuestData.status as keyof typeof GUEST_STATUS_LABELS] ?? openGuestData.status}
                  </Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Filter chips */}
          <div className="px-6 py-3 border-b border-[#E8E3DB] flex gap-1.5 shrink-0 bg-[#F9F8F6]">
            {(['all', 'comments', 'status_changes'] as DialogFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setDialogFilter(f)}
                className={chipCls(dialogFilter === f)}
              >
                {f === 'all' ? 'All' : f === 'comments' ? 'Comments' : 'Status Changes'}
              </button>
            ))}
            <span className="ml-auto text-xs text-[#4A4A4A]/50 self-center">{dialogEntries.length} entries</span>
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {dialogEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <MessageSquare className="w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-400">No activity matches the selected filter.</p>
              </div>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[#E8E3DB]" />
                {dialogEntries.map(entry => (
                  <DialogEntryCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>

          {/* Comment input */}
          <div className="px-6 py-4 border-t border-[#E8E3DB] bg-[#F9F8F6] shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-[#2D5A45]" />
              <span className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Add a comment</span>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Type your comment..."
                rows={2}
                maxLength={1000}
                className="flex-1 border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
              />
              <Button
                onClick={handleSendComment}
                disabled={!commentText.trim()}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white self-end px-3"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-[#4A4A4A]/40 mt-1 text-right">{commentText.length}/1000</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
