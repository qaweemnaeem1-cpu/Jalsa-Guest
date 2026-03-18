import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import { useCoordinators } from '@/hooks/useCoordinators';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GuestViewModal } from '@/components/GuestViewModal';
import {
  Users,
  Globe,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Plane,
  Bed,
  FileText,
  Briefcase,
  UserCheck,
  Plus,
  MessageSquare,
  ClipboardList,
  CheckSquare,
  Eye,
  ScrollText,
  RotateCcw,
  XCircle,
  BedDouble,
  Home,
  MapPin,
  User,
  LogOut,
} from 'lucide-react';
import { useRooms } from '@/hooks/useRooms';
import { useDepartments } from '@/hooks/useDepartments';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useMemo, useState } from 'react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel, ProfileDialog } from '@/components/ProfileDialog';
import type { UserRole } from '@/types';

const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': [
    { icon: FileText,      label: 'Dashboard',          href: '/dashboard' },
    { icon: Users,         label: 'Guests',             href: '/guests' },
    { icon: Users,         label: 'Users',              href: '/users' },
    { icon: Briefcase,     label: 'Designation List',   href: '/designations' },
    { icon: Globe,         label: 'Countries & Depts',  href: '/countries-departments' },
    { icon: BedDouble,     label: 'Rooms & Capacity',   href: '/admin/rooms' },
    { icon: ScrollText,    label: 'Audit Trail',        href: '/admin/audit-trail' },
  ],
  'desk-in-charge': [
    { icon: FileText,      label: 'Dashboard',          href: '/dashboard' },
    { icon: ClipboardList, label: 'Guests to Review',   href: '/desk/review' },
    { icon: CheckSquare,   label: 'Processed Guests',   href: '/desk/processed' },
    { icon: XCircle,       label: 'Rejected Guests',    href: '/desk/rejected' },
    { icon: MessageSquare, label: 'Messages & Updates', href: '/desk/messages' },
  ],
  'coordinator': [
    { icon: FileText,      label: 'Dashboard',          href: '/dashboard' },
    { icon: Clock,         label: 'Pending Guests',     href: '/coordinator/pending' },
    { icon: Users,         label: 'Submitted Guests',   href: '/coordinator/submitted' },
    { icon: XCircle,       label: 'Rejected Guests',    href: '/coordinator/rejected' },
    { icon: MessageSquare, label: 'Messages & Updates', href: '/coordinator/messages' },
  ],
  'transport': [
    { icon: FileText, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'accommodation': [
    { icon: FileText, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'viewer': [
    { icon: FileText, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
};

// Get today's date in YYYY-MM-DD format
const getTodayString = () => {
  return new Date().toISOString().split('T')[0];
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { entries } = useAuditTrail();
  const { coordinators } = useCoordinators();
  const { getLocationOccupancy } = useRooms();
  const { departments } = useDepartments();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [diViewGuestId, setDiViewGuestId] = useState<string | null>(null);
  const [adminViewGuestId, setAdminViewGuestId] = useState<string | null>(null);
  const [adminOverturnGuestId, setAdminOverturnGuestId] = useState<string | null>(null);
  const [adminDenyGuestId, setAdminDenyGuestId] = useState<string | null>(null);
  const [overturnNote, setOverturnNote] = useState('');
  const [denyNote, setDenyNote] = useState('');

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // ========== LIVE DATA CALCULATIONS ==========
  
  // Filter guests based on role
  const relevantGuests = useMemo(() => {
    if (user.role === 'coordinator') {
      return guests.filter(g => g.submittedBy === user.id);
    }
    if (user.role === 'desk-in-charge') {
      const countries = user.assignedCountries || [];
      return guests.filter(g => countries.includes(g.country));
    }
    return guests;
  }, [guests, user.role, user.id, user.assignedCountries]);

  // Get unique countries count
  const uniqueCountries = useMemo(() => {
    const countrySet = new Set(guests.map(g => g.countryCode));
    return countrySet.size;
  }, [guests]);

  // Status counts
  const pendingReviewCount = useMemo(() =>
    relevantGuests.filter(g => g.status === 'Awaiting Review').length,
  [relevantGuests]);

  const approvedCount = useMemo(() =>
    relevantGuests.filter(g => g.status === 'Approved').length,
  [relevantGuests]);

  const needsCorrectionCount = useMemo(() =>
    relevantGuests.filter(g => g.status === 'Needs Correction').length,
  [relevantGuests]);

  const accommodatedCount = useMemo(() =>
    relevantGuests.filter(g => g.status === 'Accommodated').length,
  [relevantGuests]);

  // Arrivals today (for Transport role)
  const arrivalsTodayCount = useMemo(() => {
    const today = getTodayString();
    return guests.filter(g => {
      if (!g.arrivalTime) return false;
      return g.arrivalTime.startsWith(today);
    }).length;
  }, [guests]);

  // Approval rate calculation
  const approvalRate = useMemo(() => {
    const total = relevantGuests.length;
    if (total === 0) return 0;
    const approved = relevantGuests.filter(g =>
      g.status === 'Approved' || g.status === 'Accommodated'
    ).length;
    return Math.round((approved / total) * 100);
  }, [relevantGuests]);

  // Fully processed count (for progress panel)
  const fullyProcessedCount = useMemo(() =>
    relevantGuests.filter(g => g.status === 'Accommodated').length,
  [relevantGuests]);

  // ========== ROLE-SPECIFIC CONFIG ==========

  const getPageTitle = () => {
    switch (user.role) {
      case 'super-admin':
        return 'Super Admin Dashboard';
      case 'desk-in-charge':
        return 'Desk In-Charge Dashboard';
      case 'coordinator':
        return 'Coordinator Dashboard';
      case 'transport':
        return 'Transport Dashboard';
      case 'accommodation':
        return 'Accommodation Dashboard';
      case 'viewer':
        return 'System Overview';
      default:
        return 'Dashboard';
    }
  };

  const getSubtitle = () => {
    switch (user.role) {
      case 'super-admin':
        return 'Global system overview and management';
      case 'desk-in-charge':
        return `${user.name} — ${(user.assignedCountries || []).length} assigned countries`;
      case 'coordinator':
        return `${user.country} (${user.countryCode}) Coordinator`;
      case 'transport':
        return 'Transport and arrivals management';
      case 'accommodation':
        return 'Room assignment and occupancy management';
      case 'viewer':
        return 'Read-only system overview';
      default:
        return '';
    }
  };

  const getActionButton = () => {
    if (user.role === 'coordinator') {
      return (
        <Button
          onClick={() => navigate('/guests/new')}
          className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Registration
        </Button>
      );
    }
    if (user.role === 'desk-in-charge') {
      return (
        <Button
          onClick={() => navigate('/desk/review')}
          className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
        >
          <ClipboardList className="w-4 h-4 mr-2" />
          Review Guests
        </Button>
      );
    }
    return null;
  };

  const getStatCards = () => {
    const cards = [];

    switch (user.role) {
      case 'super-admin':
        cards.push(
          { label: 'Total Guests', value: guests.length, icon: Users, color: 'bg-[#E8F5EE] text-[#2D5A45]' },
          { label: 'Countries', value: uniqueCountries, icon: Globe, color: 'bg-blue-50 text-blue-600' },
          { label: 'Pending Review', value: pendingReviewCount, icon: Clock, color: 'bg-amber-50 text-amber-600' },
          { label: 'Approved', value: approvedCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' }
        );
        break;

      case 'coordinator':
        cards.push(
          { label: 'Total Submitted', value: relevantGuests.length, icon: Users, color: 'bg-[#E8F5EE] text-[#2D5A45]' },
          { label: 'Pending', value: pendingReviewCount, icon: Clock, color: 'bg-amber-50 text-amber-600' },
          { label: 'Needs Correction', value: needsCorrectionCount, icon: AlertCircle, color: 'bg-red-50 text-red-600' },
          { label: 'Approved', value: approvedCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' }
        );
        break;

      case 'desk-in-charge':
        cards.push(
          { label: 'Total Guests', value: guests.length, icon: Users, color: 'bg-[#E8F5EE] text-[#2D5A45]' },
          { label: 'Awaiting Review', value: pendingReviewCount, icon: Clock, color: 'bg-amber-50 text-amber-600' },
          { label: 'Needs Correction', value: needsCorrectionCount, icon: AlertCircle, color: 'bg-red-50 text-red-600' },
          { label: 'Approved', value: approvedCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' }
        );
        break;

      case 'transport':
        cards.push(
          { label: 'Total Guests', value: guests.length, icon: Users, color: 'bg-[#E8F5EE] text-[#2D5A45]' },
          { label: 'Arrivals Today', value: arrivalsTodayCount, icon: Plane, color: 'bg-blue-50 text-blue-600' },
          { label: 'Checked In', value: accommodatedCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' },
          { label: 'Pending Pickup', value: approvedCount, icon: Clock, color: 'bg-amber-50 text-amber-600' }
        );
        break;

      case 'accommodation':
        cards.push(
          { label: 'Total Guests', value: guests.length, icon: Users, color: 'bg-[#E8F5EE] text-[#2D5A45]' },
          { label: 'Accommodated', value: accommodatedCount, icon: Bed, color: 'bg-purple-50 text-purple-600' },
          { label: 'Checked In', value: accommodatedCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' },
          { label: 'Awaiting Room', value: approvedCount, icon: Clock, color: 'bg-amber-50 text-amber-600' }
        );
        break;

      case 'viewer':
        cards.push(
          { label: 'Total Guests', value: guests.length, icon: Users, color: 'bg-[#E8F5EE] text-[#2D5A45]' },
          { label: 'Countries', value: uniqueCountries, icon: Globe, color: 'bg-blue-50 text-blue-600' },
          { label: 'Pending Review', value: pendingReviewCount, icon: Clock, color: 'bg-amber-50 text-amber-600' },
          { label: 'Approved', value: approvedCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' }
        );
        break;
    }

    return cards;
  };

  const getQuickActions = () => {
    const actions = [];

    switch (user.role) {
      case 'super-admin':
        actions.push(
          { label: 'View All Guests', href: '/guests', icon: Users },
          { label: 'Manage Users', href: '/users', icon: UserCheck },
          { label: 'View Audit Trail', href: '/admin/audit-trail', icon: ScrollText },
        );
        break;
      case 'coordinator':
        actions.push(
          { label: 'Register New Guest', href: '/guests/new', icon: Plus },
          { label: 'View My Submissions', href: '/coordinator/submitted', icon: FileText },
        );
        break;
      case 'desk-in-charge':
        actions.push(
          { label: 'Review Pending Guests', href: '/desk/review', icon: ClipboardList },
          { label: 'View Processed Guests', href: '/desk/processed', icon: CheckSquare },
          { label: 'Messages & Updates', href: '/desk/messages', icon: MessageSquare },
        );
        break;
      default:
        actions.push(
          { label: 'View All Guests', href: '/guests', icon: Users },
        );
    }

    return actions;
  };

  const getStatsPanel = () => {
    const stats = [];

    switch (user.role) {
      case 'super-admin':
        stats.push(
          { label: 'Total Registrations', value: guests.length },
          { label: 'Approved', value: approvedCount, color: 'text-green-600' },
          { label: 'Pending', value: pendingReviewCount, color: 'text-amber-600' },
          { label: 'Accommodated', value: accommodatedCount },
          { label: 'Checked In', value: accommodatedCount },
        );
        break;
      case 'coordinator':
        stats.push(
          { label: 'Total Registrations', value: relevantGuests.length },
          { label: 'Approved', value: approvedCount, color: 'text-green-600' },
          { label: 'Pending', value: pendingReviewCount, color: 'text-amber-600' },
          { label: 'Needs Correction', value: needsCorrectionCount, color: 'text-red-600' },
        );
        break;
      default:
        stats.push(
          { label: 'Total Guests', value: guests.length },
          { label: 'Approved', value: approvedCount },
          { label: 'Pending', value: pendingReviewCount },
          { label: 'Checked In', value: accommodatedCount },
        );
    }

    return stats;
  };

  const getStatsPanelTitle = () => {
    switch (user.role) {
      case 'super-admin':
        return 'System Overview';
      case 'coordinator':
        return 'Country Statistics';
      case 'desk-in-charge':
        return 'My Countries';
      default:
        return 'Overview';
    }
  };

  // DI-specific: country breakdown for stats panel
  const countryBreakdown = useMemo(() => {
    if (user.role !== 'desk-in-charge') return [];
    const countries = user.assignedCountries || [];
    return countries
      .map(country => ({
        country,
        total: guests.filter(g => g.country === country).length,
        pending: guests.filter(g => g.country === country && g.status === 'Awaiting Review').length,
      }))
      .filter(c => c.total > 0);
  }, [guests, user.role, user.assignedCountries]);

  // ── DI-SPECIFIC DASHBOARD DATA ──────────────────────────────────────────────

  const diAssignedCountries = useMemo(() =>
    user.role === 'desk-in-charge' ? (user.assignedCountries ?? []) : [],
    [user]
  );

  const diGuests = useMemo(() =>
    guests.filter(g => diAssignedCountries.includes(g.country)),
    [guests, diAssignedCountries]
  );

  const diToReviewCount = useMemo(() =>
    diGuests.filter(g => g.status === 'Awaiting Review').length,
    [diGuests]
  );

  const diApprovedCount = useMemo(() =>
    diGuests.filter(g => g.status === 'Approved' || g.status === 'Accommodated').length,
    [diGuests]
  );

  const diUnreadCount = useMemo(() => {
    if (user.role !== 'desk-in-charge') return 0;
    const diGuestIds = new Set(diGuests.map(g => g.id));
    return entries.filter(
      e => diGuestIds.has(e.guestId) && !e.readBy?.includes(user.id) && e.createdBy.id !== user.id
    ).length;
  }, [entries, diGuests, user]);

  const diRejectedCount = useMemo(() =>
    diGuests.filter(g => g.status === 'Rejected').length,
    [diGuests]
  );

  // Country cards: one per assigned country with guest count, pending count, coordinator email
  const diCountryCards = useMemo(() => {
    if (user.role !== 'desk-in-charge') return [];
    return diAssignedCountries.map(country => {
      const countryGuests = guests.filter(g => g.country === country);
      const pendingCount = countryGuests.filter(g => g.status === 'Awaiting Review').length;
      const coord = coordinators.find(c => c.country === country);
      return {
        country,
        total: countryGuests.length,
        pending: pendingCount,
        coordinatorEmail: coord?.email ?? '—',
        hasPending: pendingCount > 0,
      };
    });
  }, [diAssignedCountries, guests, coordinators, user.role]);

  const rejectedGuests = useMemo(() =>
    guests.filter(g => g.status === 'Rejected'),
    [guests]
  );

  const pendingAppealsCount = useMemo(() =>
    rejectedGuests.filter(g => g.appealStatus === 'pending').length,
    [rejectedGuests]
  );

  const statCards = getStatCards();
  const quickActions = getQuickActions();
  const statsPanel = getStatsPanel();

  // Accommodation Overview (super-admin only)
  const accommodationOverview = useMemo(() => {
    if (user.role !== 'super-admin') return [];
    return Object.entries(departments).map(([dept, locs]) => {
      let totalBeds = 0, occupiedBeds = 0;
      const locationBreakdown = locs.map(loc => {
        const occ = getLocationOccupancy(loc);
        totalBeds += occ.totalBeds;
        occupiedBeds += occ.occupiedBeds;
        return { loc, ...occ };
      });
      const pct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
      return { dept, totalBeds, occupiedBeds, availableBeds: totalBeds - occupiedBeds, pct, locationBreakdown };
    }).filter(d => d.totalBeds > 0);
  }, [user.role, departments, getLocationOccupancy]);

  // ── DI-SPECIFIC DASHBOARD RENDER ─────────────────────────────────────────────
  if (user.role === 'desk-in-charge') {
    const DESK_NAV_LOCAL = [
      { icon: FileText,      label: 'Dashboard',          href: '/dashboard' },
      { icon: ClipboardList, label: 'Guests to Review',   href: '/desk/review' },
      { icon: CheckSquare,   label: 'Processed Guests',   href: '/desk/processed' },
      { icon: XCircle,       label: 'Rejected Guests',    href: '/desk/rejected' },
      { icon: MessageSquare, label: 'Messages & Updates', href: '/desk/messages' },
    ];
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
              {DESK_NAV_LOCAL.map((item, i) => (
                <button
                  key={i}
                  onClick={() => navigate(item.href)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    item.href === '/dashboard'
                      ? 'bg-[#2D5A45] text-white'
                      : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </span>
                  {item.href === '/desk/review' && diToReviewCount > 0 && (
                    <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {diToReviewCount}
                    </span>
                  )}
                  {item.href === '/desk/rejected' && diRejectedCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {diRejectedCount}
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
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Desk Incharge Dashboard</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">{diAssignedCountries.length} assigned countries</p>
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
                    <div className="w-4 h-4 text-[#4A4A4A]">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
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

            <div className="p-6 space-y-6">

              {/* Top: 3 Action Cards */}
              <div className="grid grid-cols-3 gap-4">
                {/* To Review — amber, clickable */}
                <button
                  onClick={() => navigate('/desk/review')}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center gap-4 text-left hover:bg-amber-100 transition-colors cursor-pointer hover:shadow-md"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-700">{diToReviewCount}</p>
                    <p className="text-sm text-amber-600 font-medium mt-0.5">To Review</p>
                  </div>
                </button>

                {/* Unread Messages — red, clickable */}
                <button
                  onClick={() => navigate('/desk/messages')}
                  className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-4 text-left hover:bg-red-100 transition-colors cursor-pointer hover:shadow-md"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0">
                    <MessageSquare className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-red-700">{diUnreadCount}</p>
                    <p className="text-sm text-red-600 font-medium mt-0.5">Unread Messages</p>
                  </div>
                </button>

                {/* Approved — green, static */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-green-700">{diApprovedCount}</p>
                    <p className="text-sm text-green-600 font-medium mt-0.5">Approved</p>
                  </div>
                </div>
              </div>

              {/* Middle: Country Cards Grid */}
              <div>
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-3">Assigned Countries</h2>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {diCountryCards.map(card => (
                    <div
                      key={card.country}
                      className={`bg-white rounded-xl border border-[#E8E3DB] p-4 border-l-4 ${
                        card.hasPending ? 'border-l-amber-400' : 'border-l-green-400'
                      }`}
                    >
                      <p className="font-semibold text-[#1A1A1A] text-sm truncate">{card.country}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-2xl font-bold text-[#1A1A1A]">{card.total}</span>
                        {card.pending > 0 && (
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                            {card.pending} pending
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#4A4A4A]/60 mt-1.5 truncate" title={card.coordinatorEmail}>
                        {card.coordinatorEmail}
                      </p>
                    </div>
                  ))}
                  {diCountryCards.filter(c => c.total === 0).length === diAssignedCountries.length && (
                    <p className="col-span-full text-sm text-[#4A4A4A]/60 text-center py-4">
                      No guests registered yet from your assigned countries.
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom: Guest Table */}
              <div className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E8E3DB] bg-[#F9F8F6] flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#1A1A1A]">All Guests from Assigned Countries</span>
                  <span className="text-xs text-[#4A4A4A]/60">{diGuests.length} total</span>
                </div>
                {diGuests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Users className="w-10 h-10 text-gray-300" />
                    <p className="text-sm text-[#4A4A4A]/60">No guests registered yet from your countries.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F9F8F6]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Coordinator</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Submitted</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {diGuests.slice(0, 50).map(g => {
                          const coord = coordinators.find(c => c.country === g.country);
                          return (
                            <tr key={g.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                              <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                              <td className="px-4 py-3 text-xs text-[#4A4A4A] truncate max-w-[140px]">{coord?.name ?? '—'}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200 capitalize">
                                  {g.guestType}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    g.status === 'Awaiting Review' ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : g.status === 'Approved' ? 'bg-green-50 text-green-700 border-green-200'
                                    : g.status === 'Accommodated' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : g.status === 'Needs Correction' ? 'bg-orange-50 text-orange-700 border-orange-200'
                                    : g.status === 'Rejected' ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-gray-50 text-gray-700 border-gray-200'
                                  }`}
                                >
                                  {GUEST_STATUS_LABELS[g.status] ?? g.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.submittedAt ?? '—'}</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => setDiViewGuestId(g.id)}
                                  title="View details"
                                  className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {diGuests.length > 50 && (
                      <p className="text-xs text-center text-[#4A4A4A]/50 py-3 border-t border-[#E8E3DB]">
                        Showing first 50 of {diGuests.length} guests. Use the Guests to Review page for full list.
                      </p>
                    )}
                  </div>
                )}
              </div>

            </div>
          </main>
        </div>

        <GuestViewModal
          guest={guests.find(g => g.id === diViewGuestId) ?? null}
          open={!!diViewGuestId}
          onClose={() => setDiViewGuestId(null)}
        />
      </div>
    );
  }

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
                <p className="text-xs text-[#4A4A4A]">{user.role === 'coordinator' ? 'Coordinator View' : 'Jalsa Salana UK'}</p>
              </div>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {navItems.map((item, index) => {
              const reviewCount = user.role === 'desk-in-charge'
                ? guests.filter(g => (user.assignedCountries || []).includes(g.country) && (g.status === 'Awaiting Review' || g.status === 'Needs Correction')).length
                : 0;
              const coordPendingCount = user.role === 'coordinator'
                ? guests.filter(g => g.submittedBy === user.id && (g.status === 'Needs Correction' || g.status === 'Rejected')).length
                : 0;
              return (
                <button
                  key={index}
                  onClick={() => navigate(item.href)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    item.href === '/dashboard'
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
                  {item.href === '/coordinator/pending' && coordPendingCount > 0 && (
                    <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {coordPendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <SidebarUserFooter />
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64">
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-[#1A1A1A]">Dashboard</h1>
              
              <div className="flex items-center gap-3">
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
                    <p className="text-xs text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
                  </div>
                  <div className="w-4 h-4 text-[#4A4A4A]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
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
            </div>
          </header>

          {/* Dashboard Content */}
          <div className="p-6 space-y-6">
            
            {/* Section 1 — Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#1A1A1A]">{getPageTitle()}</h2>
                <p className="text-[#4A4A4A] mt-1">{getSubtitle()}</p>
              </div>
              {getActionButton()}
            </div>

            {/* Super Admin: Rejected Guests Action Card */}
            {user.role === 'super-admin' && (
              <button
                onClick={() => document.getElementById('rejected-guests-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-5 text-left hover:bg-red-100 transition-colors"
              >
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0">
                  <XCircle className="w-6 h-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-bold text-red-700">{rejectedGuests.length}</p>
                    <span className="text-sm text-red-600 font-medium">Rejected Guests</span>
                    {pendingAppealsCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        {pendingAppealsCount} pending appeal{pendingAppealsCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-red-500 mt-0.5">Click to view rejected guests table below</p>
                </div>
              </button>
            )}

            {/* Section 2 — 4 KPI Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card, index) => (
                <div 
                  key={index} 
                  className="bg-white border border-[#E8E3DB] rounded-xl p-6 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-[#4A4A4A] mb-1">{card.label}</p>
                    <p className="text-3xl font-bold text-[#1A1A1A]">{card.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.color}`}>
                    <card.icon className="w-6 h-6" />
                  </div>
                </div>
              ))}
            </div>

            {/* Section 3 — Registration Progress Panel */}
            <div className="bg-white border border-[#E8E3DB] rounded-xl p-6">
              <h3 className="text-lg font-semibold text-[#1A1A1A] mb-4">Registration Progress</h3>
              
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#4A4A4A]">Approval Rate</span>
                <span className="text-sm font-semibold text-[#1A1A1A]">{approvalRate}%</span>
              </div>
              
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-6">
                <div 
                  className="h-full bg-[#2D5A45] rounded-full transition-all duration-500"
                  style={{ width: `${approvalRate}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#FEF9C3] rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{pendingReviewCount}</p>
                  <p className="text-sm text-amber-700 mt-1">Awaiting Review</p>
                </div>
                <div className="bg-[#FEE2E2] rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{needsCorrectionCount}</p>
                  <p className="text-sm text-red-700 mt-1">Needs Correction</p>
                </div>
                <div className="bg-[#DCFCE7] rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{fullyProcessedCount}</p>
                  <p className="text-sm text-green-700 mt-1">Fully Processed</p>
                </div>
              </div>
            </div>

            {/* Section 4 — Bottom Two-Column Row */}
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Left Panel — Quick Actions (60%) */}
              <div className="lg:col-span-3 bg-white border border-[#E8E3DB] rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E8E3DB]">
                  <h3 className="text-lg font-semibold text-[#1A1A1A]">Quick Actions</h3>
                </div>
                <div>
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => navigate(action.href)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F5F0E8] transition-colors border-b border-[#E8E3DB] last:border-b-0 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <action.icon className="w-5 h-5 text-[#4A4A4A]" />
                        <span className="text-[#1A1A1A]">{action.label}</span>
                      </div>
                      <ArrowRight className="w-5 h-5 text-[#4A4A4A]" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Panel — Statistics (40%) */}
              <div className="lg:col-span-2 bg-white border border-[#E8E3DB] rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E8E3DB]">
                  <h3 className="text-lg font-semibold text-[#1A1A1A]">{getStatsPanelTitle()}</h3>
                </div>
                {user.role === 'desk-in-charge' ? (
                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                    {countryBreakdown.length === 0 ? (
                      <p className="text-sm text-[#4A4A4A]/60 text-center py-4">No guests registered yet from your countries.</p>
                    ) : (
                      countryBreakdown.map(c => (
                        <div key={c.country} className="flex items-center justify-between py-2 border-b border-[#E8E3DB] last:border-0">
                          <span className="text-sm text-[#4A4A4A]">{c.country}</span>
                          <div className="flex items-center gap-2">
                            {c.pending > 0 && (
                              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                                {c.pending} pending
                              </span>
                            )}
                            <span className="text-sm font-bold text-[#1A1A1A]">{c.total}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="p-6 space-y-4">
                    {statsPanel.map((stat, index) => (
                      <div key={index}>
                        <div className="flex items-center justify-between">
                          <span className="text-[#4A4A4A]">{stat.label}</span>
                          <span className={`font-bold ${stat.color || 'text-[#1A1A1A]'}`}>{stat.value}</span>
                        </div>
                        {index < statsPanel.length - 1 && (
                          <div className="border-b border-[#E8E3DB] mt-4" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 5 — Accommodation Overview (super-admin only) */}
            {user.role === 'super-admin' && accommodationOverview.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E8E3DB] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BedDouble className="w-5 h-5 text-[#2D5A45]" />
                    <span className="text-sm font-semibold text-[#1A1A1A]">Accommodation Overview</span>
                  </div>
                  <button
                    onClick={() => navigate('/admin/rooms')}
                    className="text-xs text-[#2D5A45] hover:underline font-medium"
                  >
                    View all rooms →
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {accommodationOverview.map(({ dept, totalBeds, occupiedBeds, availableBeds, pct, locationBreakdown }) => {
                    const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-[#2D5A45]';
                    return (
                      <div key={dept} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-[#1A1A1A]">{dept}</span>
                          <span className="text-[#4A4A4A] text-xs">{occupiedBeds}/{totalBeds} beds · {availableBeds} available</span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {locationBreakdown.map(({ loc, totalBeds: lBeds, occupiedBeds: lOcc, availableBeds: lAvail }) => {
                            const lPct = lBeds > 0 ? Math.round((lOcc / lBeds) * 100) : 0;
                            const pillColor = lPct >= 90 ? 'bg-red-50 text-red-700 border-red-200' : lPct >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-[#E8F5EE] text-[#2D5A45] border-[#C6DDD0]';
                            return (
                              <span key={loc} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${pillColor}`}>
                                <MapPin className="w-2.5 h-2.5" />
                                {loc}: {lAvail}/{lBeds}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section 6 — Rejected Guests Table (super-admin only) */}
            {user.role === 'super-admin' && rejectedGuests.length > 0 && (
              <div id="rejected-guests-section" className="bg-white rounded-xl border border-[#E8E3DB] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E8E3DB] bg-red-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-500" />
                    <span className="text-sm font-semibold text-red-800">Rejected Guests</span>
                    <span className="text-xs text-red-600">({rejectedGuests.length})</span>
                    {pendingAppealsCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {pendingAppealsCount} pending appeal{pendingAppealsCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F9F8F6]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Rejected By</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Appeal Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {rejectedGuests.map(g => (
                        <tr key={g.id} className="hover:bg-[#FAFAFA]">
                          <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                          <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                          <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                          <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.reviewedBy ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-[#4A4A4A] max-w-[180px] truncate" title={g.rejectionReason}>
                            {g.rejectionReason ? g.rejectionReason.slice(0, 60) + (g.rejectionReason.length > 60 ? '...' : '') : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {!g.appealStatus || g.appealStatus === 'none' ? (
                              <span className="text-xs text-[#4A4A4A]/50">—</span>
                            ) : g.appealStatus === 'pending' ? (
                              <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium px-2 py-0.5 rounded-full">Pending Appeal</span>
                            ) : g.appealStatus === 'overturned' ? (
                              <span className="bg-green-50 text-green-700 border border-green-200 text-[10px] font-medium px-2 py-0.5 rounded-full">Overturned</span>
                            ) : (
                              <span className="bg-gray-50 text-gray-600 border border-gray-200 text-[10px] font-medium px-2 py-0.5 rounded-full">Appeal Denied</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setAdminViewGuestId(g.id)}
                                title="View details"
                                className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {g.appealStatus === 'pending' && (
                                <>
                                  <button
                                    onClick={() => { setAdminOverturnGuestId(g.id); setOverturnNote(''); }}
                                    title="Overturn rejection"
                                    className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => { setAdminDenyGuestId(g.id); setDenyNote(''); }}
                                    title="Deny appeal"
                                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Admin GuestViewModal */}
      <GuestViewModal
        guest={guests.find(g => g.id === adminViewGuestId) ?? null}
        open={!!adminViewGuestId}
        onClose={() => setAdminViewGuestId(null)}
      />

      {/* Overturn Appeal Dialog */}
      <Dialog open={!!adminOverturnGuestId} onOpenChange={open => { if (!open) setAdminOverturnGuestId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <RotateCcw className="w-5 h-5" />
              Overturn Rejection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {adminOverturnGuestId && (() => {
              const g = guests.find(x => x.id === adminOverturnGuestId);
              return g ? (
                <div className="bg-[#F9F8F6] border border-[#E8E3DB] rounded-lg px-4 py-3">
                  <p className="font-medium text-[#1A1A1A]">{g.fullName}</p>
                  <p className="text-xs text-[#4A4A4A]">{g.referenceNumber} · {g.country}</p>
                </div>
              ) : null;
            })()}
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1">Note (optional)</label>
              <Textarea
                value={overturnNote}
                onChange={e => setOverturnNote(e.target.value)}
                placeholder="Add a note about the overturn decision..."
                rows={3}
                maxLength={500}
                className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAdminOverturnGuestId(null)}
                className="px-4 py-2 text-sm text-[#4A4A4A] border border-[#D4CFC7] rounded-lg hover:bg-[#F5F0E8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!adminOverturnGuestId) return;
                  const gName = guests.find(x => x.id === adminOverturnGuestId)?.fullName ?? 'Guest';
                  updateGuest(adminOverturnGuestId, {
                    status: 'Awaiting Review',
                    appealStatus: 'overturned',
                  });
                  toast.success(`Rejection overturned — ${gName} sent back to review`);
                  setAdminOverturnGuestId(null);
                }}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Confirm Overturn
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deny Appeal Dialog */}
      <Dialog open={!!adminDenyGuestId} onOpenChange={open => { if (!open) setAdminDenyGuestId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-700">
              <XCircle className="w-5 h-5" />
              Deny Appeal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {adminDenyGuestId && (() => {
              const g = guests.find(x => x.id === adminDenyGuestId);
              return g ? (
                <div className="bg-[#F9F8F6] border border-[#E8E3DB] rounded-lg px-4 py-3">
                  <p className="font-medium text-[#1A1A1A]">{g.fullName}</p>
                  <p className="text-xs text-[#4A4A4A]">{g.referenceNumber} · {g.country}</p>
                  {g.appealReason && (
                    <p className="text-xs text-[#4A4A4A] mt-1 italic">Appeal: "{g.appealReason}"</p>
                  )}
                </div>
              ) : null;
            })()}
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1">Note (optional)</label>
              <Textarea
                value={denyNote}
                onChange={e => setDenyNote(e.target.value)}
                placeholder="Add a note about the denial..."
                rows={3}
                maxLength={500}
                className="border-[#D4CFC7] focus:border-[#2D5A45] resize-none text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAdminDenyGuestId(null)}
                className="px-4 py-2 text-sm text-[#4A4A4A] border border-[#D4CFC7] rounded-lg hover:bg-[#F5F0E8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!adminDenyGuestId) return;
                  updateGuest(adminDenyGuestId, { appealStatus: 'denied' });
                  toast.success('Appeal denied');
                  setAdminDenyGuestId(null);
                }}
                className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Deny Appeal
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
