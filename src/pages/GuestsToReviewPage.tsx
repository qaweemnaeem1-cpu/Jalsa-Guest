import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { GuestViewModal } from '@/components/GuestViewModal';
import { toast } from 'sonner';
import {
  LayoutDashboard, ClipboardList, CheckSquare, ScrollText,
  ArrowLeft, Search, ChevronDown, LogOut,
  CheckCircle, AlertCircle, XCircle, Eye,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import { sanitizeComment } from '@/hooks/useAuditTrail';
import type { Guest } from '@/types';

const DESK_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',        href: '/dashboard' },
  { icon: ClipboardList,   label: 'Guests to Review', href: '/desk/review' },
  { icon: CheckSquare,     label: 'Approved Guests',  href: '/desk/approved' },
  { icon: ScrollText,      label: 'Audit Trail',      href: '/desk/audit-trail' },
];

type StatusFilter = 'all' | 'pending-review' | 'needs-correction';

export default function GuestsToReviewPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { addEntry, addComment } = useAuditTrail();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [viewGuestId, setViewGuestId] = useState<string | null>(null);

  // Needs Correction dialog
  const [correctionDialog, setCorrectionDialog] = useState<{ open: boolean; guest: Guest | null; reason: string }>({
    open: false, guest: null, reason: '',
  });
  // Reject dialog
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; guest: Guest | null; reason: string }>({
    open: false, guest: null, reason: '',
  });

  if (!user) return null;

  const assignedCountries = user.assignedCountries || [];

  // Guests from DI's countries that need review
  const reviewGuests = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) &&
      (g.status === 'pending-review' || g.status === 'needs-correction')
    ),
    [guests, assignedCountries]
  );

  const pendingCount = reviewGuests.filter(g => g.status === 'pending-review').length;
  const correctionCount = reviewGuests.filter(g => g.status === 'needs-correction').length;
  const reviewCount = reviewGuests.length;

  // Countries with review guests (for filter dropdown)
  const countriesWithGuests = useMemo(() => {
    const s = new Set(reviewGuests.map(g => g.country));
    return Array.from(s).sort();
  }, [reviewGuests]);

  // Apply search + status + country filters
  const filtered = useMemo(() => {
    return reviewGuests.filter(g => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (countryFilter !== 'all' && g.country !== countryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!g.fullName.toLowerCase().includes(s) &&
            !g.referenceNumber.toLowerCase().includes(s) &&
            !g.country.toLowerCase().includes(s)) return false;
      }
      return true;
    }).sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  }, [reviewGuests, statusFilter, countryFilter, search]);

  const makeAuditEntry = (guest: Guest, oldStatus: string, newStatus: string) => {
    addEntry({
      guestId: guest.id,
      guestName: guest.fullName,
      guestReference: guest.referenceNumber,
      type: 'status_change',
      action: 'Status changed',
      details: `${GUEST_STATUS_LABELS[oldStatus] ?? oldStatus} → ${GUEST_STATUS_LABELS[newStatus] ?? newStatus}`,
      oldValue: GUEST_STATUS_LABELS[oldStatus] ?? oldStatus,
      newValue: GUEST_STATUS_LABELS[newStatus] ?? newStatus,
      createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
      createdAt: new Date().toISOString(),
    });
  };

  const handleApprove = (guest: Guest) => {
    updateGuest(guest.id, { status: 'approved' });
    makeAuditEntry(guest, guest.status, 'approved');
    toast.success(`${guest.fullName} approved`);
  };

  const handleNeedsCorrection = () => {
    const { guest, reason } = correctionDialog;
    if (!guest) return;
    const safe = sanitizeComment(reason);
    updateGuest(guest.id, { status: 'needs-correction' });
    makeAuditEntry(guest, guest.status, 'needs-correction');
    if (safe) {
      addComment({
        guestId: guest.id,
        guestName: guest.fullName,
        guestReference: guest.referenceNumber,
        comment: safe,
        createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
      });
    }
    toast.info(`Sent back for correction: ${guest.fullName}`);
    setCorrectionDialog({ open: false, guest: null, reason: '' });
  };

  const handleReject = () => {
    const { guest, reason } = rejectDialog;
    if (!guest) return;
    const safe = sanitizeComment(reason);
    updateGuest(guest.id, { status: 'rejected' });
    makeAuditEntry(guest, guest.status, 'rejected');
    if (safe) {
      addComment({
        guestId: guest.id,
        guestName: guest.fullName,
        guestReference: guest.referenceNumber,
        comment: safe,
        createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
      });
    }
    toast.error(`Guest rejected: ${guest.fullName}`);
    setRejectDialog({ open: false, guest: null, reason: '' });
  };

  const filterCls = (active: boolean) =>
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
                  item.href === '/desk/review'
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
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Guests to Review</h1>
                {reviewCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {reviewCount} need attention
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

          <div className="p-6 max-w-7xl mx-auto space-y-5">
            {/* Status chips + search + country filter */}
            <Card className="shadow-sm">
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setStatusFilter('all')} className={filterCls(statusFilter === 'all')}>
                    All ({reviewCount})
                  </button>
                  <button onClick={() => setStatusFilter('pending-review')} className={filterCls(statusFilter === 'pending-review')}>
                    Awaiting Review ({pendingCount})
                  </button>
                  <button onClick={() => setStatusFilter('needs-correction')} className={filterCls(statusFilter === 'needs-correction')}>
                    Needs Correction ({correctionCount})
                  </button>
                </div>
                <div className="flex items-center gap-3 ml-auto flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search guests..."
                      className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9 w-56"
                    />
                  </div>
                  <select
                    value={countryFilter}
                    onChange={e => setCountryFilter(e.target.value)}
                    className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9"
                  >
                    <option value="all">All Countries</option>
                    {countriesWithGuests.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardList className="w-5 h-5 text-[#2D5A45]" />
                  Guests Awaiting Your Review
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <CheckCircle className="w-12 h-12 text-green-400" />
                    <p className="text-lg font-medium text-[#1A1A1A]">All caught up!</p>
                    <p className="text-sm text-[#4A4A4A]">
                      {reviewCount === 0 ? 'No guests need your review right now.' : 'No guests match the selected filters.'}
                    </p>
                    <Button onClick={() => navigate('/desk/approved')} variant="outline" className="mt-2 border-[#D4CFC7]">
                      View Approved Guests
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F9F8F6]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Submitted</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {filtered.map(g => (
                          <tr key={g.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                            <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                            <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200 capitalize">
                                {g.guestType}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.submittedAt ?? '—'}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`text-xs ${g.status === 'pending-review'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-orange-50 text-orange-700 border-orange-200'
                                }`}
                              >
                                {GUEST_STATUS_LABELS[g.status] ?? g.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setViewGuestId(g.id)}
                                  title="View details"
                                  className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleApprove(g)}
                                  title="Approve"
                                  className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setCorrectionDialog({ open: true, guest: g, reason: '' })}
                                  title="Needs Correction"
                                  className="p-1.5 rounded-md text-orange-500 hover:bg-orange-50 transition-colors"
                                >
                                  <AlertCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setRejectDialog({ open: true, guest: g, reason: '' })}
                                  title="Reject"
                                  className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Guest View Modal */}
      <GuestViewModal
        guest={guests.find(g => g.id === viewGuestId) ?? null}
        open={!!viewGuestId}
        onClose={() => setViewGuestId(null)}
      />

      {/* Needs Correction Dialog */}
      <Dialog
        open={correctionDialog.open}
        onOpenChange={open => !open && setCorrectionDialog({ open: false, guest: null, reason: '' })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Request Correction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {correctionDialog.guest && (
              <p className="text-sm text-[#4A4A4A]">
                Sending <span className="font-medium">{correctionDialog.guest.fullName}</span> back for correction.
              </p>
            )}
            <Textarea
              value={correctionDialog.reason}
              onChange={e => setCorrectionDialog(d => ({ ...d, reason: e.target.value }))}
              placeholder="Describe what needs to be corrected (optional)..."
              rows={4}
              maxLength={1000}
              className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionDialog({ open: false, guest: null, reason: '' })}>
              Cancel
            </Button>
            <Button onClick={handleNeedsCorrection} className="bg-orange-500 hover:bg-orange-600 text-white">
              <AlertCircle className="w-4 h-4 mr-1.5" />
              Send for Correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={open => !open && setRejectDialog({ open: false, guest: null, reason: '' })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Reject Guest
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rejectDialog.guest && (
              <p className="text-sm text-[#4A4A4A]">
                Rejecting <span className="font-medium text-red-600">{rejectDialog.guest.fullName}</span>. This action should be used carefully.
              </p>
            )}
            <Textarea
              value={rejectDialog.reason}
              onChange={e => setRejectDialog(d => ({ ...d, reason: e.target.value }))}
              placeholder="Reason for rejection (optional)..."
              rows={4}
              maxLength={1000}
              className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, guest: null, reason: '' })}>
              Cancel
            </Button>
            <Button onClick={handleReject} className="bg-red-600 hover:bg-red-700 text-white">
              <XCircle className="w-4 h-4 mr-1.5" />
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
