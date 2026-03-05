import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Button } from '@/components/ui/button';
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
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ROLE_LABELS } from '@/lib/constants';
import type { UserRole } from '@/types';

const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': [
    { icon: FileText, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
    { icon: Users, label: 'Users', href: '/users' },
    { icon: Briefcase, label: 'Designation List', href: '/designations' },
    { icon: Globe, label: 'Countries & Depts', href: '/countries-departments' },
  ],
  'desk-in-charge': [
    { icon: FileText, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'coordinator': [
    { icon: FileText, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
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
  const { guests } = useGuests();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // ========== LIVE DATA CALCULATIONS ==========
  
  // Filter guests based on role
  const relevantGuests = useMemo(() => {
    if (user.role === 'coordinator') {
      return guests.filter(g => g.submittedBy === user.id);
    }
    return guests;
  }, [guests, user.role, user.id]);

  // Get unique countries count
  const uniqueCountries = useMemo(() => {
    const countrySet = new Set(guests.map(g => g.countryCode));
    return countrySet.size;
  }, [guests]);

  // Status counts
  const pendingReviewCount = useMemo(() => 
    relevantGuests.filter(g => g.status === 'pending-review').length,
  [relevantGuests]);

  const approvedCount = useMemo(() => 
    relevantGuests.filter(g => g.status === 'approved').length,
  [relevantGuests]);

  const needsCorrectionCount = useMemo(() => 
    relevantGuests.filter(g => g.status === 'needs-correction').length,
  [relevantGuests]);

  const accommodatedCount = useMemo(() => 
    relevantGuests.filter(g => g.status === 'accommodated').length,
  [relevantGuests]);

  const checkedInCount = useMemo(() => 
    relevantGuests.filter(g => g.status === 'checked-in').length,
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
      g.status === 'approved' || g.status === 'accommodated' || g.status === 'checked-in'
    ).length;
    return Math.round((approved / total) * 100);
  }, [relevantGuests]);

  // Fully processed count (for progress panel)
  const fullyProcessedCount = useMemo(() => 
    relevantGuests.filter(g => 
      g.status === 'accommodated' || g.status === 'checked-in'
    ).length,
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
        return 'Review and manage all guest submissions';
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
          onClick={() => navigate('/guests')}
          className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
        >
          <Search className="w-4 h-4 mr-2" />
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
          { label: 'Checked In', value: checkedInCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' },
          { label: 'Pending Pickup', value: approvedCount, icon: Clock, color: 'bg-amber-50 text-amber-600' }
        );
        break;

      case 'accommodation':
        cards.push(
          { label: 'Total Guests', value: guests.length, icon: Users, color: 'bg-[#E8F5EE] text-[#2D5A45]' },
          { label: 'Accommodated', value: accommodatedCount, icon: Bed, color: 'bg-purple-50 text-purple-600' },
          { label: 'Checked In', value: checkedInCount, icon: CheckCircle, color: 'bg-green-50 text-green-600' },
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
          { label: 'Manage Designations', href: '/designations', icon: Briefcase },
          { label: 'Manage Users', href: '/users', icon: UserCheck },
        );
        break;
      case 'coordinator':
        actions.push(
          { label: 'Register New Guest', href: '/guests/new', icon: Plus },
          { label: 'View My Submissions', href: '/guests', icon: FileText },
        );
        break;
      case 'desk-in-charge':
        actions.push(
          { label: 'Review Pending Guests', href: '/guests', icon: Search },
          { label: 'View All Guests', href: '/guests', icon: Users },
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
          { label: 'Checked In', value: checkedInCount },
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
          { label: 'Checked In', value: checkedInCount },
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
      default:
        return 'Overview';
    }
  };

  const statCards = getStatCards();
  const quickActions = getQuickActions();
  const statsPanel = getStatsPanel();

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
                  item.href === '/dashboard'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <item.icon className="w-5 h-5" />
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
              <h1 className="text-xl font-semibold text-[#1A1A1A]">Dashboard</h1>
              
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
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
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
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
