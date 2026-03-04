import { useState } from 'react';
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
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  LogOut,
  ArrowLeft,
  Eye,
  Pencil,
  Trash2,
  Briefcase,
  Send,
  MessageSquare,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { GUEST_STATUS_LABELS, ROLE_LABELS } from '@/lib/constants';
import { GuestViewModal } from '@/components/GuestViewModal';
import type { UserRole, Guest } from '@/types';

const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
    { icon: Users, label: 'Users', href: '/users' },
    { icon: Briefcase, label: 'Designation List', href: '/designations' },
  ],
  'desk-in-charge': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'coordinator': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
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
};

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

// Get status badge styling
const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'pending-review':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'needs-correction':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'approved':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'rejected':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'accommodated':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'checked-in':
      return 'bg-green-100 text-green-700 border-green-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
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
      <td colSpan={9} className="p-0">
        <div className="bg-[#FEF9C3] border-l-4 border-amber-500 p-4 m-2 rounded-r-lg">
          <h4 className="font-medium text-amber-800 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Remarks
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
  onConfirm: (remark: string, action: 'needs-correction' | 'rejected') => void;
}

function DeskInchargeRemarksPanel({ onConfirm }: DeskInchargeRemarksPanelProps) {
  const [remarkText, setRemarkText] = useState('');

  const handleConfirm = (action: 'needs-correction' | 'rejected') => {
    if (!remarkText.trim()) {
      toast.error('Please add a remark before confirming');
      return;
    }
    onConfirm(remarkText.trim(), action);
    setRemarkText('');
  };

  return (
    <tr>
      <td colSpan={10} className="p-0">
        <div className="bg-[#FEE2E2] border-l-4 border-red-500 p-4 m-2 rounded-r-lg">
          <h4 className="font-medium text-red-800 mb-3">Add Remark for Coordinator</h4>
          
          <textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Explain why this guest needs correction or is being rejected..."
            rows={3}
            className="w-full px-3 py-2 border border-red-200 rounded-md text-sm bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none mb-3"
          />

          <div className="flex gap-2 justify-end">
            <Button
              onClick={() => handleConfirm('needs-correction')}
              disabled={!remarkText.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white h-10 px-4"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Confirm Needs Correction
            </Button>
            <Button
              onClick={() => handleConfirm('rejected')}
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
  const { guests, updateGuest, deleteGuest, addRemark, getMyWaitingGuests, getMySubmittedGuests, getNeedsCorrectionCount } = useGuests();
  const { users } = useUsers();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'waiting' | 'submitted' | 'awaiting' | 'processed'>('waiting');
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
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

  // Filter guests based on role and tab
  const getFilteredGuests = () => {
    if (user.role === 'coordinator') {
      if (activeTab === 'waiting') {
        return getMyWaitingGuests();
      } else {
        return getMySubmittedGuests();
      }
    } else if (user.role === 'desk-in-charge') {
      if (activeTab === 'awaiting') {
        return guests.filter(g => g.status === 'pending-review');
      } else {
        return guests.filter(g => 
          g.status === 'approved' || g.status === 'rejected' || g.status === 'needs-correction'
        );
      }
    } else {
      // Super admin and others - show all
      return guests;
    }
  };

  const filteredGuests = getFilteredGuests().filter(guest => 
    guest.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    guest.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    guest.passportNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle submit for review (coordinator)
  const handleSubmitForReview = (guestId: string) => {
    updateGuest(guestId, { status: 'pending-review' });
    toast.success('Guest submitted for review');
  };

  // Handle approve (desk incharge)
  const handleApprove = (guestId: string) => {
    updateGuest(guestId, { status: 'approved' });
    toast.success('Guest approved');
  };

  // Handle needs correction or reject (desk incharge)
  const handleDeskAction = (guestId: string, remark: string, action: 'needs-correction' | 'rejected') => {
    if (!user) return;
    
    addRemark(guestId, {
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      message: remark,
    });
    
    updateGuest(guestId, { status: action });
    setExpandedGuestId(null);
    
    toast.success(`Guest marked as ${action === 'needs-correction' ? 'needs correction' : 'rejected'}`);
  };

  // Handle add reply (coordinator)
  const handleAddReply = (guestId: string, message: string) => {
    if (!user) return;
    
    addRemark(guestId, {
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      message,
    });
    
    toast.success('Reply added');
  };

  // Handle resubmit (coordinator)
  const handleResubmit = (guestId: string) => {
    updateGuest(guestId, { status: 'pending-review' });
    setExpandedGuestId(null);
    toast.success('Guest resubmitted for review');
  };

  // Toggle inline panel
  const toggleInlinePanel = (guestId: string) => {
    setExpandedGuestId(expandedGuestId === guestId ? null : guestId);
  };

  // Toggle family members expand
  const toggleFamilyExpand = (guestId: string) => {
    setExpandedFamilyId(expandedFamilyId === guestId ? null : guestId);
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
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Project Mehmaan</span>
                <p className="text-xs text-[#4A4A4A]">Guest Management</p>
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
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={() => navigate('/dashboard')}
                  className="text-[#4A4A4A]"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Guest Details</h1>
              </div>
              
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
                      {guests.filter(g => g.status === 'pending-review').length > 0 && (
                        <span className="ml-2 bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
                          {guests.filter(g => g.status === 'pending-review').length}
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
                        {user.role === 'desk-in-charge' && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Coordinator</th>
                        )}
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Designation</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Type</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Status</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Submitted</th>
                        <th className="text-right px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {filteredGuests.map((guest) => (
                        <>
                          <tr
                            key={guest.id}
                            className={`${
                              guest.guestType === 'family'
                                ? `cursor-pointer hover:bg-gray-50 ${expandedFamilyId === guest.id ? 'bg-gray-50' : ''}`
                                : 'hover:bg-[#F5F0E8]'
                            }`}
                            onClick={guest.guestType === 'family' ? () => toggleFamilyExpand(guest.id) : undefined}
                          >
                            <td className="w-8 px-2 py-3 text-center">
                              {guest.guestType === 'family' && (
                                <ChevronRight
                                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 inline-block ${
                                    expandedFamilyId === guest.id ? 'rotate-90' : ''
                                  }`}
                                />
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium">{guest.referenceNumber}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                  {guest.fullName.charAt(0)}
                                </div>
                                {guest.fullName}
                              </div>
                            </td>
                            <td className="px-4 py-3">{guest.country}</td>
                            {user.role === 'desk-in-charge' && (
                              <td className="px-4 py-3">{getCoordinatorName(guest.submittedBy)}</td>
                            )}
                            <td className="px-4 py-3">{guest.designation}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="capitalize">
                                {guest.guestType}
                              </Badge>
                              {guest.guestType === 'family' && guest.familyMembers.length > 0 && (
                                <span className="text-xs text-[#4A4A4A] ml-1">
                                  ({guest.familyMembers.length + 1} members)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={getStatusBadgeStyle(guest.status)}
                              >
                                {GUEST_STATUS_LABELS[guest.status]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A]">{guest.submittedAt}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {/* Coordinator Actions */}
                                {user.role === 'coordinator' && activeTab === 'waiting' && (
                                  <>
                                    {guest.status === 'draft' && (
                                      <Button
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); handleSubmitForReview(guest.id); }}
                                        className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8"
                                      >
                                        Submit for Review
                                      </Button>
                                    )}
                                    {guest.status === 'needs-correction' && (
                                      <Button
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); toggleInlinePanel(guest.id); }}
                                        variant="outline"
                                        className="border-amber-500 text-amber-600 hover:bg-amber-50 h-8"
                                      >
                                        <MessageSquare className="w-4 h-4 mr-1" />
                                        View Remarks
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
                                  className="h-8 w-8 text-gray-500 hover:text-gray-700"
                                  title="View guest details"
                                  onClick={(e) => { e.stopPropagation(); setViewGuestId(guest.id); setViewGuestEditMode(false); }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>

                                {/* Edit + Delete — super-admin only */}
                                {user.role === 'super-admin' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600 hover:text-green-800 hover:bg-green-50"
                                      title="Edit guest"
                                      onClick={(e) => { e.stopPropagation(); setViewGuestId(guest.id); setViewGuestEditMode(true); }}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      title="Delete guest"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmText('');
                                        setDeleteGuestId(guest.id);
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Inline Remarks Panel */}
                          {expandedGuestId === guest.id && (
                            <>
                              {user.role === 'coordinator' && guest.status === 'needs-correction' && (
                                <CoordinatorRemarksPanel
                                  guest={guest}
                                  onAddReply={(message) => handleAddReply(guest.id, message)}
                                  onResubmit={() => handleResubmit(guest.id)}
                                />
                              )}
                              {user.role === 'desk-in-charge' && guest.status === 'pending-review' && (
                                <DeskInchargeRemarksPanel
                                  onConfirm={(remark, action) => handleDeskAction(guest.id, remark, action)}
                                />
                              )}
                            </>
                          )}

                          {/* Family Members Expanded Section */}
                          {guest.guestType === 'family' && (
                            <tr>
                              <td colSpan={user.role === 'desk-in-charge' ? 10 : 9} className="p-0">
                                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                  expandedFamilyId === guest.id ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
                                }`}>
                                  <div className="mx-4 mb-3 mt-1 rounded-lg bg-white border border-gray-200 shadow-md p-5">
                                    <h5 className="text-sm font-semibold text-[#2D5A45] mb-3 flex items-center gap-1.5">
                                      <Users className="w-4 h-4" />
                                      Family Members ({guest.familyMembers.length})
                                    </h5>
                                    {guest.familyMembers.length === 0 ? (
                                      <div className="text-center py-4">
                                        <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                        <p className="text-sm text-gray-400 italic">No family members added yet</p>
                                      </div>
                                    ) : (
                                      <div>
                                        {guest.familyMembers.map((member, idx) => (
                                          <div
                                            key={member.id}
                                            className="flex items-center gap-4 py-2.5 border-b border-gray-100 last:border-b-0"
                                          >
                                            <span className="w-6 h-6 rounded-full bg-[#D6E4D9] text-[#2D5A45] text-xs font-bold flex items-center justify-center flex-shrink-0">
                                              {idx + 1}
                                            </span>
                                            <span className="font-medium text-gray-800 min-w-[150px]">{member.name}</span>
                                            <span className="text-sm text-gray-500 min-w-[60px]">Age: {member.age}</span>
                                            <span className="text-sm text-gray-500 min-w-[70px] capitalize">{member.gender}</span>
                                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#F5F0E8] text-[#2D5A45] border border-[#D6E4D9] capitalize">
                                              {member.relationship}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
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
    </div>
  );
}
