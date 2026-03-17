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
import { DepartmentSelect } from '@/components/DepartmentSelect';
import { toast } from 'sonner';
import {
  LayoutDashboard, ClipboardList, CheckSquare, MessageSquare, XCircle,
  Search, ChevronDown, LogOut,
  CheckCircle, AlertCircle, Eye, Pencil, ChevronLeft, ChevronRight, Building2,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import { useDepartments } from '@/hooks/useDepartments';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel } from '@/components/ProfileDialog';
import { sanitizeComment } from '@/hooks/useAuditTrail';
import type { Guest } from '@/types';

const DESK_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
  { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
  { icon: XCircle,         label: 'Rejected Guests',    href: '/desk/rejected' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
];

const PAGE_SIZE = 15;

export default function GuestsToReviewPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { addEntry, addComment } = useAuditTrail();
  const { getDeptBadgeCls } = useDepartments();

  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [editGuestId, setEditGuestId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Approve confirmation dialog
  const [approveGuestId, setApproveGuestId] = useState<string | null>(null);
  // Needs Correction dialog
  const [correctionDialog, setCorrectionDialog] = useState<{ open: boolean; guest: Guest | null; reason: string }>({
    open: false, guest: null, reason: '',
  });
  // Reject dialog
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; guest: Guest | null; reason: string }>({
    open: false, guest: null, reason: '',
  });

  // Department assignment
  const [deptAssign, setDeptAssign] = useState<{ guestId: string; dept: string } | null>(null);
  const [deptWarningGuestId, setDeptWarningGuestId] = useState<string | null>(null);
  const [deptSelectGuestId, setDeptSelectGuestId] = useState<string | null>(null);
  const [deptSelectValue, setDeptSelectValue] = useState('');

  if (!user) return null;

  const assignedCountries = user.assignedCountries || [];

  // Only "Awaiting Review" guests from DI's countries
  const reviewGuests = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) &&
      g.status === 'Awaiting Review'
    ),
    [guests, assignedCountries]
  );

  const reviewCount = reviewGuests.length;

  const rejectedCount = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) && g.status === 'Rejected'
    ).length,
    [guests, assignedCountries]
  );

  const countriesWithGuests = useMemo(() => {
    const s = new Set(reviewGuests.map(g => g.country));
    return Array.from(s).sort();
  }, [reviewGuests]);

  const filtered = useMemo(() => {
    setPage(1);
    return reviewGuests.filter(g => {
      if (countryFilter !== 'all' && g.country !== countryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!g.fullName.toLowerCase().includes(s) &&
            !g.referenceNumber.toLowerCase().includes(s) &&
            !g.country.toLowerCase().includes(s)) return false;
      }
      return true;
    }).sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewGuests, countryFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  const handleDeptAssignById = (guestId: string, dept: string) => {
    const g = guests.find(x => x.id === guestId);
    if (!g) return;
    updateGuest(guestId, {
      assignedDepartment: dept,
      assignedDepartmentAt: new Date().toISOString(),
      assignedDepartmentBy: user.id,
      assignedDepartmentByName: user.name,
    });
    addEntry({
      guestId: g.id,
      guestName: g.fullName,
      guestReference: g.referenceNumber,
      type: 'assignment',
      action: 'Department assigned',
      details: `Assigned to ${dept}`,
      newValue: dept,
      createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
      createdAt: new Date().toISOString(),
    });
    toast.success(`${g.fullName} assigned to ${dept}`);
  };

  const handleDeptAssign = () => {
    if (!deptAssign) return;
    handleDeptAssignById(deptAssign.guestId, deptAssign.dept);
    setDeptAssign(null);
  };

  const handleApproveClick = (g: Guest) => {
    if (!g.assignedDepartment) {
      setDeptWarningGuestId(g.id);
    } else {
      setApproveGuestId(g.id);
    }
  };

  const approveGuest = guests.find(g => g.id === approveGuestId) ?? null;

  const handleApproveConfirm = () => {
    if (!approveGuest) return;
    updateGuest(approveGuest.id, { status: 'Approved' });
    makeAuditEntry(approveGuest, approveGuest.status, 'Approved');
    toast.success(`${approveGuest.fullName} approved`);
    setApproveGuestId(null);
  };

  const handleNeedsCorrection = () => {
    const { guest, reason } = correctionDialog;
    if (!guest || reason.trim().length < 10) return;
    const safe = sanitizeComment(reason);
    updateGuest(guest.id, { status: 'Needs Correction' });
    makeAuditEntry(guest, guest.status, 'Needs Correction');
    if (safe) {
      addComment({
        guestId: guest.id,
        guestName: guest.fullName,
        guestReference: guest.referenceNumber,
        comment: safe,
        createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
      });
    }
    toast.success(`Correction requested for ${guest.fullName}`);
    setCorrectionDialog({ open: false, guest: null, reason: '' });
  };

  const handleReject = () => {
    const { guest, reason } = rejectDialog;
    if (!guest || reason.trim().length < 10) return;
    const safe = sanitizeComment(reason);
    updateGuest(guest.id, {
      status: 'Rejected',
      rejectionReason: safe,
    });
    makeAuditEntry(guest, guest.status, 'Rejected');
    if (safe) {
      addComment({
        guestId: guest.id,
        guestName: guest.fullName,
        guestReference: guest.referenceNumber,
        comment: safe,
        createdBy: { id: user.id, name: user.name, role: 'desk-in-charge' },
      });
    }
    toast.success(`${guest.fullName} rejected`);
    setRejectDialog({ open: false, guest: null, reason: '' });
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
                {item.href === '/desk/rejected' && rejectedCount > 0 && (
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
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Guests to Review</h1>
                {reviewCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {reviewCount} awaiting review
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

          <div className="p-6 max-w-7xl mx-auto space-y-5">
            {/* Search + country filter */}
            <Card className="shadow-sm">
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
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
                  {countriesWithGuests.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardList className="w-5 h-5 text-[#2D5A45]" />
                  Awaiting Review
                  <span className="text-sm font-normal text-[#4A4A4A] ml-1">({filtered.length})</span>
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
                    <Button onClick={() => navigate('/desk/processed')} variant="outline" className="mt-2 border-[#D4CFC7]">
                      View Processed Guests
                    </Button>
                  </div>
                ) : (
                  <>
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
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Department</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {paginated.map(g => (
                            <tr key={g.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-[#1A1A1A]">{g.fullName}</span>
                                  {(g.resubmitCount ?? 0) > 0 && (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">
                                      Re-submitted
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200 capitalize">
                                  {g.guestType}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.submittedAt ?? '—'}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                  {GUEST_STATUS_LABELS[g.status] ?? g.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={e => { e.stopPropagation(); setViewGuestId(g.id); }}
                                    title="View details"
                                    className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setEditGuestId(g.id); }}
                                    title="Edit guest"
                                    className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleApproveClick(g); }}
                                    title="Approve"
                                    className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setCorrectionDialog({ open: true, guest: g, reason: '' }); }}
                                    title="Needs Correction"
                                    className="p-1.5 rounded-md text-orange-500 hover:bg-orange-50 transition-colors"
                                  >
                                    <AlertCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setRejectDialog({ open: true, guest: g, reason: '' }); }}
                                    title="Reject"
                                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {g.assignedDepartment ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getDeptBadgeCls(g.assignedDepartment)}`}>
                                    {g.assignedDepartment}
                                  </span>
                                ) : (
                                  <DepartmentSelect
                                    value=""
                                    onValueChange={v => { if (v) setDeptAssign({ guestId: g.id, dept: v }); }}
                                    placeholder="Select..."
                                    stopPropagation
                                    className="text-xs min-w-[130px]"
                                  />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DB] bg-[#F9F8F6]">
                        <span className="text-xs text-[#4A4A4A]">
                          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-white disabled:opacity-40 transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs text-[#4A4A4A] px-2">Page {page} of {totalPages}</span>
                          <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-white disabled:opacity-40 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
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

      {/* Guest Edit Modal */}
      <GuestViewModal
        guest={guests.find(g => g.id === editGuestId) ?? null}
        open={!!editGuestId}
        onClose={() => setEditGuestId(null)}
        isEditMode={true}
      />

      {/* Dept Assign Confirmation */}
      <Dialog open={!!deptAssign} onOpenChange={open => { if (!open) setDeptAssign(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#2D5A45]" />
              Assign Department
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Assign <span className="font-semibold">{guests.find(g => g.id === deptAssign?.guestId)?.fullName}</span> to{' '}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getDeptBadgeCls(deptAssign?.dept ?? '')}`}>
              {deptAssign?.dept}
            </span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptAssign(null)}>Cancel</Button>
            <Button onClick={handleDeptAssign} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              <Building2 className="w-4 h-4 mr-1.5" />
              Confirm Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve without dept warning */}
      <Dialog open={!!deptWarningGuestId} onOpenChange={open => { if (!open) setDeptWarningGuestId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Approve without assigning department?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            You haven't assigned a department yet. You can assign later from Processed Guests.
          </p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => {
              const id = deptWarningGuestId;
              setDeptWarningGuestId(null);
              setDeptSelectGuestId(id);
              setDeptSelectValue('');
            }}>
              Assign Now
            </Button>
            <Button onClick={() => {
              const id = deptWarningGuestId;
              setDeptWarningGuestId(null);
              setApproveGuestId(id);
            }} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Approve Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Now dept picker */}
      <Dialog open={!!deptSelectGuestId} onOpenChange={open => { if (!open) { setDeptSelectGuestId(null); setDeptSelectValue(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#2D5A45]" />
              Assign Department
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-[#4A4A4A]">
              Select a department for <span className="font-semibold">{guests.find(g => g.id === deptSelectGuestId)?.fullName}</span>:
            </p>
            <DepartmentSelect
              value={deptSelectValue}
              onValueChange={setDeptSelectValue}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeptSelectGuestId(null); setDeptSelectValue(''); }}>Cancel</Button>
            <Button
              disabled={!deptSelectValue}
              onClick={() => {
                if (deptSelectGuestId && deptSelectValue) {
                  handleDeptAssignById(deptSelectGuestId, deptSelectValue);
                  setDeptSelectGuestId(null);
                  setDeptSelectValue('');
                }
              }}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              <Building2 className="w-4 h-4 mr-1.5" />
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <Dialog open={!!approveGuestId} onOpenChange={open => { if (!open) setApproveGuestId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Approve Guest
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Are you sure you want to approve{' '}
            <span className="font-semibold">{approveGuest?.fullName}</span>?
            This will change their status to "Approved".
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveGuestId(null)}>Cancel</Button>
            <Button onClick={handleApproveConfirm} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Confirm Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              placeholder="Describe what needs to be corrected (required, min. 10 chars)..."
              rows={4}
              maxLength={1000}
              className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
            />
            {correctionDialog.reason.length > 0 && correctionDialog.reason.trim().length < 10 && (
              <p className="text-xs text-red-500">Please provide at least 10 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionDialog({ open: false, guest: null, reason: '' })}>
              Cancel
            </Button>
            <Button
              onClick={handleNeedsCorrection}
              disabled={correctionDialog.reason.trim().length < 10}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
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
              placeholder="Reason for rejection (required, min. 10 chars)..."
              rows={4}
              maxLength={1000}
              className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
            />
            {rejectDialog.reason.length > 0 && rejectDialog.reason.trim().length < 10 && (
              <p className="text-xs text-red-500">Please provide at least 10 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, guest: null, reason: '' })}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejectDialog.reason.trim().length < 10}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
