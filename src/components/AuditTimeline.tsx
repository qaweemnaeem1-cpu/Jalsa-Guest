import { useState } from 'react';
import {
  Send, RefreshCw, Pencil, UserCheck, ArrowRightLeft, ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuditTrail, sanitizeComment, type AuditEntry } from '@/hooks/useAuditTrail';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) {
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    const diffM = Math.floor(diffMs / (1000 * 60));
    if (diffH >= 1) return `${diffH}h ago`;
    if (diffM >= 1) return `${diffM}m ago`;
    return 'Just now';
  }
  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return `${Math.floor(diffDays)} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Role badge ─────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  'super-admin':   { label: 'Super Admin',   cls: 'bg-red-50 text-red-700' },
  'desk-in-charge': { label: 'Desk Incharge', cls: 'bg-blue-50 text-blue-700' },
  'coordinator':   { label: 'Coordinator',   cls: 'bg-green-50 text-green-700' },
};

function RoleBadge({ role }: { role: string }) {
  const b = ROLE_BADGE[role] ?? { label: role, cls: 'bg-gray-50 text-gray-600' };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${b.cls}`}>
      {b.label}
    </span>
  );
}

// ── Dot colors and icons per entry type ───────────────────────────────────────

const TYPE_DOT: Record<string, string> = {
  submission:    'bg-blue-400',
  status_change: 'bg-amber-400',
  field_edit:    'bg-gray-400',
  assignment:    'bg-purple-400',
  comment:       'bg-[#2D5A45]',
};

const TYPE_ICON: Record<string, React.FC<{ className?: string }>> = {
  submission:    ({ className }) => <Send className={className} />,
  status_change: ({ className }) => <RefreshCw className={className} />,
  field_edit:    ({ className }) => <Pencil className={className} />,
  assignment:    ({ className }) => <UserCheck className={className} />,
  comment:       ({ className }) => <ArrowRightLeft className={className} />,
};

// ── Single entry card ─────────────────────────────────────────────────────────

function EntryCard({ entry, showGuestInfo }: { entry: AuditEntry; showGuestInfo: boolean }) {
  const dot = TYPE_DOT[entry.type] ?? 'bg-gray-400';
  const isComment = entry.type === 'comment';
  const Icon = TYPE_ICON[entry.type];

  return (
    <div className="relative pl-8">
      {/* Dot */}
      <span className={`absolute left-2 top-3 w-3 h-3 rounded-full border-2 border-white z-10 ${dot}`} />

      {/* Guest label (full page view only) */}
      {showGuestInfo && (
        <p className="text-xs text-[#4A4A4A] mb-1 font-medium">
          {entry.guestName}
          <span className="font-normal text-[#4A4A4A]/60 ml-1">({entry.guestReference})</span>
        </p>
      )}

      {isComment ? (
        /* ── Comment card ── */
        <div className={`bg-white border border-[#D6E4D9] rounded-lg px-4 py-3 shadow-sm ${!entry.isRead ? 'ring-1 ring-[#2D5A45]/20' : ''}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-7 h-7 rounded-full bg-[#D6E4D9] text-[#2D5A45] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {getInitials(entry.createdBy.name)}
            </span>
            <span className="text-sm font-semibold text-gray-800">{entry.createdBy.name}</span>
            <RoleBadge role={entry.createdBy.role} />
            {!entry.isRead && (
              <span className="w-2 h-2 rounded-full bg-red-500 ml-auto" title="Unread" />
            )}
          </div>
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{entry.comment}</p>
          <p className="text-xs text-gray-400 mt-2">{formatFullTime(entry.createdAt)}</p>
        </div>
      ) : (
        /* ── System event card ── */
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
          <div className="flex items-start gap-2">
            {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{entry.action}</p>
              {entry.details && (
                <p className="text-sm text-gray-500 mt-0.5">{entry.details}</p>
              )}
              {entry.fieldName && entry.oldValue !== undefined && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Changed <span className="font-medium">{entry.fieldName}</span>
                  {' '}from{' '}
                  <span className="line-through text-red-500">{entry.oldValue}</span>
                  {' '}to{' '}
                  <span className="text-green-600 font-medium">{entry.newValue}</span>
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-xs text-gray-400">
                  by <span className="font-medium text-gray-600">{entry.createdBy.name}</span>
                </span>
                <RoleBadge role={entry.createdBy.role} />
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-400" title={formatFullTime(entry.createdAt)}>
                  {formatTime(entry.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────

type FilterType = 'all' | 'comments' | 'status_changes' | 'edits';

const FILTER_LABELS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All Activity' },
  { value: 'comments', label: 'Comments' },
  { value: 'status_changes', label: 'Status Changes' },
  { value: 'edits', label: 'Edits' },
];

function applyFilter(entries: AuditEntry[], filter: FilterType): AuditEntry[] {
  switch (filter) {
    case 'comments': return entries.filter(e => e.type === 'comment');
    case 'status_changes': return entries.filter(e => e.type === 'status_change');
    case 'edits': return entries.filter(e => e.type === 'field_edit');
    default: return entries;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AuditTimelineProps {
  /** If set, show only entries for this guest */
  guestId?: string;
  guestName?: string;
  guestReference?: string;
  /** If true, show guest name above each entry (for full-page view) */
  showGuestInfo?: boolean;
  /** If true, show filter chips (for full-page view) */
  showFilters?: boolean;
  /** If true, allow commenting */
  allowComment?: boolean;
}

export function AuditTimeline({
  guestId,
  guestName,
  guestReference,
  showGuestInfo = false,
  showFilters = false,
  allowComment = true,
}: AuditTimelineProps) {
  const { entries, addComment, getEntriesForGuest } = useAuditTrail();
  const { user } = useAuth();
  const [commentText, setCommentText] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Decide which entries to show
  const rawEntries = guestId ? getEntriesForGuest(guestId) : entries;

  // Sort newest first, apply filter
  const sorted = [...rawEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const visible = applyFilter(sorted, filterType);

  const handleSendComment = () => {
    if (!user || !commentText.trim()) return;
    const safe = sanitizeComment(commentText);
    if (!safe) return;

    // Map auth UserRole to AuditEntry role
    const roleMap: Record<UserRole, AuditEntry['createdBy']['role']> = {
      'super-admin': 'super-admin',
      'desk-in-charge': 'desk-in-charge',
      'coordinator': 'coordinator',
      'transport': 'coordinator',
      'accommodation': 'coordinator',
      'viewer': 'coordinator',
    };

    addComment({
      guestId: guestId ?? 'global',
      guestName: guestName ?? 'General',
      guestReference: guestReference ?? '',
      comment: safe,
      createdBy: {
        id: user.id,
        name: user.name,
        role: roleMap[user.role],
      },
    });

    setCommentText('');
    toast.success('Comment sent');
  };

  const filterCls = (v: FilterType) =>
    filterType === v
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-gray-200 transition-all';

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          {FILTER_LABELS.map(f => (
            <button key={f.value} onClick={() => setFilterType(f.value)} className={filterCls(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {visible.length === 0 ? (
        <div className="text-center py-10">
          <ScrollText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No activity to show.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[0.875rem] top-3 bottom-3 border-l-2 border-gray-100 pointer-events-none" />
          <div className="space-y-4">
            {visible.map(entry => (
              <EntryCard key={entry.id} entry={entry} showGuestInfo={showGuestInfo} />
            ))}
          </div>
        </div>
      )}

      {/* Comment input */}
      {allowComment && user && (
        <div className="border-t border-[#E8E3DB] pt-4 mt-2">
          <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2">
            Add a comment
          </p>
          <Textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Type your comment or feedback..."
            rows={3}
            maxLength={1000}
            className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none text-sm"
          />
          <div className="flex justify-end mt-2">
            <Button
              onClick={handleSendComment}
              disabled={!commentText.trim()}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-1.5" />
              Send Comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Re-export Badge for convenience ───────────────────────────────────────────
export { Badge };
