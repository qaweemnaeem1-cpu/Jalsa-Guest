import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { GuestViewModal } from '@/components/GuestViewModal';
import { toast } from 'sonner';
import {
  Clock, ChevronDown, LogOut, ChevronRight,
  CheckCircle, AlertCircle, Edit, User, Plus, Users,
} from 'lucide-react';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel, ProfileDialog } from '@/components/ProfileDialog';
import { COORD_NAV } from '@/lib/navItems';
import type { Guest } from '@/types';

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function statusBadgeCls(status: string): string {
  if (status === 'Awaiting Review')  return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Needs Correction') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (status === 'Approved')         return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'Rejected')         return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
}

/** Deduplicate guests to one card per family group (show head) + all individuals. */
function deduplicateToGroups(list: Guest[]): Guest[] {
  const seen = new Set<string>();
  return list.filter(g => {
    if (!g.familyGroupId) return true;
    if (seen.has(g.familyGroupId)) return false;
    seen.add(g.familyGroupId);
    return true;
  });
}

export default function CoordinatorPendingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editGuestId, setEditGuestId] = useState<string | null>(null);
  const [resubmitGuestId, setResubmitGuestId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  if (!user) return null;

  const myGuests = guests.filter(g => g.submittedBy === user.id);
  // Count unique family groups + individuals that are awaiting/correction
  const awaitingAll = myGuests.filter(g => g.status === 'Awaiting Review');
  const correctionAll = myGuests.filter(g => g.status === 'Needs Correction');
  const awaitingReview = deduplicateToGroups(awaitingAll);
  const needsCorrection = deduplicateToGroups(correctionAll);
  const rejectedCount = new Set(myGuests.filter(g => g.status === 'Rejected').map(g => g.familyGroupId ?? g.id)).size;
  const pendingCount = awaitingReview.length + needsCorrection.length;

  const editGuest = guests.find(g => g.id === editGuestId) ?? null;
  const resubmitGuest = guests.find(g => g.id === resubmitGuestId) ?? null;

  const toggleGroup = (id: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  /** Get all guests in the same family group (or just [g] for individuals). */
  const getFamilyMembers = (g: Guest): Guest[] =>
    g.familyGroupId
      ? myGuests.filter(x => x.familyGroupId === g.familyGroupId)
      : [g];

  const handleResubmit = async () => {
    if (!resubmitGuest) return;
    const members = getFamilyMembers(resubmitGuest);
    const now = new Date().toISOString();
    for (const m of members) {
      updateGuest(m.id, {
        status: 'Awaiting Review',
        resubmitCount: (m.resubmitCount ?? 0) + 1,
        resubmittedAt: now,
      });
    }
    setResubmitGuestId(null);
    const label = resubmitGuest.familyGroupId
      ? `${resubmitGuest.familyName ?? 'Family'} (${members.length} members)`
      : resubmitGuest.fullName;
    toast.success(`${label} re-submitted for review`);
  };

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
                <p className="text-xs text-[#4A4A4A]">Coordinator View</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1 flex-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {COORD_NAV.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/coordinator/pending'
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
                {item.href === '/coordinator/rejected' && rejectedCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {rejectedCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="px-4 mb-2">
            <button
              type="button"
              onClick={() => navigate('/guests/new')}
              className="w-full bg-[#2D5A45] hover:bg-[#234a38] text-white rounded-lg py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              New Registration
            </button>
          </div>

          <SidebarUserFooter />
        </aside>

        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-500" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Pending Guests</h1>
                {pendingCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {pendingCount} requiring action
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
                      onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#4A4A4A]" />
                      Profile
                    </button>
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

          <div className="p-6 max-w-4xl mx-auto space-y-6">

            {/* Section A: Awaiting Review */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-semibold text-[#1A1A1A]">Awaiting Review</h2>
                {awaitingReview.length > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {awaitingReview.length}
                  </Badge>
                )}
              </div>
              <div className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm overflow-hidden">
                {awaitingReview.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                    <p className="text-sm text-[#4A4A4A]">No guests awaiting review.</p>
                  </div>
                ) : (
                  awaitingReview.map(g => {
                    const members = getFamilyMembers(g);
                    const isGroup = !!g.familyGroupId;
                    const isExpanded = expandedGroups.has(g.familyGroupId ?? g.id);
                    const displayName = isGroup ? (g.familyName ?? g.fullName) : g.fullName;
                    return (
                      <div key={g.id} className="border-b border-[#E8E3DB] last:border-b-0">
                        <div className="flex items-center gap-4 px-5 py-4">
                          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                            {isGroup ? <Users className="w-5 h-5" /> : getInitials(g.fullName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[#1A1A1A]">{displayName}</span>
                              {isGroup && (
                                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">
                                  Family · {members.length} members
                                </Badge>
                              )}
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                Awaiting Review
                              </Badge>
                            </div>
                            <p className="text-xs text-[#4A4A4A] mt-0.5 font-mono">{g.referenceNumber}</p>
                          </div>
                          {isGroup && (
                            <button type="button" onClick={() => toggleGroup(g.familyGroupId!)}
                              className="p-1 rounded hover:bg-[#F5F0E8] text-[#4A4A4A] transition-colors shrink-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                          {!isGroup && <span className="text-xs text-[#4A4A4A]/50 italic shrink-0">Under review</span>}
                        </div>
                        {isGroup && isExpanded && (
                          <div className="bg-gray-50/50 border-l-4 border-[#2D5A45] ml-5 mr-5 mb-3 rounded-lg overflow-hidden">
                            {members.map((m, i) => (
                              <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-[#E8E3DB]' : ''}`}>
                                <span className="text-[#4A4A4A] w-4 shrink-0">{i + 1}.</span>
                                {m.isHeadOfFamily && <span className="text-amber-500">⭐</span>}
                                <span className="font-medium text-[#1A1A1A] flex-1">{m.fullName}</span>
                                <span className="text-xs text-[#4A4A4A] capitalize">{m.relationship ?? '—'}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadgeCls(m.status)}`}>{m.status}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Section B: Needs Correction */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <h2 className="text-base font-semibold text-[#1A1A1A]">Needs Correction</h2>
                {needsCorrection.length > 0 && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    {needsCorrection.length}
                  </Badge>
                )}
              </div>
              <div className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm overflow-hidden">
                {needsCorrection.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                    <p className="text-sm text-[#4A4A4A]">No guests need correction.</p>
                  </div>
                ) : (
                  needsCorrection.map(g => {
                    const members = getFamilyMembers(g);
                    const isGroup = !!g.familyGroupId;
                    const isExpanded = expandedGroups.has(g.familyGroupId ?? g.id);
                    const displayName = isGroup ? (g.familyName ?? g.fullName) : g.fullName;
                    const latestRemark = g.remarks?.sort(
                      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )[0];
                    return (
                      <div key={g.id} className="border-b border-[#E8E3DB] last:border-b-0">
                        <div className="flex items-start gap-4 px-5 py-4">
                          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-sm shrink-0 mt-0.5">
                            {isGroup ? <Users className="w-5 h-5" /> : getInitials(g.fullName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[#1A1A1A]">{displayName}</span>
                              {isGroup && (
                                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">
                                  Family · {members.length} members
                                </Badge>
                              )}
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
                                Needs Correction
                              </Badge>
                            </div>
                            <p className="text-xs text-[#4A4A4A] mt-0.5 font-mono">{g.referenceNumber}</p>
                            {latestRemark && (
                              <p className="text-xs text-[#4A4A4A]/70 mt-1 truncate max-w-md">
                                {latestRemark.message.slice(0, 80)}{latestRemark.message.length > 80 ? '…' : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 mt-0.5">
                            {isGroup && (
                              <button type="button" onClick={() => toggleGroup(g.familyGroupId!)}
                                className="p-1 rounded hover:bg-[#F5F0E8] text-[#4A4A4A] transition-colors">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                            <Button size="sm" variant="outline"
                              onClick={() => setEditGuestId(g.id)}
                              className="border-[#2D5A45] text-[#2D5A45] hover:bg-[#E8F5EE] gap-1.5">
                              <Edit className="w-3.5 h-3.5" />
                              Edit &amp; Fix
                            </Button>
                            <Button size="sm" onClick={() => setResubmitGuestId(g.id)}
                              className="bg-amber-600 hover:bg-amber-700 text-white">
                              Re-Submit
                            </Button>
                          </div>
                        </div>
                        {isGroup && isExpanded && (
                          <div className="bg-gray-50/50 border-l-4 border-orange-400 ml-5 mr-5 mb-3 rounded-lg overflow-hidden">
                            {members.map((m, i) => (
                              <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-[#E8E3DB]' : ''}`}>
                                <span className="text-[#4A4A4A] w-4 shrink-0">{i + 1}.</span>
                                {m.isHeadOfFamily && <span className="text-amber-500">⭐</span>}
                                <span className="font-medium text-[#1A1A1A] flex-1">{m.fullName}</span>
                                <span className="text-xs text-[#4A4A4A] capitalize">{m.relationship ?? '—'}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadgeCls(m.status)}`}>{m.status}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {pendingCount === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle className="w-12 h-12 text-green-400" />
                <p className="text-lg font-medium text-[#1A1A1A]">All caught up!</p>
                <p className="text-sm text-[#4A4A4A]">No guests require action right now.</p>
                <Button onClick={() => navigate('/coordinator/submitted')} variant="outline" className="mt-2 border-[#D4CFC7]">
                  View Submitted Guests
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Edit modal */}
      <GuestViewModal
        guest={editGuest}
        open={!!editGuestId}
        onClose={() => setEditGuestId(null)}
        isEditMode={true}
      />

      {/* Re-submit confirmation dialog */}
      <Dialog open={!!resubmitGuestId} onOpenChange={open => { if (!open) setResubmitGuestId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-Submit Guest</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A]">
            Are you sure you want to re-submit{' '}
            <span className="font-semibold">
              {resubmitGuest?.familyGroupId
                ? `${resubmitGuest.familyName ?? 'Family'} (${getFamilyMembers(resubmitGuest).length} members)`
                : resubmitGuest?.fullName}
            </span>{' '}
            for review? This will change their status back to "Awaiting Review".
          </p>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setResubmitGuestId(null)}>Cancel</Button>
            <Button onClick={handleResubmit} className="bg-amber-600 hover:bg-amber-700 text-white">
              Confirm Re-Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
