import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { GuestEditModal } from '@/components/GuestEditModal';
import { toast } from 'sonner';
import {
  LayoutDashboard, Users, Clock, MessageSquare,
  ChevronDown, LogOut,
  CheckCircle, AlertCircle, XCircle, Edit,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';

const COORD_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: Clock,           label: 'Pending Guests',     href: '/coordinator/pending' },
  { icon: Users,           label: 'Submitted Guests',   href: '/coordinator/submitted' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/coordinator/messages' },
];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function CoordinatorPendingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Edit modal state
  const [editGuestId, setEditGuestId] = useState<string | null>(null);

  // Re-submit confirmation dialog
  const [resubmitGuestId, setResubmitGuestId] = useState<string | null>(null);

  // Appeal dialog state
  const [appealGuestId, setAppealGuestId] = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');

  if (!user) return null;

  const myGuests = guests.filter(g => g.submittedBy === user.id);
  const needsCorrection = myGuests.filter(g => g.status === 'Needs Correction');
  const rejected = myGuests.filter(g => g.status === 'Rejected');

  const pendingCount = needsCorrection.length + rejected.length;

  const editGuest = guests.find(g => g.id === editGuestId) ?? null;
  const resubmitGuest = guests.find(g => g.id === resubmitGuestId) ?? null;
  const appealGuest = guests.find(g => g.id === appealGuestId) ?? null;

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

  const handleAppeal = () => {
    if (!appealGuest || appealText.trim().length < 10) return;
    updateGuest(appealGuest.id, {
      appealStatus: 'pending',
      appealReason: appealText.trim(),
      appealedAt: new Date().toISOString(),
    });
    setAppealGuestId(null);
    setAppealText('');
    toast.success('Appeal submitted to Super Admin');
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
              </button>
            ))}
          </nav>
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

          <div className="p-6 max-w-4xl mx-auto space-y-6">

            {/* Section A: Needs Correction */}
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
                    return (
                      <div key={g.id} className="flex items-center gap-4 px-5 py-4 border-b border-[#E8E3DB] last:border-b-0">
                        {/* Avatar */}
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-sm shrink-0">
                          {getInitials(g.fullName)}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#1A1A1A]">{g.fullName}</span>
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
                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
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

            {/* Section B: Rejected */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-semibold text-[#1A1A1A]">Rejected</h2>
                {rejected.length > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    {rejected.length}
                  </Badge>
                )}
              </div>
              <div className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm overflow-hidden">
                {rejected.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                    <p className="text-sm text-[#4A4A4A]">No rejected guests.</p>
                  </div>
                ) : (
                  rejected.map(g => (
                    <div key={g.id} className="flex items-center gap-4 px-5 py-4 border-b border-[#E8E3DB] last:border-b-0">
                      {/* Avatar */}
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-700 font-bold text-sm shrink-0">
                        {getInitials(g.fullName)}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#1A1A1A]">{g.fullName}</span>
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                            Rejected
                          </Badge>
                          {g.appealStatus === 'pending' && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                              Appeal Pending
                            </Badge>
                          )}
                          {g.appealStatus === 'denied' && (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">
                              Appeal Denied
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[#4A4A4A] mt-0.5 font-mono">{g.referenceNumber}</p>
                        {g.rejectionReason && (
                          <p className="text-xs text-[#4A4A4A]/70 mt-1 truncate max-w-md">
                            {g.rejectionReason.slice(0, 80)}{g.rejectionReason.length > 80 ? '…' : ''}
                          </p>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="shrink-0">
                        {g.appealStatus === 'none' || !g.appealStatus ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setAppealGuestId(g.id); setAppealText(''); }}
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            Appeal to Admin
                          </Button>
                        ) : (
                          <span className="text-xs text-[#4A4A4A]/50 italic">Appeal submitted</span>
                        )}
                      </div>
                    </div>
                  ))
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
      <GuestEditModal
        guest={editGuest}
        open={!!editGuestId}
        onClose={() => setEditGuestId(null)}
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

      {/* Appeal dialog */}
      <Dialog open={!!appealGuestId} onOpenChange={open => { if (!open) { setAppealGuestId(null); setAppealText(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Appeal to Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#4A4A4A]">
              Provide a reason for appealing the rejection of{' '}
              <span className="font-semibold">{appealGuest?.fullName}</span>.
            </p>
            <Textarea
              value={appealText}
              onChange={e => setAppealText(e.target.value)}
              placeholder="Explain why this rejection should be reconsidered (min. 10 characters)..."
              rows={4}
              maxLength={500}
              className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
            />
            <p className="text-xs text-[#4A4A4A]/50 text-right">{appealText.length}/500</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAppealGuestId(null); setAppealText(''); }}>Cancel</Button>
            <Button
              onClick={handleAppeal}
              disabled={appealText.trim().length < 10}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              Submit Appeal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
