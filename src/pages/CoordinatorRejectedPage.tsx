import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  LayoutDashboard, Users, Clock, MessageSquare,
  ChevronDown, LogOut,
  CheckCircle, XCircle,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel } from '@/components/ProfileDialog';

const COORD_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: Clock,           label: 'Pending Guests',     href: '/coordinator/pending' },
  { icon: Users,           label: 'Submitted Guests',   href: '/coordinator/submitted' },
  { icon: XCircle,         label: 'Rejected Guests',    href: '/coordinator/rejected' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/coordinator/messages' },
];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function CoordinatorRejectedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [appealGuestId, setAppealGuestId] = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');

  if (!user) return null;

  const myGuests = guests.filter(g => g.submittedBy === user.id);
  const pendingCount = myGuests.filter(
    g => g.status === 'Awaiting Review' || g.status === 'Needs Correction'
  ).length;
  const rejected = myGuests.filter(g => g.status === 'Rejected');

  const appealGuest = guests.find(g => g.id === appealGuestId) ?? null;

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
                  item.href === '/coordinator/rejected'
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
                {item.href === '/coordinator/rejected' && rejected.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {rejected.length}
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
                <XCircle className="w-5 h-5 text-red-500" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Rejected Guests</h1>
                {rejected.length > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    {rejected.length} rejected
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

          <div className="p-6 max-w-4xl mx-auto">
            <div className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              {rejected.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <CheckCircle className="w-12 h-12 text-green-400" />
                  <p className="text-lg font-medium text-[#1A1A1A]">No rejected guests</p>
                  <p className="text-sm text-[#4A4A4A]">None of your guests have been rejected.</p>
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
                        {g.appealStatus === 'overturned' && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                            Appeal Overturned
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
                      {(!g.appealStatus || g.appealStatus === 'none') ? (
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
        </main>
      </div>

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
