import { useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useUsers } from '@/hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  LogOut,
  Eye,
  Pencil,
  Trash2,
  Briefcase,
  Globe,
  Send,
  MessageSquare,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
  ScrollText,
  ClipboardList,
  CheckSquare,
  BedDouble,
  Columns,
  User,
} from 'lucide-react';
import { ProfileDialog } from '@/components/ProfileDialog';
import { insertCorrectionMessage, insertApprovalMessage, insertRejectionMessage, insertResubmitMessage, insertCommentMessage } from '@/lib/guestMessages';
import { useMemo, useRef, useEffect } from 'react';
import { useRooms } from '@/hooks/useRooms';
import { GUEST_STATUS_LABELS, ROLE_LABELS, formatDesignation, getTierBadgeLabel, getTierBadgeClass } from '@/lib/constants';
import { DelegationCombobox } from '@/components/DelegationCombobox';
import { MulaqatTypeSelect } from '@/components/MulaqatTypeSelect';
import { useDelegations } from '@/hooks/useDelegations';
import { GuestViewModal } from '@/components/GuestViewModal';
import { FamilyStatusCell } from '@/components/FamilyStatusCell';
import { DepartmentSelect } from '@/components/DepartmentSelect';
import { supabase } from '@/lib/supabase';
import { buildDisplayGroups, statusDotColor, statusBadgeCls as familyStatusBadgeCls } from '@/lib/familyGroups';
import { useDesignations } from '@/hooks/useDesignations';
import type { UserRole, Guest, Designation } from '@/types';
import { SUPER_ADMIN_NAV, DESK_NAV, COORD_NAV } from '@/lib/navItems';

const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': SUPER_ADMIN_NAV,
  'desk-in-charge': DESK_NAV,
  'coordinator': COORD_NAV,
  'transport': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'accommodation': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'viewer': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'department-head': [],
  'location-manager': [],
};

// Designation cell with tier badge
function DesignationCell({ designation, designations }: { designation?: string | string[] | null; designations: Designation[] }) {
  if (!designation) return <span className="text-gray-300">—</span>;
  const names = Array.isArray(designation) ? designation : [designation];
  if (names.length === 0) return <span className="text-gray-300">—</span>;
  const tierMap = new Map(designations.map(d => [d.name, d.tier]));
  // Show first designation with tier badge, rest as count
  const first = names[0];
  const tier = tierMap.get(first);
  const badge = getTierBadgeLabel(tier);
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <span className="text-sm text-[#1A1A1A]">{names.length > 1 ? `${first} +${names.length - 1}` : first}</span>
      {badge && <span className={`text-[10px] font-bold px-1.5 py-px rounded-full shrink-0 ${getTierBadgeClass(tier)}`}>{badge}</span>}
    </span>
  );
}

// Format relative time
const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
};

// Format date as "24 Mar 2026"
const formatDate = (dateString: string) => {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Get status badge styling
const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'Awaiting Review':  return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Needs Correction': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'Approved':         return 'bg-green-50 text-green-700 border-green-200';
    case 'Accommodated':     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Rejected':         return 'bg-red-50 text-red-700 border-red-200';
    default:                 return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};


// Inline Remarks Panel for Coordinator
interface CoordinatorRemarksPanelProps {
  guest: Guest;
  onAddReply: (message: string) => void;
  onResubmit: () => void;
}

function CoordinatorRemarksPanel({ guest, onAddReply, onResubmit }: CoordinatorRemarksPanelProps) {
  const [replyText, setReplyText] = useState('');
  const remarks = guest.remarks || [];

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    onAddReply(replyText.trim());
    setReplyText('');
  };

  return (
    <tr>
      <td colSpan={12} className="p-0">
        <div className="bg-[#FEF9C3] border-l-4 border-amber-500 p-4 m-2 rounded-r-lg">
          <h4 className="font-medium text-amber-800 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Messages
          </h4>

          <div className="space-y-3 mb-4">
            {remarks.map((remark) => (
              <div key={remark.id} className="bg-white rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-[#1A1A1A]">{remark.authorName}</span>
                  <span className="text-xs bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-amber-700 capitalize">
                    {ROLE_LABELS[remark.authorRole]}
                  </span>
                  <span className="text-xs text-[#4A4A4A]">· {formatTimeAgo(remark.createdAt)}</span>
                </div>
                <p className="text-sm text-[#4A4A4A]">{remark.message}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Add a reply or note..."
              className="flex-1 bg-white border-amber-200 focus:border-amber-500 h-10"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendReply();
              }}
            />
            <Button
              onClick={handleSendReply}
              disabled={!replyText.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white h-10 px-4"
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
            <Button
              onClick={onResubmit}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-10 px-4"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Resubmit
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// Inline Remarks Panel for Desk Incharge
interface DeskInchargeRemarksPanelProps {
  onConfirm: (remark: string, action: 'Needs Correction' | 'Rejected') => void;
}

function DeskInchargeRemarksPanel({ onConfirm }: DeskInchargeRemarksPanelProps) {
  const [remarkText, setRemarkText] = useState('');

  const handleConfirm = (action: 'Needs Correction' | 'Rejected') => {
    if (!remarkText.trim()) {
      toast.error('Please add a message before confirming');
      return;
    }
    onConfirm(remarkText.trim(), action);
    setRemarkText('');
  };

  return (
    <tr>
      <td colSpan={12} className="p-0">
        <div className="bg-[#FEE2E2] border-l-4 border-red-500 p-4 m-2 rounded-r-lg">
          <h4 className="font-medium text-red-800 mb-3">Add Message for Coordinator</h4>
          
          <textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Explain why this guest needs correction or is being rejected..."
            rows={3}
            className="w-full px-3 py-2 border border-red-200 rounded-md text-sm bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none mb-3"
          />

          <div className="flex gap-2 justify-end">
            <Button
              onClick={() => handleConfirm('Needs Correction')}
              disabled={!remarkText.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white h-10 px-4"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Confirm Needs Correction
            </Button>
            <Button
              onClick={() => handleConfirm('Rejected')}
              disabled={!remarkText.trim()}
              className="bg-red-600 hover:bg-red-700 text-white h-10 px-4"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Confirm Reject
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function GuestsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest, deleteGuest, getMyWaitingGuests, getMySubmittedGuests, getNeedsCorrectionCount, updateFamilyMemberStatus, assignFamilyMemberDepartment } = useGuests();
  const { users } = useUsers();
  const { rooms, bedAssignments } = useRooms();
  const { designations: allDesignations } = useDesignations();
  const { getDelegationCountry, changeDelegationCountry, setMulaqatType } = useDelegations();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState({ dept: true, passportCountry: false, location: false, room: false, submitted: false });
  const colsRef = useRef<HTMLDivElement>(null);
  // Super-admin filter chips
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'submitted' | 'rejected'>('all');
  // Super-admin remark/reject dialog
  const [remarkDialog, setRemarkDialog] = useState<{
    open: boolean; guestId: string; action: 'Needs Correction' | 'Rejected';
  }>({ open: false, guestId: '', action: 'Rejected' });
  const [remarkText, setRemarkText] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build guestId → "RoomName / Bed N" map (head guests only)
  const guestRoomMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const room of rooms) {
      for (const bed of bedAssignments[room.id] ?? []) {
        if (bed.guestId && !bed.familyMemberId) {
          m.set(bed.guestId, `${room.name} / Bed ${bed.bedNumber}`);
        }
      }
    }
    return m;
  }, [rooms, bedAssignments]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'waiting' | 'submitted' | 'awaiting' | 'processed'>('waiting');
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [assignAllValues, setAssignAllValues] = useState<Record<string, string>>({});
  const [familyCorrectionDialog, setFamilyCorrectionDialog] = useState<{ members: Guest[]; reason: string } | null>(null);
  const [familyRejectDialog, setFamilyRejectDialog] = useState<{ members: Guest[]; reason: string } | null>(null);
  const [deskInchargeFilter, setDeskInchargeFilter] = useState<string>('all');
  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [viewGuestEditMode, setViewGuestEditMode] = useState(false);
  const [deleteGuestId, setDeleteGuestId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const viewGuest = viewGuestId ? guests.find(g => g.id === viewGuestId) ?? null : null;
  const guestToDelete = deleteGuestId ? guests.find(g => g.id === deleteGuestId) ?? null : null;

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // Get coordinator name for desk incharge view
  const getCoordinatorName = (submittedBy: string) => {
    const coordinator = users.find(u => u.id === submittedBy);
    return coordinator?.name || 'Unknown';
  };

  // Desk incharges for filter dropdown (super-admin only)
  const deskIncharges = users.filter(u => u.userType === 'desk-in-charge' && u.assignedCountries?.length);

  // Filter guests based on role and tab
  const getFilteredGuests = () => {
    let result: typeof guests;
    if (user.role === 'coordinator') {
      result = activeTab === 'waiting' ? getMyWaitingGuests() : getMySubmittedGuests();
    } else if (user.role === 'desk-in-charge') {
      result = activeTab === 'awaiting'
        ? guests.filter(g => g.status === 'Awaiting Review')
        : guests.filter(g => g.status === 'Approved' || g.status === 'Rejected' || g.status === 'Needs Correction');
    } else {
      result = guests;
    }
    // Apply desk incharge country filter (super-admin only)
    if (deskInchargeFilter !== 'all') {
      const di = deskIncharges.find(u => u.id === deskInchargeFilter);
      if (di?.assignedCountries?.length) {
        result = result.filter(g => di.assignedCountries!.includes(g.country));
      }
    }
    // Apply super-admin status filter chips
    if (user.role === 'super-admin' && adminFilter !== 'all') {
      if (adminFilter === 'pending') {
        result = result.filter(g => g.status === 'Awaiting Review' || g.status === 'Needs Correction');
      } else if (adminFilter === 'submitted') {
        result = result.filter(g => g.status === 'Approved' || g.status === 'Accommodated');
      } else if (adminFilter === 'rejected') {
        result = result.filter(g => g.status === 'Rejected');
      }
    }
    return result;
  };

  const filteredGuests = getFilteredGuests().filter(guest => 
    guest.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    guest.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    guest.passportNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle submit for review (coordinator)
  const handleSubmitForReview = (guestId: string) => {
    updateGuest(guestId, { status: 'Awaiting Review' });
    toast.success('Guest submitted for review');
  };

  // Handle approve (desk incharge)
  const handleApprove = (guestId: string) => {
    updateGuest(guestId, { status: 'Approved' });
    if (user) insertApprovalMessage(guestId, user);
    toast.success('Guest approved');
  };

  // Handle needs correction or reject (desk incharge)
  const handleDeskAction = (guestId: string, remark: string, action: 'Needs Correction' | 'Rejected') => {
    if (!user) return;
    updateGuest(guestId, { status: action });
    if (action === 'Needs Correction') {
      insertCorrectionMessage(guestId, user, remark);
    } else {
      insertRejectionMessage(guestId, user, remark);
    }
    setExpandedGuestId(null);
    toast.success(`Guest marked as ${action === 'Needs Correction' ? 'needs correction' : 'rejected'}`);
  };

  // Handle add reply (coordinator)
  const handleAddReply = (guestId: string, message: string) => {
    if (!user) return;
    insertCommentMessage(guestId, user, message);
    toast.success('Reply added');
  };

  // Handle resubmit (coordinator)
  const handleResubmit = (guestId: string) => {
    updateGuest(guestId, { status: 'Awaiting Review' });
    if (user) insertResubmitMessage(guestId, user);
    setExpandedGuestId(null);
    toast.success('Guest resubmitted for review');
  };

  // Super-admin: open remark dialog for needs correction / reject
  const openRemarkDialog = (guestId: string, action: 'Needs Correction' | 'Rejected') => {
    setRemarkText('');
    setRemarkDialog({ open: true, guestId, action });
  };

  const handleAdminConfirmAction = () => {
    if (!remarkDialog.guestId || !user) return;
    const remarkMessage = remarkText.trim() || (remarkDialog.action === 'Needs Correction' ? 'Needs Correction' : remarkDialog.action);
    updateGuest(remarkDialog.guestId, { status: remarkDialog.action });
    if (remarkDialog.action === 'Needs Correction') {
      insertCorrectionMessage(remarkDialog.guestId, user, remarkMessage);
    } else {
      insertRejectionMessage(remarkDialog.guestId, user, remarkMessage);
    }
    toast.success(`Guest marked as ${remarkDialog.action}`);
    setRemarkDialog({ open: false, guestId: '', action: 'Rejected' });
  };

  const handleDeptChange = async (guestId: string, dept: string) => {
    const g = guests.find(x => x.id === guestId);
    if (!g) return;
    const isChange = !!g.assignedDepartment && g.assignedDepartment !== dept;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      assigned_department: dept || null,
      assigned_department_at: dept ? now : null,
      assigned_department_by: user!.id,
      updated_at: now,
    };
    if (isChange) {
      update.placed_location = null;
      update.placed_at = null;
      update.placed_by = null;
      update.placed_by_name = null;
    }
    await supabase.from('guests').update(update).eq('id', guestId);
    updateGuest(guestId, {
      assignedDepartment: dept || undefined,
      assignedDepartmentAt: dept ? now : undefined,
      assignedDepartmentBy: user!.id,
      ...(isChange ? { placedLocation: undefined, placedAt: undefined, placedBy: undefined, placedByName: undefined } : {}),
    });
    if (dept) toast.success(isChange ? `Department changed to ${dept}` : `Assigned to ${dept}`);
  };

  // Toggle inline panel
  const toggleInlinePanel = (guestId: string) => {
    setExpandedGuestId(expandedGuestId === guestId ? null : guestId);
  };

  // Toggle family members expand
  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Family group bulk approve
  const handleFamilyApproveAll = (members: Guest[]) => {
    const now = new Date().toISOString();
    members.forEach(m => {
      updateGuest(m.id, { status: 'Approved', reviewedBy: user!.id, reviewedAt: now });
      insertApprovalMessage(m.id, user!);
    });
    toast.success(`Approved ${members.length} family members`);
  };

  // Family group bulk correction (called after dialog confirm)
  const handleFamilyCorrectionAllConfirm = () => {
    if (!familyCorrectionDialog || familyCorrectionDialog.reason.trim().length < 10) return;
    const { members, reason } = familyCorrectionDialog;
    const now = new Date().toISOString();
    members.forEach(m => {
      updateGuest(m.id, { status: 'Needs Correction', reviewedBy: user!.id, reviewedAt: now });
      insertCorrectionMessage(m.id, user!, reason.trim() || 'Needs Correction');
    });
    toast.success(`Correction requested for ${members.length} family members`);
    setFamilyCorrectionDialog(null);
  };

  // Family group bulk reject (called after dialog confirm)
  const handleFamilyRejectAllConfirm = () => {
    if (!familyRejectDialog || familyRejectDialog.reason.trim().length < 10) return;
    const { members, reason } = familyRejectDialog;
    const safe = reason.trim();
    const now = new Date().toISOString();
    members.forEach(m => {
      updateGuest(m.id, { status: 'Rejected', rejectionReason: safe || null, reviewedBy: user!.id, reviewedAt: now });
      insertRejectionMessage(m.id, user!, safe || 'Rejected');
    });
    toast.success(`Rejected ${members.length} family members`);
    setFamilyRejectDialog(null);
  };

  // Family group bulk dept assign
  const handleFamilyGroupDeptAssignAll = (members: Guest[], dept: string) => {
    if (!dept) return;
    members.forEach(m => handleDeptChange(m.id, dept));
  };

  // Super Admin: confirm delete
  const handleConfirmDelete = () => {
    if (!guestToDelete || !deleteGuestId) return;
    if (user.role !== 'super-admin' && user.role !== 'desk-in-charge') return;
    if (deleteConfirmText !== guestToDelete.referenceNumber) return;
    deleteGuest(deleteGuestId);
    setDeleteGuestId(null);
    setDeleteConfirmText('');
    toast.success('Guest deleted');
  };

  // Needs correction count for badge
  const needsCorrectionCount = getNeedsCorrectionCount();

  const canAddGuest = ['coordinator', 'super-admin', 'desk-in-charge'].includes(user.role);

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
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/guests'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {/* Badge for coordinator with needs-correction guests */}
                  {user.role === 'coordinator' && item.label === 'Guests' && needsCorrectionCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                      {needsCorrectionCount}
                    </span>
                  )}
                </div>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64">
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-[#1A1A1A]">Guest Details</h1>
              
              {/* User Menu */}
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
                    <div className="px-4 py-2 border-b border-[#E8E3DB]">
                      <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                      <p className="text-xs text-[#4A4A4A]">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#4A4A4A]" />
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
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

          {/* Content */}
          <div className="p-6">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <CardTitle>All Guests</CardTitle>
                <div className="flex flex-col md:flex-row gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                    <Input
                      placeholder="Search guests..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-full md:w-64 border-[#D4CFC7]"
                    />
                  </div>

                  {/* Desk Incharge Filter — super-admin only */}
                  {user.role === 'super-admin' && (
                    <select
                      value={deskInchargeFilter}
                      onChange={(e) => setDeskInchargeFilter(e.target.value)}
                      className="h-10 px-3 pr-8 border border-[#D4CFC7] rounded-md text-sm bg-white text-[#1A1A1A] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] min-w-[180px]"
                    >
                      <option value="all">All Guests</option>
                      {deskIncharges.map((di) => (
                        <option key={di.id} value={di.id}>
                          {di.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Column toggle — super-admin only */}
                  {user.role === 'super-admin' && (
                    <div className="relative" ref={colsRef}>
                      <button
                        onClick={() => setColsOpen(o => !o)}
                        className="h-10 px-3 border border-[#D4CFC7] rounded-md text-sm bg-white text-[#1A1A1A] hover:bg-[#F5F0E8] flex items-center gap-2 transition-colors"
                      >
                        <Columns className="w-4 h-4 text-[#4A4A4A]" />
                        Columns
                      </button>
                      {colsOpen && (
                        <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-lg border border-[#E8E3DB] p-3 z-50 min-w-[160px] space-y-2">
                          {([
                            ['dept', 'Department'],
                            ['passportCountry', 'Passport Country'],
                            ['location', 'Location'],
                            ['room', 'Room'],
                            ['submitted', 'Submitted'],
                          ] as [keyof typeof visibleCols, string][]).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-[#1A1A1A]">
                              <input
                                type="checkbox"
                                checked={visibleCols[key]}
                                onChange={() => setVisibleCols(v => ({ ...v, [key]: !v[key] }))}
                                className="w-4 h-4 accent-[#2D5A45]"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add Guest Button */}
                  {canAddGuest && (
                    <Button
                      onClick={() => navigate('/guests/new')}
                      className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Registration
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Filter chips — super-admin only */}
                {user.role === 'super-admin' && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {([
                      { key: 'all',       label: 'All Guests', count: guests.length },
                      { key: 'pending',   label: 'Pending',    count: guests.filter(g => g.status === 'Awaiting Review' || g.status === 'Needs Correction').length },
                      { key: 'submitted', label: 'Submitted',  count: guests.filter(g => g.status === 'Approved' || g.status === 'Accommodated').length },
                      { key: 'rejected',  label: 'Rejected',   count: guests.filter(g => g.status === 'Rejected').length },
                    ] as { key: typeof adminFilter; label: string; count: number }[]).map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() => setAdminFilter(key)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                          adminFilter === key
                            ? 'bg-[#2D5A45] text-white'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>
                )}

                {/* Tabs for Coordinator */}
                {user.role === 'coordinator' && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setActiveTab('waiting')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'waiting'
                          ? 'bg-[#2D5A45] text-white'
                          : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                      }`}
                    >
                      Waiting
                      {getMyWaitingGuests().length > 0 && (
                        <span className="ml-2 bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
                          {getMyWaitingGuests().length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('submitted')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'submitted'
                          ? 'bg-[#2D5A45] text-white'
                          : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                      }`}
                    >
                      Submitted
                    </button>
                  </div>
                )}

                {/* Tabs for Desk Incharge */}
                {user.role === 'desk-in-charge' && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setActiveTab('awaiting')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'awaiting'
                          ? 'bg-[#2D5A45] text-white'
                          : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                      }`}
                    >
                      Awaiting Review
                      {guests.filter(g => g.status === 'Awaiting Review').length > 0 && (
                        <span className="ml-2 bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
                          {guests.filter(g => g.status === 'Awaiting Review').length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('processed')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'processed'
                          ? 'bg-[#2D5A45] text-white'
                          : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                      }`}
                    >
                      Processed
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F5F0E8]">
                      <tr>
                        <th className="w-8 px-2 py-3"></th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Reference</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Name</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Country</th>
                        {(user.role !== 'super-admin' || visibleCols.passportCountry) && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Passport Country</th>
                        )}
                        {user.role === 'desk-in-charge' && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Coordinator</th>
                        )}
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Designation</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Type</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Status</th>
                        {user.role === 'super-admin' && visibleCols.dept && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Department</th>
                        )}
                        {user.role === 'super-admin' && visibleCols.location && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Location</th>
                        )}
                        {user.role === 'super-admin' && visibleCols.room && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Room</th>
                        )}
                        {(user.role !== 'super-admin' || visibleCols.submitted) && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Submitted</th>
                        )}
                        {user.role === 'super-admin' && (
                          <>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A] min-w-[140px]">Mulaqat Type</th>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A] min-w-[160px]">Delegation</th>
                          </>
                        )}
                        <th className="text-right px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {buildDisplayGroups(filteredGuests).map((item) => {
                        // ── New-model family group row ────────────────────────────────
                        if (item.type === 'family') {
                          const { group } = item;
                          const isExpanded = expandedRows.has(group.groupId);
                          const allDepts = group.members.map(m => m.assignedDepartment).filter(Boolean);
                          const allSameDept = allDepts.length === group.members.length && new Set(allDepts).size === 1;
                          const groupDept = allSameDept ? allDepts[0] : undefined;
                          return (
                            <Fragment key={group.groupId}>
                              <tr
                                className="hover:bg-[#FAFAFA] cursor-pointer select-none bg-indigo-50/40"
                                onClick={() => toggleRow(group.groupId)}
                              >
                                <td className="w-8 px-2 py-3 text-center">
                                  {isExpanded
                                    ? <ChevronDown className="w-4 h-4 text-gray-400 inline-block" />
                                    : <ChevronRight className="w-4 h-4 text-gray-400 inline-block" />}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">
                                  {group.head.referenceNumber.replace(/^([A-Z]+).*?(\d{4})$/, '$1.....$2')}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-sm text-[#1A1A1A]">{group.familyName}</span>
                                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs px-2 py-0.5 shrink-0">
                                      Family ({group.members.length})
                                    </Badge>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">{group.head.country}</td>
                                {(user.role !== 'super-admin' || visibleCols.passportCountry) && (
                                  <td className="px-4 py-3 text-sm text-[#4A4A4A]">{group.head.passportCountry || '—'}</td>
                                )}
                                {user.role === 'desk-in-charge' && (
                                  <td className="px-4 py-3">{getCoordinatorName(group.head.submittedBy)}</td>
                                )}
                                <td className="px-4 py-3">
                                  <DesignationCell designation={group.head.designation} designations={allDesignations} />
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-nowrap">
                                    Family ({group.members.length})
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    {group.members.map(m => (
                                      <span key={m.id} title={`${m.fullName}: ${m.status}`} className={`w-2.5 h-2.5 rounded-full ${statusDotColor(m.status)}`} />
                                    ))}
                                  </div>
                                </td>
                                {user.role === 'super-admin' && visibleCols.dept && (
                                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                    {groupDept ? (
                                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                                        {groupDept}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400 italic">Mixed</span>
                                    )}
                                  </td>
                                )}
                                {user.role === 'super-admin' && visibleCols.location && (
                                  <td className="px-4 py-3"><span className="text-[#4A4A4A]/40">—</span></td>
                                )}
                                {user.role === 'super-admin' && visibleCols.room && (
                                  <td className="px-4 py-3"><span className="text-[#4A4A4A]/40">—</span></td>
                                )}
                                {(user.role !== 'super-admin' || visibleCols.submitted) && (
                                  <td className="px-4 py-3 text-[#4A4A4A] whitespace-nowrap">{formatDate(group.head.submittedAt)}</td>
                                )}
                                {user.role === 'super-admin' && (
                                  <>
                                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                      <MulaqatTypeSelect
                                        value={group.head.mulaqatType ?? 'No'}
                                        onValueChange={v => setMulaqatType(group.head, v)}
                                        stopPropagation
                                      />
                                    </td>
                                    <td className="px-4 py-3 min-w-[160px]" onClick={e => e.stopPropagation()}>
                                      {(group.head.mulaqatType === 'Delegation' || group.head.mulaqatType === 'Both') ? (
                                        <DelegationCombobox
                                          compact
                                          hideClear
                                          value={getDelegationCountry(group.head.delegationId) ?? group.head.country}
                                          onChange={v => changeDelegationCountry(group.head, v)}
                                        />
                                      ) : (
                                        <span className="text-gray-400 text-xs">—</span>
                                      )}
                                    </td>
                                  </>
                                )}
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-0.5">
                                    {user.role === 'super-admin' && (
                                      <>
                                        <button
                                          onClick={() => handleFamilyApproveAll(group.members)}
                                          title="Approve All"
                                          className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => setFamilyCorrectionDialog({ members: group.members, reason: '' })}
                                          title="Correction All"
                                          className="p-1.5 rounded text-orange-500 hover:bg-orange-50 transition-colors"
                                        >
                                          <AlertCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => setFamilyRejectDialog({ members: group.members, reason: '' })}
                                          title="Reject All"
                                          className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {/* Expanded sub-table */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={20} className="p-0 border-b border-[#E8E3DB]">
                                    <div className="bg-gray-50/50 border-l-4 border-[#2D5A45] px-4 py-3">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-[#E8E3DB]">
                                            <th className="px-2 py-2 text-left">Ref</th>
                                            <th className="px-2 py-2 text-left">Name</th>
                                            <th className="px-2 py-2 text-left">Relationship</th>
                                            <th className="px-2 py-2 text-left">Status</th>
                                            <th className="px-2 py-2 text-left">Department</th>
                                            <th className="px-2 py-2 text-left">Mulaqat</th>
                                            <th className="px-2 py-2 text-left">Delegation</th>
                                            <th className="px-2 py-2 text-left">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F0EDE8]">
                                          {group.members.map(m => {
                                            const mApproved = m.status === 'Approved' || m.status === 'Accommodated';
                                            return (
                                              <tr key={m.id} className="hover:bg-white/70">
                                                <td className="px-2 py-2 font-mono text-xs text-[#4A4A4A]">{m.referenceNumber}</td>
                                                <td className="px-2 py-2">
                                                  <div className="flex items-center gap-1">
                                                    {m.isHeadOfFamily && <span title="Head of family">⭐</span>}
                                                    <span className="font-medium text-[#1A1A1A]">{m.fullName}</span>
                                                  </div>
                                                </td>
                                                <td className="px-2 py-2">
                                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                                                    {m.relationship ?? (m.isHeadOfFamily ? 'Head' : '—')}
                                                  </span>
                                                </td>
                                                <td className="px-2 py-2">
                                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${familyStatusBadgeCls(m.status)}`}>
                                                    {m.status}
                                                  </span>
                                                </td>
                                                <td className="px-2 py-2">
                                                  {m.assignedDepartment ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-blue-50 text-blue-700 border-blue-200">
                                                      {m.assignedDepartment}
                                                    </span>
                                                  ) : (
                                                    <DepartmentSelect
                                                      value=""
                                                      onValueChange={v => { if (v) handleDeptChange(m.id, v); }}
                                                      placeholder="Assign..."
                                                      className="text-[10px] min-w-[110px]"
                                                    />
                                                  )}
                                                </td>
                                                <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                                                  <MulaqatTypeSelect
                                                    value={m.mulaqatType ?? 'No'}
                                                    onValueChange={v => setMulaqatType(m, v)}
                                                  />
                                                </td>
                                                <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                                                  {(m.mulaqatType === 'Delegation' || m.mulaqatType === 'Both') ? (
                                                    <DelegationCombobox
                                                      compact
                                                      hideClear
                                                      value={getDelegationCountry(m.delegationId) ?? m.country}
                                                      onChange={v => changeDelegationCountry(m, v)}
                                                    />
                                                  ) : m.mulaqatType === 'Daftari' ? (
                                                    <span className="text-xs text-blue-600">Daftari</span>
                                                  ) : (
                                                    <span className="text-[#4A4A4A]/40 text-xs">—</span>
                                                  )}
                                                </td>
                                                <td className="px-2 py-2">
                                                  <div className="flex items-center gap-1">
                                                    <button
                                                      onClick={() => { setViewGuestId(m.id); setViewGuestEditMode(false); }}
                                                      title="View"
                                                      className="p-1 rounded text-blue-500 hover:bg-blue-50 transition-colors"
                                                    >
                                                      <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                      onClick={() => { setViewGuestId(m.id); setViewGuestEditMode(true); }}
                                                      title="Edit"
                                                      className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors"
                                                    >
                                                      <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    {user.role === 'super-admin' && (
                                                      <>
                                                        <button
                                                          onClick={() => { updateGuest(m.id, { status: 'Approved', reviewedBy: user.id, reviewedAt: new Date().toISOString() }); insertApprovalMessage(m.id, user); }}
                                                          disabled={mApproved}
                                                          title="Approve"
                                                          className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                          <CheckCircle className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                          onClick={() => openRemarkDialog(m.id, 'Needs Correction')}
                                                          disabled={mApproved}
                                                          title="Needs Correction"
                                                          className="p-1 rounded text-orange-500 hover:bg-orange-50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                          <AlertCircle className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                          onClick={() => openRemarkDialog(m.id, 'Rejected')}
                                                          disabled={mApproved}
                                                          title="Reject"
                                                          className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                          <XCircle className="w-3.5 h-3.5" />
                                                        </button>
                                                      </>
                                                    )}
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                      {/* Sub-table footer bulk actions */}
                                      {user.role === 'super-admin' && (
                                        <div className="flex items-center gap-2 pt-3 mt-2 border-t border-[#E8E3DB]">
                                          <button
                                            onClick={() => handleFamilyApproveAll(group.members)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium transition-colors"
                                          >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            Approve All
                                          </button>
                                          <button
                                            onClick={() => setFamilyCorrectionDialog({ members: group.members, reason: '' })}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-medium transition-colors"
                                          >
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            Correction All
                                          </button>
                                          <button
                                            onClick={() => setFamilyRejectDialog({ members: group.members, reason: '' })}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-medium transition-colors"
                                          >
                                            <XCircle className="w-3.5 h-3.5" />
                                            Reject All
                                          </button>
                                          <div className="flex items-center gap-1.5 ml-3">
                                            <DepartmentSelect
                                              value={assignAllValues[group.groupId] ?? ''}
                                              onValueChange={v => setAssignAllValues(prev => ({ ...prev, [group.groupId]: v }))}
                                              placeholder="Assign all to dept..."
                                              className="text-xs min-w-[140px]"
                                            />
                                            <button
                                              onClick={() => {
                                                const dept = assignAllValues[group.groupId];
                                                if (dept) { handleFamilyGroupDeptAssignAll(group.members, dept); setAssignAllValues(prev => ({ ...prev, [group.groupId]: '' })); }
                                              }}
                                              disabled={!assignAllValues[group.groupId]}
                                              className="px-3 py-1.5 bg-[#2D5A45] hover:bg-[#234839] text-white rounded-md text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                              Apply
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        }

                        // ── Individual guest row ──────────────────────────────────────
                        const guest = item.guest;
                        const isExpandable = guest.guestType === 'family' && guest.familyMembers.length > 0;
                        return (
                        <Fragment key={guest.id}>
                          <tr
                            className={`${
                              isExpandable
                                ? `cursor-pointer hover:bg-gray-50 ${expandedRows.has(guest.id) ? 'bg-gray-50' : ''}`
                                : 'hover:bg-[#F5F0E8]'
                            }`}
                            onClick={isExpandable ? () => toggleRow(guest.id) : undefined}
                          >
                            <td className="w-8 px-2 py-3 text-center">
                              {isExpandable && (
                                <ChevronRight
                                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 inline-block ${
                                    expandedRows.has(guest.id) ? 'rotate-90' : ''
                                  }`}
                                />
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">
                              {guest.referenceNumber.replace(/^([A-Z]+).*?(\d{4})$/, '$1.....$2')}
                            </td>
                            <td className="px-4 py-3">
                              <span>{guest.fullName}</span>
                            </td>
                            <td className="px-4 py-3">{guest.country}</td>
                            {(user.role !== 'super-admin' || visibleCols.passportCountry) && (
                              <td className="px-4 py-3">{guest.passportCountry || '—'}</td>
                            )}
                            {user.role === 'desk-in-charge' && (
                              <td className="px-4 py-3">{getCoordinatorName(guest.submittedBy)}</td>
                            )}
                            <td className="px-4 py-3">
                              <DesignationCell designation={guest.designation} designations={allDesignations} />
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="capitalize">
                                {guest.guestType}
                              </Badge>
                              {guest.familyGroupId && (() => {
                                const cnt = guests.filter(g => g.familyGroupId === guest.familyGroupId).length;
                                return cnt > 1 ? <span className="text-xs text-[#4A4A4A] ml-1">({cnt} members)</span> : null;
                              })()}
                              {!guest.familyGroupId && guest.guestType === 'family' && guest.familyMembers.length > 0 && (
                                <span className="text-xs text-[#4A4A4A] ml-1">
                                  ({guest.familyMembers.length + 1} members)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <FamilyStatusCell guest={guest} />
                            </td>
                            {user.role === 'super-admin' && visibleCols.dept && (
                              <td className="px-4 py-3">
                                <DepartmentSelect
                                  value={guest.assignedDepartment || ''}
                                  onValueChange={(v) => handleDeptChange(guest.id, v)}
                                  placeholder="Select dept..."
                                  stopPropagation
                                  className="min-w-[180px]"
                                />
                              </td>
                            )}
                            {user.role === 'super-admin' && visibleCols.location && (
                              <td className="px-4 py-3">
                                {guest.placedLocation ? (
                                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                                    {guest.placedLocation}
                                  </span>
                                ) : <span className="text-[#4A4A4A]/40">—</span>}
                              </td>
                            )}
                            {user.role === 'super-admin' && visibleCols.room && (
                              <td className="px-4 py-3">
                                {guestRoomMap.get(guest.id) ? (
                                  <span className="text-xs font-mono text-[#1A1A1A] whitespace-nowrap">
                                    {guestRoomMap.get(guest.id)}
                                  </span>
                                ) : <span className="text-[#4A4A4A]/40">—</span>}
                              </td>
                            )}
                            {(user.role !== 'super-admin' || visibleCols.submitted) && (
                              <td className="px-4 py-3 text-[#4A4A4A] whitespace-nowrap">{formatDate(guest.submittedAt)}</td>
                            )}

                            {/* Mulaqat Type + Delegation — super-admin only */}
                            {user.role === 'super-admin' && (
                              <>
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <MulaqatTypeSelect
                                    value={guest.mulaqatType ?? 'No'}
                                    onValueChange={v => setMulaqatType(guest, v)}
                                    stopPropagation
                                  />
                                </td>
                                <td className="px-4 py-3 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                                  {(guest.mulaqatType === 'Delegation' || guest.mulaqatType === 'Both') ? (
                                    <DelegationCombobox
                                      compact
                                      hideClear
                                      value={getDelegationCountry(guest.delegationId) ?? guest.country}
                                      onChange={v => changeDelegationCountry(guest, v)}
                                    />
                                  ) : (
                                    <span className="text-gray-400 text-xs">—</span>
                                  )}
                                </td>
                              </>
                            )}

                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-0.5">
                                {/* Coordinator Actions */}
                                {user.role === 'coordinator' && activeTab === 'waiting' && (
                                  <>
                                    {guest.status === 'Needs Correction' && (
                                      <Button
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); handleSubmitForReview(guest.id); }}
                                        className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8"
                                      >
                                        Resubmit for Review
                                      </Button>
                                    )}
                                    {guest.status === 'Needs Correction' && (
                                      <Button
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); toggleInlinePanel(guest.id); }}
                                        variant="outline"
                                        className="border-amber-500 text-amber-600 hover:bg-amber-50 h-8"
                                      >
                                        <MessageSquare className="w-4 h-4 mr-1" />
                                        View Messages
                                      </Button>
                                    )}
                                  </>
                                )}

                                {/* Desk Incharge Actions */}
                                {user.role === 'desk-in-charge' && activeTab === 'awaiting' && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleApprove(guest.id); }}
                                      className="bg-green-600 hover:bg-green-700 text-white h-8"
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); toggleInlinePanel(guest.id); }}
                                      variant="outline"
                                      className="border-amber-500 text-amber-600 hover:bg-amber-50 h-8"
                                    >
                                      <AlertCircle className="w-4 h-4 mr-1" />
                                      Needs Correction
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); toggleInlinePanel(guest.id); }}
                                      variant="outline"
                                      className="border-red-500 text-red-600 hover:bg-red-50 h-8"
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}

                                {/* View — all roles */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 p-1 text-gray-500 hover:text-gray-700"
                                  title="View guest details"
                                  onClick={(e) => { e.stopPropagation(); setViewGuestId(guest.id); setViewGuestEditMode(false); }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>

                                {/* Edit + Delete + status actions — super-admin only */}
                                {user.role === 'super-admin' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 p-1 text-green-600 hover:text-green-800 hover:bg-green-50"
                                      title="Edit guest"
                                      onClick={(e) => { e.stopPropagation(); setViewGuestId(guest.id); setViewGuestEditMode(true); }}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Approve"
                                      disabled={guest.status === 'Approved' || guest.status === 'Accommodated'}
                                      className="h-7 w-7 p-1 text-green-600 hover:text-green-800 hover:bg-green-50 disabled:opacity-30"
                                      onClick={(e) => { e.stopPropagation(); updateGuest(guest.id, { status: 'Approved' }); insertApprovalMessage(guest.id, user); toast.success('Guest approved'); }}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Needs Correction"
                                      className="h-7 w-7 p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                                      onClick={(e) => { e.stopPropagation(); openRemarkDialog(guest.id, 'Needs Correction'); }}
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Reject"
                                      className="h-7 w-7 p-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      onClick={(e) => { e.stopPropagation(); openRemarkDialog(guest.id, 'Rejected'); }}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 p-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      title="Delete guest"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmText('');
                                        setDeleteGuestId(guest.id);
                                      }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Inline Remarks Panel */}
                          {expandedGuestId === guest.id && (
                            <>
                              {user.role === 'coordinator' && guest.status === 'Needs Correction' && (
                                <CoordinatorRemarksPanel
                                  guest={guest}
                                  onAddReply={(message) => handleAddReply(guest.id, message)}
                                  onResubmit={() => handleResubmit(guest.id)}
                                />
                              )}
                              {user.role === 'desk-in-charge' && guest.status === 'Awaiting Review' && (
                                <DeskInchargeRemarksPanel
                                  onConfirm={(remark, action) => handleDeskAction(guest.id, remark, action)}
                                />
                              )}
                            </>
                          )}

                          {/* Legacy old-model family members expansion */}
                          {isExpandable && expandedRows.has(guest.id) && (
                            <tr>
                              <td colSpan={20} className="p-0 border-b border-[#E8E3DB]">
                                <div className="bg-gray-50/50 border-l-4 border-[#2D5A45] px-4 py-3">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-[#E8E3DB]">
                                        <th className="px-2 py-2 text-left">#</th>
                                        <th className="px-2 py-2 text-left">Name</th>
                                        <th className="px-2 py-2 text-left">Age</th>
                                        <th className="px-2 py-2 text-left">Gender</th>
                                        <th className="px-2 py-2 text-left">Relationship</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F0EDE8]">
                                      {guest.familyMembers.map((member, idx) => (
                                        <tr key={member.id} className="hover:bg-white/70">
                                          <td className="px-2 py-2 text-xs text-gray-400">{idx + 1}</td>
                                          <td className="px-2 py-2 font-medium text-[#1A1A1A]">{member.name}</td>
                                          <td className="px-2 py-2 text-xs text-gray-500">{member.age}</td>
                                          <td className="px-2 py-2 text-xs text-gray-500 capitalize">{member.gender}</td>
                                          <td className="px-2 py-2">
                                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                                              {member.relationship}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {filteredGuests.length === 0 && (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-[#D4CFC7] mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-[#1A1A1A] mb-2">No guests found</h3>
                    <p className="text-[#4A4A4A] mb-4">
                      {searchQuery ? 'Try adjusting your search' : 'No guests in this category'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* View / Edit Modal */}
      <GuestViewModal
        guest={viewGuest}
        open={!!viewGuestId}
        isEditMode={viewGuestEditMode}
        onClose={() => { setViewGuestId(null); setViewGuestEditMode(false); }}
        onEdit={() => setViewGuestEditMode(true)}
        onDelete={() => {
          const id = viewGuestId;
          setDeleteConfirmText('');
          setViewGuestId(null);
          setViewGuestEditMode(false);
          if (id) setDeleteGuestId(id);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteGuestId}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteGuestId(null);
            setDeleteConfirmText('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Guest?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <strong className="text-[#1A1A1A]">{guestToDelete?.fullName}</strong> and all their
              records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-1">
            <label className="text-sm text-[#4A4A4A] block mb-1.5">
              Type the reference number to confirm:{' '}
              <span className="font-mono font-semibold text-[#1A1A1A]">
                {guestToDelete?.referenceNumber}
              </span>
            </label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={guestToDelete?.referenceNumber ?? ''}
              className="font-mono"
              onPaste={(e) => e.preventDefault()}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>
              Cancel
            </AlertDialogCancel>
            <button
              onClick={handleConfirmDelete}
              disabled={deleteConfirmText !== guestToDelete?.referenceNumber}
              className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-9 px-4 py-2 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Family group bulk correction dialog */}
      <Dialog open={!!familyCorrectionDialog} onOpenChange={o => { if (!o) setFamilyCorrectionDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Correction for All Members</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-[#4A4A4A]">Add a reason for requesting corrections on all {familyCorrectionDialog?.members.length} family members.</p>
            <textarea
              value={familyCorrectionDialog?.reason ?? ''}
              onChange={e => setFamilyCorrectionDialog(d => d ? { ...d, reason: e.target.value } : null)}
              placeholder="Explain what needs to be corrected (min 10 characters)..."
              rows={3}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFamilyCorrectionDialog(null)}>Cancel</Button>
            <Button
              onClick={handleFamilyCorrectionAllConfirm}
              disabled={!familyCorrectionDialog || familyCorrectionDialog.reason.trim().length < 10}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Confirm Correction All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Family group bulk reject dialog */}
      <Dialog open={!!familyRejectDialog} onOpenChange={o => { if (!o) setFamilyRejectDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject All Family Members</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-[#4A4A4A]">Add a rejection reason for all {familyRejectDialog?.members.length} family members.</p>
            <textarea
              value={familyRejectDialog?.reason ?? ''}
              onChange={e => setFamilyRejectDialog(d => d ? { ...d, reason: e.target.value } : null)}
              placeholder="Reason for rejection (min 10 characters)..."
              rows={3}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFamilyRejectDialog(null)}>Cancel</Button>
            <Button
              onClick={handleFamilyRejectAllConfirm}
              disabled={!familyRejectDialog || familyRejectDialog.reason.trim().length < 10}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Super-admin: Needs Correction / Reject remark dialog */}
      <Dialog open={remarkDialog.open} onOpenChange={(o) => !o && setRemarkDialog(d => ({ ...d, open: false }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {remarkDialog.action === 'Needs Correction' ? 'Request Correction' : 'Reject Guest'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-[#4A4A4A]">
              {remarkDialog.action === 'Needs Correction'
                ? 'Optionally add a note explaining what needs to be corrected.'
                : 'Optionally add a reason for rejection.'}
            </p>
            <textarea
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              placeholder={remarkDialog.action === 'Needs Correction' ? 'What needs to be corrected...' : 'Reason for rejection...'}
              rows={3}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarkDialog(d => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={handleAdminConfirmAction}
              className={remarkDialog.action === 'Needs Correction'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {remarkDialog.action === 'Needs Correction' ? (
                <><AlertTriangle className="w-4 h-4 mr-2" />Mark Needs Correction</>
              ) : (
                <><XCircle className="w-4 h-4 mr-2" />Reject Guest</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
