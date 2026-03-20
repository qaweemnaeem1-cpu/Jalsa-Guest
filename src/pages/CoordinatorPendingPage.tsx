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
  LayoutDashboard, Users, Clock, MessageSquare, XCircle,
  ChevronDown, LogOut,
  CheckCircle, AlertCircle, Edit, User,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel, ProfileDialog } from '@/components/ProfileDialog';
import { COORD_NAV } from '@/lib/navItems';

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function CoordinatorPendingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Edit modal state
  const [editGuestId, setEditGuestId] = useState<string | null>(null);

  // Re-submit confirmation dialog
  const [resubmitGuestId, setResubmitGuestId] = useState<string | null>(null);

  if (!user) return null;

  const myGuests = guests.filter(g => g.submittedBy === user.id);
  const awaitingReview = myGuests.filter(g => g.status === 'Awaiting Review');
  const needsCorrection = myGuests.filter(g => g.status === 'Needs Correction');
  const rejectedCount = myGuests.filter(g => g.status === 'Rejected').length;

  const pendingCount = awaitingReview.length + needsCorrection.length;

  const editGuest = guests.find(g => g.id === editGuestId) ?? null;
  const resubmitGuest = guests.find(g => g.id === resubmitGuestId) ?? null;

  const handleResubmit = () => {
    if (!resubmitGuest) return;
    updateGuest(resubmitGuest.id, {
      status: 'Awaiting Review',
      resubmitCount: (resubmitGuest.resubmitCount ?? 0) + 1,
      resubmittedAt: new Date().toISOString(),
    });
    setResubmitGuestId(null);
    toast.success(`${resubmitGuest.fullName} re-submitted for review`);
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
          <nav className="p-4 space-y-1">
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
                  awaitingReview.map(g => (
                    <div key={g.id} className="flex items-center gap-4 px-5 py-4 border-b border-[#E8E3DB] last:border-b-0">
                      <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                        {g.fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#1A1A1A]">{g.fullName}</span>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                            Awaiting Review
                          </Badge>
                        </div>
                        <p className="text-xs text-[#4A4A4A] mt-0.5 font-mono">{g.referenceNumber}</p>
                        <p className="text-xs text-[#4A4A4A]/60 mt-0.5">Submitted {g.submittedAt ?? '—'}</p>
                      </div>
                      <span className="text-xs text-[#4A4A4A]/50 italic shrink-0">Under review</span>
                    </div>
                  ))
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
                    const latestRemark = g.remarks?.sort(
                      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )[0];

                    // For family guests — find which individual members need correction
                    const membersNeedingCorrection = g.guestType === 'family'
                      ? [
                          ...(g.status === 'Needs Correction' && g.familyMembers.some(m => m.status !== undefined && m.status !== 'Needs Correction')
                            ? [] // head is fine if at least one member has a different explicit status
                            : g.familyMembers.filter(m => (m.status ?? g.status) === 'Needs Correction').length === 0
                              ? [] // none explicitly flagged — don't highlight individuals
                              : []),
                          ...g.familyMembers.filter(m => (m.status ?? g.status) === 'Needs Correction'),
                        ]
                      : [];

                    const isFamily = g.guestType === 'family';

                    return (
                      <div
                        key={g.id}
                        className={`flex items-start gap-4 px-5 py-4 border-b border-[#E8E3DB] last:border-b-0 ${
                          isFamily ? 'border-l-4 border-l-orange-400' : ''
                        }`}
                      >
                        {/* Avatar */}
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-sm shrink-0 mt-0.5">
                          {getInitials(g.fullName)}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#1A1A1A]">{g.fullName}</span>
                            {isFamily && (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">
                                Family · {g.familyMembers.length + 1} members
                              </Badge>
                            )}
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
                              Needs Correction
                            </Badge>
                          </div>
                          <p className="text-xs text-[#4A4A4A] mt-0.5 font-mono">{g.referenceNumber}</p>
                          {/* Per-member correction hints */}
                          {membersNeedingCorrection.map(m => (
                            <p key={m.id} className="text-xs text-orange-600 mt-0.5">
                              {m.name} needs correction
                            </p>
                          ))}
                          {latestRemark && (
                            <p className="text-xs text-[#4A4A4A]/70 mt-1 truncate max-w-md">
                              {latestRemark.message.slice(0, 80)}{latestRemark.message.length > 80 ? '…' : ''}
                            </p>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditGuestId(g.id)}
                            className="border-[#2D5A45] text-[#2D5A45] hover:bg-[#E8F5EE] gap-1.5"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Edit &amp; Fix
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setResubmitGuestId(g.id)}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            Re-Submit
                          </Button>
                        </div>
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
            Are you sure you want to re-submit <span className="font-semibold">{resubmitGuest?.fullName}</span> for review?
            This will change their status back to "Awaiting Review".
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
