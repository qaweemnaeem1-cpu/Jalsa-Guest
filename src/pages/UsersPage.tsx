import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUsers, USER_TYPE_LABELS, type UserType, type SystemUser } from '@/hooks/useUsers';
import { useCoordinators, type Coordinator } from '@/hooks/useCoordinators';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  ArrowLeft,
  ChevronDown,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Search,
  Briefcase,
  User,
  Phone,
  Mail,
  Lock,
  Globe,
  MapPin,
  Clock,
  ScrollText,
  ClipboardList,
  CheckSquare,
  MessageSquare,
} from 'lucide-react';
import { COUNTRIES, ROLE_LABELS } from '@/lib/constants';
import { CountryAssignmentPanel } from '@/components/CountryAssignmentPanel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { UserRole } from '@/types';

const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': [
    { icon: LayoutDashboard, label: 'Dashboard',         href: '/dashboard' },
    { icon: Users,           label: 'Guests',            href: '/guests' },
    { icon: Users,           label: 'Users',             href: '/users' },
    { icon: Briefcase,       label: 'Designation List',  href: '/designations' },
    { icon: Globe,           label: 'Countries & Depts', href: '/countries-departments' },
    { icon: ScrollText,      label: 'Audit Trail',       href: '/admin/audit-trail' },
  ],
  'desk-in-charge': [
    { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
    { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
    { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
    { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
  ],
  'coordinator': [
    { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
    { icon: Clock,           label: 'Pending Guests',     href: '/coordinator/pending' },
    { icon: Users,           label: 'Submitted Guests',   href: '/coordinator/submitted' },
    { icon: MessageSquare,   label: 'Messages & Updates', href: '/coordinator/messages' },
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

const TABS: { value: UserType; label: string }[] = [
  { value: 'desk-in-charge', label: 'Desk In-Charge' },
  { value: 'coordinator', label: 'Coordinators' },
  { value: 'driver', label: 'Drivers' },
  { value: 'nizamat-in-charge', label: 'Nizamat In-Charge' },
];

interface UserFormData {
  name: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  countryCode: string;
  isActive: boolean;
  assignedDeskInchargeId: string;
}

const COORD_PAGE_SIZE = 20;

export default function UsersPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { addUser, updateUser, deleteUser, toggleUserStatus, assignItems, getUsersByType } = useUsers();
  const { coordinators, addCoordinator, updateCoordinator, deleteCoordinator, toggleCoordinatorActive } = useCoordinators();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UserType>('desk-in-charge');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Coordinator pagination
  const [coordPage, setCoordPage] = useState(1);

  // Assign countries panel state
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [editingCoordinator, setEditingCoordinator] = useState<Coordinator | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    password: '',
    phone: '',
    country: '',
    countryCode: '',
    isActive: true,
    assignedDeskInchargeId: '',
  });

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // Non-coordinator users (desk-in-charge, driver, nizamat-in-charge)
  const filteredUsers = getUsersByType(activeTab).filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Coordinator-specific filtering + pagination
  const filteredCoordinators = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return coordinators.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q)
    );
  }, [coordinators, searchQuery]);

  const coordTotalPages = Math.max(1, Math.ceil(filteredCoordinators.length / COORD_PAGE_SIZE));
  const pagedCoordinators = filteredCoordinators.slice(
    (coordPage - 1) * COORD_PAGE_SIZE,
    coordPage * COORD_PAGE_SIZE
  );

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswordMap(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const openAddModal = () => {
    setEditingUser(null);
    setEditingCoordinator(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      country: '',
      countryCode: '',
      isActive: true,
      assignedDeskInchargeId: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (userToEdit: SystemUser) => {
    setEditingUser(userToEdit);
    setEditingCoordinator(null);
    setFormData({
      name: userToEdit.name,
      email: userToEdit.email,
      password: userToEdit.password,
      phone: userToEdit.phone || '',
      country: userToEdit.country || '',
      countryCode: userToEdit.countryCode || '',
      isActive: userToEdit.isActive,
      assignedDeskInchargeId: '',
    });
    setIsModalOpen(true);
  };

  const openEditCoordinator = (coord: Coordinator) => {
    setEditingUser(null);
    setEditingCoordinator(coord);
    setFormData({
      name: coord.name,
      email: coord.email,
      password: coord.password,
      phone: coord.phone,
      country: coord.country,
      countryCode: '',
      isActive: coord.isActive,
      assignedDeskInchargeId: coord.assignedDeskInchargeId,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setEditingCoordinator(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (activeTab === 'coordinator') {
      const diUser = getUsersByType('desk-in-charge').find(d => d.id === formData.assignedDeskInchargeId);
      if (editingCoordinator) {
        updateCoordinator(editingCoordinator.id, {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          country: formData.country,
          isActive: formData.isActive,
          assignedDeskInchargeId: formData.assignedDeskInchargeId,
          assignedDeskInchargeName: diUser?.name ?? '',
        });
        toast.success('Coordinator updated successfully');
      } else {
        addCoordinator({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          country: formData.country,
          isActive: formData.isActive,
          assignedDeskInchargeId: formData.assignedDeskInchargeId,
          assignedDeskInchargeName: diUser?.name ?? '',
        });
        toast.success('Coordinator added successfully');
      }
    } else {
      const country = COUNTRIES.find(c => c.code === formData.countryCode);
      if (editingUser) {
        updateUser(editingUser.id, {
          ...formData,
          country: country?.name || formData.country,
        });
        toast.success('User updated successfully');
      } else {
        addUser({
          ...formData,
          userType: activeTab,
          country: country?.name || formData.country,
        });
        toast.success('User added successfully');
      }
    }
    closeModal();
  };

  const handleDeleteCoordinator = (coord: Coordinator) => {
    if (confirm(`Are you sure you want to delete "${coord.name}"?`)) {
      deleteCoordinator(coord.id);
      toast.success('Coordinator deleted successfully');
    }
  };

  const handleDelete = (userToDelete: SystemUser) => {
    if (confirm(`Are you sure you want to delete "${userToDelete.name}"?`)) {
      deleteUser(userToDelete.id);
      toast.success('User deleted successfully');
    }
  };

  const handleToggleCoordinator = (coord: Coordinator) => {
    toggleCoordinatorActive(coord.id);
    toast.success(`"${coord.name}" is now ${coord.isActive ? 'inactive' : 'active'}`);
  };

  const handleToggleStatus = (userToToggle: SystemUser) => {
    toggleUserStatus(userToToggle.id);
    toast.success(`"${userToToggle.name}" is now ${!userToToggle.isActive ? 'active' : 'inactive'}`);
  };

  const getStats = () => {
    if (activeTab === 'coordinator') {
      return {
        total: coordinators.length,
        active: coordinators.filter(c => c.isActive).length,
        inactive: coordinators.filter(c => !c.isActive).length,
      };
    }
    const typeUsers = getUsersByType(activeTab);
    return {
      total: typeUsers.length,
      active: typeUsers.filter(u => u.isActive).length,
      inactive: typeUsers.filter(u => !u.isActive).length,
    };
  };

  const stats = getStats();

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
                  item.href === '/users'
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
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  className="border-[#D4CFC7]"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <h1 className="text-xl font-semibold text-[#1A1A1A]">User Management</h1>
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
          <div className="p-6 max-w-6xl mx-auto">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setActiveTab(tab.value);
                    setSearchQuery('');
                    setCoordPage(1);
                  }}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.value
                      ? 'bg-[#2D5A45] text-white'
                      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="flex gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {stats.total}
                </Badge>
                <span className="text-sm text-[#4A4A4A]">Total</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {stats.active}
                </Badge>
                <span className="text-sm text-[#4A4A4A]">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                  {stats.inactive}
                </Badge>
                <span className="text-sm text-[#4A4A4A]">Inactive</span>
              </div>
            </div>

            {/* Search and Add */}
            <Card className="shadow-sm mb-6">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                    <Input
                      placeholder={`Search ${USER_TYPE_LABELS[activeTab].toLowerCase()}...`}
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCoordPage(1); }}
                      className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                    />
                  </div>
                  <Button
                    onClick={openAddModal}
                    className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add {USER_TYPE_LABELS[activeTab]}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Users List */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="w-5 h-5 text-[#2D5A45]" />
                  {USER_TYPE_LABELS[activeTab]} List
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F9F8F6]">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Email</th>
                        {activeTab !== 'desk-in-charge' && (
                          <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Password</th>
                        )}
                        {activeTab === 'coordinator' && (
                          <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Country</th>
                        )}
                        {activeTab === 'coordinator' && (
                          <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Desk Incharge</th>
                        )}
                        {activeTab === 'desk-in-charge' && (
                          <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Countries</th>
                        )}
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Phone</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Status</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-[#1A1A1A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {activeTab === 'coordinator' ? (
                        // ── Coordinator rows ──────────────────────────────────
                        filteredCoordinators.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-[#4A4A4A]">
                              No coordinators found.
                            </td>
                          </tr>
                        ) : (
                          pagedCoordinators.map((coord) => (
                            <tr key={coord.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                    {coord.name.charAt(0)}
                                  </div>
                                  <span className="font-medium text-[#1A1A1A]">{coord.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[#4A4A4A]">{coord.email}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[#4A4A4A] font-mono">
                                    {showPasswordMap[coord.id] ? coord.password : '••••••••'}
                                  </span>
                                  <button
                                    onClick={() => togglePasswordVisibility(coord.id)}
                                    className="p-1 hover:bg-gray-100 rounded text-[#4A4A4A]"
                                  >
                                    {showPasswordMap[coord.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[#4A4A4A]">{coord.country}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{coord.assignedDeskInchargeName || '—'}</td>
                              <td className="px-4 py-3 text-[#4A4A4A]">{coord.phone || '—'}</td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant="outline"
                                  className={coord.isActive
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                                  }
                                >
                                  {coord.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleToggleCoordinator(coord)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    title={coord.isActive ? 'Deactivate' : 'Activate'}
                                  >
                                    {coord.isActive
                                      ? <ToggleRight className="w-5 h-5 text-green-600" />
                                      : <ToggleLeft className="w-5 h-5 text-gray-400" />
                                    }
                                  </button>
                                  <button
                                    onClick={() => openEditCoordinator(coord)}
                                    className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCoordinator(coord)}
                                    className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )
                      ) : filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-[#4A4A4A]">
                            No {USER_TYPE_LABELS[activeTab].toLowerCase()} found. Click "Add" to create one.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                  {u.name.charAt(0)}
                                </div>
                                <span className="font-medium text-[#1A1A1A]">{u.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A]">{u.email}</td>
                            {activeTab !== 'desk-in-charge' && (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[#4A4A4A] font-mono">
                                    {showPasswordMap[u.id] ? u.password : '••••••••'}
                                  </span>
                                  <button
                                    onClick={() => togglePasswordVisibility(u.id)}
                                    className="p-1 hover:bg-gray-100 rounded text-[#4A4A4A]"
                                  >
                                    {showPasswordMap[u.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                </div>
                              </td>
                            )}
                            {activeTab === 'coordinator' && (
                              <td className="px-4 py-3 text-[#4A4A4A]">
                                {u.country || '-'}
                              </td>
                            )}
                            {activeTab === 'desk-in-charge' && (
                              <td className="px-4 py-3">
                                {((u.assignedCountries?.length ?? 0) > 0 || (u.assignedDepartments?.length ?? 0) > 0) ? (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <div className="flex items-center gap-1.5 cursor-pointer">
                                        {(u.assignedCountries?.length ?? 0) > 0 && (
                                          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#D6E4D9] text-[#2D5A45] hover:bg-[#C5D9C9] transition-colors">
                                            {u.assignedCountries!.length} countries
                                          </span>
                                        )}
                                        {(u.assignedDepartments?.length ?? 0) > 0 && (
                                          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors">
                                            {u.assignedDepartments!.length} dept{u.assignedDepartments!.length > 1 ? 's' : ''}
                                          </span>
                                        )}
                                      </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3" align="start">
                                      {(u.assignedDepartments?.length ?? 0) > 0 && (
                                        <div className="mb-3">
                                          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">
                                            Departments ({u.assignedDepartments!.length})
                                          </p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {u.assignedDepartments!.map((dept, i) => (
                                              <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                                                {dept}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {(u.assignedCountries?.length ?? 0) > 0 && (
                                        <>
                                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                            Countries ({u.assignedCountries!.length})
                                          </p>
                                          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                                            {u.assignedCountries!.map((entry, i) => (
                                              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                                {entry}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                ) : (
                                  <span className="text-[#4A4A4A]/50 text-sm">No items assigned</span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 text-[#4A4A4A]">{u.phone || '-'}</td>
                            <td className="px-4 py-3">
                              <Badge 
                                variant="outline" 
                                className={u.isActive 
                                  ? 'bg-green-50 text-green-700 border-green-200' 
                                  : 'bg-gray-50 text-gray-600 border-gray-200'
                                }
                              >
                                {u.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {activeTab === 'desk-in-charge' && (
                                  <button
                                    onClick={() => {
                                      setAssigningUserId(prev => prev === u.id ? null : u.id);
                                    }}
                                    className="p-2 hover:bg-green-50 text-[#4A4A4A] hover:text-[#2D5A45] rounded-lg transition-colors"
                                    title="Assign Countries"
                                  >
                                    <MapPin className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleToggleStatus(u)}
                                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                  title={u.isActive ? 'Deactivate' : 'Activate'}
                                >
                                  {u.isActive ? (
                                    <ToggleRight className="w-5 h-5 text-green-600" />
                                  ) : (
                                    <ToggleLeft className="w-5 h-5 text-gray-400" />
                                  )}
                                </button>
                                <button
                                  onClick={() => openEditModal(u)}
                                  className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(u)}
                                  className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Coordinator pagination */}
                {activeTab === 'coordinator' && coordTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DB]">
                    <p className="text-sm text-[#4A4A4A]">
                      Showing {Math.min((coordPage - 1) * COORD_PAGE_SIZE + 1, filteredCoordinators.length)}–{Math.min(coordPage * COORD_PAGE_SIZE, filteredCoordinators.length)} of {filteredCoordinators.length} coordinators
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCoordPage(p => Math.max(1, p - 1))}
                        disabled={coordPage === 1}
                        className="px-3 py-1.5 text-sm border border-[#D4CFC7] rounded-lg hover:bg-[#F5F0E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      {Array.from({ length: coordTotalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === coordTotalPages || Math.abs(p - coordPage) <= 1)
                        .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === '...' ? (
                            <span key={`e${i}`} className="px-2 text-[#4A4A4A]">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setCoordPage(p as number)}
                              className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                                coordPage === p
                                  ? 'bg-[#2D5A45] text-white'
                                  : 'border border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setCoordPage(p => Math.min(coordTotalPages, p + 1))}
                        disabled={coordPage === coordTotalPages}
                        className="px-3 py-1.5 text-sm border border-[#D4CFC7] rounded-lg hover:bg-[#F5F0E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assign Countries Panel */}
            {(() => {
              const assigningUser = filteredUsers.find(u => u.id === assigningUserId);
              if (!assigningUser) return null;
              const allDeskIncharges = getUsersByType('desk-in-charge');
              return (
                <CountryAssignmentPanel
                  key={assigningUserId}
                  user={assigningUser}
                  allDeskIncharges={allDeskIncharges}
                  onSave={assignItems}
                  onClose={() => setAssigningUserId(null)}
                />
              );
            })()}
          </div>
        </main>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#E8E3DB]">
              <h2 className="text-xl font-semibold text-[#1A1A1A]">
                {editingUser ? 'Edit' : 'Add'} {USER_TYPE_LABELS[activeTab]}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter full name"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Enter password"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Enter phone number"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                </div>
              </div>

              {activeTab === 'coordinator' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Country</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                      <Input
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="Enter country name"
                        className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Desk Incharge</Label>
                    <select
                      value={formData.assignedDeskInchargeId}
                      onChange={(e) => setFormData({ ...formData, assignedDeskInchargeId: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                    >
                      <option value="">— Select desk incharge —</option>
                      {getUsersByType('desk-in-charge').map((di) => (
                        <option key={di.id} value={di.id}>{di.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-[#D4CFC7] text-[#2D5A45] focus:ring-[#2D5A45]"
                />
                <Label htmlFor="isActive" className="cursor-pointer text-[#1A1A1A]">
                  Active user
                </Label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E3DB]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  className="border-[#D4CFC7] h-11 px-6"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
                >
                  {editingUser ? 'Save Changes' : 'Add User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
