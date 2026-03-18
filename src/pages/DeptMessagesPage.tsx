import { useState, useMemo, useEffect } from 'react';
import { MessageSquare, Send, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useAuditTrail2, sanitizeComment2, type AuditEntry2 } from '@/hooks/useAuditTrail2';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ── Helpers ─────────────────────────────────────────────────────────────────

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

const TYPE_DOT: Record<string, string> = {
  guest_placed:    'bg-green-400',
  room_assignment: 'bg-blue-400',
  room_change:     'bg-amber-400',
  status_change:   'bg-purple-400',
  comment:         'bg-[#2D5A45]',
};

const ROLE_BADGE_CLS: Record<string, string> = {
  'department-head':   'bg-[#E8F5EE] text-[#2D5A45] border-[#D6E4D9]',
  'location-manager':  'bg-blue-50 text-blue-700 border-blue-200',
  'super-admin':       'bg-red-50 text-red-700 border-red-200',
};

const ROLE_LABEL: Record<string, string> = {
  'department-head':  'Dept. Head',
  'location-manager': 'Location Mgr',
  'super-admin':      'Super Admin',
};

function EntryCard({ entry }: { entry: AuditEntry2 }) {
  const isComment = entry.type === 'comment';
  const role = entry.createdBy.role;
  return (
    <div className="relative pl-8">
      <span className={`absolute left-2 top-3.5 w-3 h-3 rounded-full border-2 border-white shadow z-10 ${TYPE_DOT[entry.type] ?? 'bg-gray-400'}`} />
      {isComment ? (
        <div className="bg-white rounded-lg px-4 py-3 shadow-sm border border-[#D6E4D9]">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <div className="w-7 h-7 rounded-full bg-[#2D5A45] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {entry.createdBy.name.charAt(0)}
            </div>
            <span className="text-sm font-medium text-[#1A1A1A]">{entry.createdBy.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ROLE_BADGE_CLS[role] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              {ROLE_LABEL[role] ?? role}
            </span>
            <span className="text-xs text-[#4A4A4A]/60 ml-auto">{formatTime(entry.createdAt)}</span>
          </div>
          <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap break-words">{entry.comment}</p>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#1A1A1A]">{entry.action}</span>
            {entry.newValue && (
              <span className="text-xs text-[#4A4A4A] bg-white border border-[#E8E3DB] px-2 py-0.5 rounded font-mono">
                {entry.newValue}
              </span>
            )}
            <span className="text-xs text-[#4A4A4A]/60 ml-auto">{formatTime(entry.createdAt)}</span>
          </div>
          <p className="text-xs text-[#4A4A4A] mt-1">By: {entry.createdBy.name} · {entry.locationName}</p>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DeptMessagesPage() {
  const { user } = useAuth();
  const { entries, addComment, markGuestEntriesAsRead, getEntriesByDepartment } = useAuditTrail2();

  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [openGuestId, setOpenGuestId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  if (!user) return null;

  const dept = user.department ?? '';
  const userId = user.id;

  // All entries for this department
  const deptEntries = useMemo(() => getEntriesByDepartment(dept), [getEntriesByDepartment, dept]);

  // All locations this dept sends guests to
  const allLocations = useMemo(() => {
    const s = new Set(deptEntries.map(e => e.locationName));
    return Array.from(s).sort();
  }, [deptEntries]);

  // Per-guest unread
  const unreadByGuest = useMemo(() => {
    const map = new Map<string, number>();
    deptEntries.forEach(e => {
      if (!e.readBy.includes(userId) && e.createdBy.id !== userId) {
        map.set(e.guestId, (map.get(e.guestId) ?? 0) + 1);
      }
    });
    return map;
  }, [deptEntries, userId]);

  // Most recent entry per guest
  const lastEntryByGuest = useMemo(() => {
    const map = new Map<string, AuditEntry2>();
    deptEntries.forEach(e => {
      const existing = map.get(e.guestId);
      if (!existing || new Date(e.createdAt) > new Date(existing.createdAt)) map.set(e.guestId, e);
    });
    return map;
  }, [deptEntries]);

  // Unique guests (deduplicated)
  const guestRows = useMemo(() => {
    const seen = new Map<string, { guestId: string; guestName: string; guestReference: string; locationName: string }>();
    deptEntries.forEach(e => {
      if (!seen.has(e.guestId)) seen.set(e.guestId, { guestId: e.guestId, guestName: e.guestName, guestReference: e.guestReference, locationName: e.locationName });
    });
    return Array.from(seen.values())
      .filter(g => {
        if (locationFilter !== 'all' && g.locationName !== locationFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          return g.guestName.toLowerCase().includes(s) || g.guestReference.toLowerCase().includes(s);
        }
        return true;
      })
      .map(g => ({
        ...g,
        unreadCount: unreadByGuest.get(g.guestId) ?? 0,
        lastEntry: lastEntryByGuest.get(g.guestId),
      }))
      .sort((a, b) => {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        const aTime = a.lastEntry?.createdAt ?? '';
        const bTime = b.lastEntry?.createdAt ?? '';
        return bTime.localeCompare(aTime);
      });
  }, [deptEntries, locationFilter, search, unreadByGuest, lastEntryByGuest]);

  const totalUnread = useMemo(() => [...unreadByGuest.values()].reduce((a, b) => a + b, 0), [unreadByGuest]);

  // Open guest thread data
  const openGuestMeta = useMemo(() => {
    if (!openGuestId) return null;
    return deptEntries.find(e => e.guestId === openGuestId) ?? null;
  }, [openGuestId, deptEntries]);

  const dialogEntries = useMemo(() => {
    if (!openGuestId) return [];
    return deptEntries
      .filter(e => e.guestId === openGuestId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [deptEntries, openGuestId]);

  useEffect(() => {
    if (openGuestId) {
      markGuestEntriesAsRead(openGuestId, userId);
      setCommentText('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGuestId]);

  const handleSendComment = () => {
    if (!openGuestMeta) return;
    const safe = sanitizeComment2(commentText);
    if (!safe) return;
    addComment({
      guestId: openGuestMeta.guestId,
      guestName: openGuestMeta.guestName,
      guestReference: openGuestMeta.guestReference,
      locationId: openGuestMeta.locationId,
      locationName: openGuestMeta.locationName,
      departmentId: dept,
      departmentName: dept,
      comment: safe,
      createdBy: { id: user.id, name: user.name, role: 'department-head' },
    });
    setCommentText('');
    toast.success('Comment sent');
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Messages &amp; Updates</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Department: {dept}</p>
                </div>
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {totalUnread} unread
                  </span>
                )}
              </div>
              <DeptUserMenu />
            </div>
          </header>

          <div className="p-6 max-w-4xl mx-auto space-y-4">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search guests…"
                  className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9 bg-white"
                />
              </div>
              <select
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9"
              >
                <option value="all">All Locations</option>
                {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Guest list */}
            <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E8E3DB] bg-[#F9F8F6] flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1A1A1A]">Guest Threads</span>
                <span className="text-xs text-[#4A4A4A]/60">{guestRows.length} guests</span>
              </div>

              {guestRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <MessageSquare className="w-10 h-10 text-[#D4CFC7]" />
                  <p className="text-sm font-medium text-[#1A1A1A]">No messages yet</p>
                  <p className="text-xs text-[#4A4A4A]">Updates from location managers will appear here.</p>
                </div>
              ) : (
                guestRows.map(row => (
                  <button
                    key={row.guestId}
                    onClick={() => setOpenGuestId(row.guestId)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#F9F8F6] transition-colors border-b border-[#E8E3DB] last:border-b-0 text-left"
                  >
                    <div className="w-10 h-10 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {row.guestName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[#1A1A1A] ${row.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>
                          {row.guestName}
                        </span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                          {row.locationName}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A4A4A] mt-0.5">{row.guestReference}</p>
                      {row.lastEntry && (
                        <p className={`text-xs mt-0.5 truncate ${row.unreadCount > 0 ? 'text-[#1A1A1A]' : 'text-[#4A4A4A]/60'}`}>
                          {row.lastEntry.type === 'comment' ? row.lastEntry.comment : row.lastEntry.action}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {row.lastEntry && (
                        <span className="text-xs text-[#4A4A4A]/50">{formatTime(row.lastEntry.createdAt)}</span>
                      )}
                      {row.unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {row.unreadCount}
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

      {/* Guest thread dialog */}
      <Dialog open={!!openGuestId} onOpenChange={open => { if (!open) setOpenGuestId(null); }}>
        <DialogContent className="max-w-2xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-[#E8E3DB] shrink-0">
            <DialogTitle className="text-lg font-semibold text-[#1A1A1A]">
              {openGuestMeta?.guestName ?? ''}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-[#4A4A4A]">{openGuestMeta?.guestReference}</span>
              <span className="text-[#4A4A4A]/40">·</span>
              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                {openGuestMeta?.locationName}
              </span>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {dialogEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <MessageSquare className="w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-400">No activity yet.</p>
              </div>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[#E8E3DB]" />
                {dialogEntries.map(e => <EntryCard key={e.id} entry={e} />)}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-[#E8E3DB] bg-[#F9F8F6] shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-[#2D5A45]" />
              <span className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reply</span>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Type your message…"
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
