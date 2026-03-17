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
  Settings2,
  X,
  Building2,
  Pencil,
} from 'lucide-react';
import { COUNTRIES, ROLE_LABELS } from '@/lib/constants';
import { useDepartments } from '@/hooks/useDepartments';
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
  'department-head': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  ],
};

const TABS: { value: UserType; label: string }[] = [
  { value: 'desk-in-charge', label: 'Desk In-Charge' },
  { value: 'coordinator', label: 'Coordinators' },
  { value: 'department-head', label: 'Departmental Users' },
  { value: 'driver', label: 'Drivers' },
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
  department: string;
  location: string;
}

const COORD_PAGE_SIZE = 20;

export default function UsersPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { addUser, updateUser, deleteUser, toggleUserStatus, assignItems, getUsersByType } = useUsers();
  const { coordinators, addCoordinator, updateCoordinator, deleteCoordinator, toggleCoordinatorActive } = useCoordinators();
  const {
    departments, departmentList,
    addDepartment, renameDepartment, deleteDepartment,
    addLocation, deleteLocation,
    getDeptBadgeCls, getLocPillCls,
  } = useDepartments();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UserType>('desk-in-charge');
  const [modalUserType, setModalUserType] = useState<UserType>('department-head');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Sub departmental users dept filter
  const [subDeptFilter, setSubDeptFilter] = useState('');

  // Department management
  const [showManageDepts, setShowManageDepts] = useState(false);
  const [addDeptDialogOpen, setAddDeptDialogOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [renamingDept, setRenamingDept] = useState<string | null>(null);
  const [renameDeptValue, setRenameDeptValue] = useState('');
  const [managingLocsDept, setManagingLocsDept] = useState<string | null>(null);
  const [newLocValue, setNewLocValue] = useState('');

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
    department: '',
    location: '',
  });

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // Non-coordinator users (for desk-in-charge, driver tabs)
  const filteredUsers = getUsersByType(activeTab).filter(u => {
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  // Department Heads (for combined Departmental Users tab)
  const filteredDeptHeads = getUsersByType('department-head').filter(u => {
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  // Location Managers / nizamat-in-charge (for combined Departmental Users tab)
  const filteredLocManagers = getUsersByType('nizamat-in-charge').filter(u => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.location ?? '').toLowerCase().includes(q);
    const matchesDept = !subDeptFilter || u.department === subDeptFilter;
    return matchesSearch && matchesDept;
  });

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

  const openAddModal = (userType?: UserType) => {
    setEditingUser(null);
    setEditingCoordinator(null);
    if (userType) setModalUserType(userType);
    else setModalUserType(activeTab);
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      country: '',
      countryCode: '',
      isActive: true,
      assignedDeskInchargeId: '',
      department: '',
      location: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (userToEdit: SystemUser) => {
    setEditingUser(userToEdit);
    setEditingCoordinator(null);
    setModalUserType(userToEdit.userType);
    setFormData({
      name: userToEdit.name,
      email: userToEdit.email,
      password: userToEdit.password,
      phone: userToEdit.phone || '',
      country: userToEdit.country || '',
      countryCode: userToEdit.countryCode || '',
      isActive: userToEdit.isActive,
      assignedDeskInchargeId: '',
      department: userToEdit.department || '',
      location: userToEdit.location || '',
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

    if (modalUserType === 'coordinator') {
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
      if (modalUserType === 'nizamat-in-charge' && (!formData.department || !formData.location)) {
        toast.error('Please select a department and location');
        return;
      }
      if (editingUser) {
        updateUser(editingUser.id, {
          ...formData,
          country: country?.name || formData.country,
        });
        toast.success('User updated successfully');
      } else {
        addUser({
          ...formData,
          userType: modalUserType,
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
                    setSubDeptFilter('');
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
            {activeTab === 'department-head' ? (
              <div className="flex flex-wrap gap-3 mb-6 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {getUsersByType('department-head').length}
                  </Badge>
                  <span className="text-[#4A4A4A]">Department Heads</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    {getUsersByType('nizamat-in-charge').length}
                  </Badge>
                  <span className="text-[#4A4A4A]">Location Managers</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                    {departmentList.length}
                  </Badge>
                  <span className="text-[#4A4A4A]">Departments</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {departmentList.reduce((sum, d) => sum + (departments[d]?.length ?? 0), 0)}
                  </Badge>
                  <span className="text-[#4A4A4A]">Locations</span>
                </div>
              </div>
            ) : (
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
            )}

            {/* Search and Add — non-department-head tabs only */}
            {activeTab !== 'department-head' && (
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
                      onClick={() => openAddModal()}
                      className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add {USER_TYPE_LABELS[activeTab]}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add Department Dialog */}
            {addDeptDialogOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
                  <h2 className="text-lg font-semibold text-[#1A1A1A]">Add New Department</h2>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Department Name *</Label>
                    <Input
                      autoFocus
                      value={newDeptName}
                      onChange={e => setNewDeptName(e.target.value)}
                      placeholder="e.g. Finance"
                      className="border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (newDeptName.trim()) { addDepartment(newDeptName.trim()); setAddDeptDialogOpen(false); toast.success('Department added'); }
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setAddDeptDialogOpen(false)} className="border-[#D4CFC7] h-10">Cancel</Button>
                    <Button
                      onClick={() => {
                        if (!newDeptName.trim()) { toast.error('Name required'); return; }
                        addDepartment(newDeptName.trim());
                        setAddDeptDialogOpen(false);
                        toast.success(`Department "${newDeptName.trim()}" added`);
                      }}
                      className="bg-[#2D5A45] hover:bg-[#234839] text-white h-10"
                    >
                      Add Department
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Users List */}
            {activeTab === 'department-head' ? (
              <div className="space-y-0">
                {/* ── SECTION A: Department Heads ── */}
                <Card className="shadow-sm mb-0">
                  <CardHeader className="bg-[#F9F8F6] py-3 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="w-4 h-4 text-[#2D5A45]" />
                        Department Heads
                        <Badge variant="outline" className="ml-1 text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {getUsersByType('department-head').length}
                        </Badge>
                      </CardTitle>
                      <Button
                        onClick={() => openAddModal('department-head')}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Department Head
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Department Heads table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-[#F9F8F6]">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Name</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Email</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Department</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Locations</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Phone</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Status</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-[#1A1A1A]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {filteredDeptHeads.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-[#4A4A4A]">
                                No department heads found.
                              </td>
                            </tr>
                          ) : (
                            filteredDeptHeads.map((u) => (
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
                                <td className="px-4 py-3">
                                  {u.department ? (
                                    <Badge variant="outline" className={getDeptBadgeCls(u.department ?? '')}>
                                      {u.department}
                                    </Badge>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {(u.locations?.length ?? 0) > 0 ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#D6E4D9] text-[#2D5A45] hover:bg-[#C5D9C9] transition-colors">
                                          {u.locations!.length} location{u.locations!.length !== 1 ? 's' : ''}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-64 p-3" align="start">
                                        <p className="text-xs font-semibold text-[#2D5A45] uppercase tracking-wide mb-2">
                                          Locations ({u.locations!.length})
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {u.locations!.map((loc, i) => (
                                            <span key={i} className="text-xs bg-[#E8F5EE] text-[#2D5A45] border border-[#D6E4D9] px-2 py-0.5 rounded-full">
                                              {loc}
                                            </span>
                                          ))}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{u.phone || '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={u.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                                    {u.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleToggleStatus(u)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={u.isActive ? 'Deactivate' : 'Activate'}>
                                      {u.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                                    </button>
                                    <button onClick={() => openEditModal(u)} className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(u)} className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors" title="Delete">
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

                    {/* Manage Departments expandable panel — below table */}
                    <div className="border-t border-[#E8E3DB]">
                      <button
                        onClick={() => setShowManageDepts(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-3 text-sm text-[#4A4A4A] hover:bg-[#F9F8F6] transition-colors"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Settings2 className="w-4 h-4 text-[#2D5A45]" />
                          Manage Departments
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showManageDepts ? 'rotate-180' : ''}`} />
                      </button>
                      {showManageDepts && (
                        <div className="px-5 pb-4 space-y-3 bg-[#FAFAFA] border-t border-[#E8E3DB]">
                          <div className="flex items-center justify-between pt-3">
                            <p className="text-sm font-semibold text-[#1A1A1A]">Departments & Locations</p>
                            <Button
                              variant="outline"
                              onClick={() => { setNewDeptName(''); setAddDeptDialogOpen(true); }}
                              className="border-[#2D5A45] text-[#2D5A45] hover:bg-[#F5F0E8] h-7 px-3 text-xs"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Department
                            </Button>
                          </div>
                          {departmentList.map(dept => (
                            <div key={dept} className="bg-[#F9F8F6] rounded-lg border border-[#E8E3DB] p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                {renamingDept === dept ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      autoFocus
                                      value={renameDeptValue}
                                      onChange={e => setRenameDeptValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          if (renameDeptValue.trim()) renameDepartment(dept, renameDeptValue.trim());
                                          setRenamingDept(null);
                                        }
                                        if (e.key === 'Escape') setRenamingDept(null);
                                      }}
                                      className="flex-1 px-2 py-1 border border-[#2D5A45] rounded text-sm focus:outline-none"
                                    />
                                    <button
                                      onClick={() => {
                                        if (renameDeptValue.trim()) renameDepartment(dept, renameDeptValue.trim());
                                        setRenamingDept(null);
                                      }}
                                      className="text-xs text-[#2D5A45] font-medium px-2 py-1 hover:bg-[#E8F5EE] rounded"
                                    >Save</button>
                                    <button onClick={() => setRenamingDept(null)} className="text-xs text-[#4A4A4A] px-2 py-1 hover:bg-gray-100 rounded">Cancel</button>
                                  </div>
                                ) : (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getDeptBadgeCls(dept)}`}>
                                    <Building2 className="w-3 h-3 mr-1" />{dept}
                                  </span>
                                )}
                                <div className="flex items-center gap-1 ml-2">
                                  <button
                                    onClick={() => { setRenamingDept(dept); setRenameDeptValue(dept); }}
                                    className="p-1.5 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded transition-colors"
                                    title="Rename"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const usersInDept = getUsersByType('nizamat-in-charge').filter(u => u.department === dept).length;
                                      if (usersInDept > 0) {
                                        toast.error(`Cannot delete "${dept}" — ${usersInDept} user${usersInDept > 1 ? 's' : ''} assigned`);
                                        return;
                                      }
                                      if (confirm(`Delete department "${dept}"?`)) deleteDepartment(dept);
                                    }}
                                    className="p-1.5 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              {/* Locations */}
                              <div className="pl-1 space-y-1.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {(departments[dept] ?? []).map(loc => (
                                    <span key={loc} className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(dept, loc)}`}>
                                      {loc}
                                      <button
                                        onClick={() => deleteLocation(dept, loc)}
                                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
                                        title="Remove location"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                                {managingLocsDept === dept ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      autoFocus
                                      value={newLocValue}
                                      onChange={e => setNewLocValue(e.target.value)}
                                      placeholder="Location name..."
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          if (newLocValue.trim()) { addLocation(dept, newLocValue.trim()); setNewLocValue(''); }
                                          setManagingLocsDept(null);
                                        }
                                        if (e.key === 'Escape') { setManagingLocsDept(null); setNewLocValue(''); }
                                      }}
                                      className="flex-1 px-2 py-1 border border-[#D4CFC7] rounded text-xs focus:outline-none focus:border-[#2D5A45]"
                                    />
                                    <button
                                      onClick={() => {
                                        if (newLocValue.trim()) { addLocation(dept, newLocValue.trim()); setNewLocValue(''); }
                                        setManagingLocsDept(null);
                                      }}
                                      className="text-xs text-[#2D5A45] font-medium px-2 py-1 hover:bg-[#E8F5EE] rounded"
                                    >Add</button>
                                    <button onClick={() => { setManagingLocsDept(null); setNewLocValue(''); }} className="text-xs text-[#4A4A4A] px-2 py-1 hover:bg-gray-100 rounded">Cancel</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setManagingLocsDept(dept); setNewLocValue(''); }}
                                    className="text-xs text-[#2D5A45] hover:underline flex items-center gap-0.5"
                                  >
                                    <Plus className="w-3 h-3" /> Add location
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* ── DIVIDER ── */}
                <div className="py-6 px-1">
                  <div className="border-t border-gray-200" />
                </div>

                {/* ── SECTION B: Location Managers ── */}
                <Card className="shadow-sm">
                  <CardHeader className="bg-[#F9F8F6] py-3 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="w-4 h-4 text-[#2D5A45]" />
                        Location Managers
                        <Badge variant="outline" className="ml-1 text-xs bg-purple-50 text-purple-700 border-purple-200">
                          {getUsersByType('nizamat-in-charge').length}
                        </Badge>
                      </CardTitle>
                      <Button
                        onClick={() => openAddModal('nizamat-in-charge')}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Location Manager
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Search + Dept filter chips */}
                    <div className="px-4 py-3 border-b border-[#E8E3DB] flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                        <Input
                          placeholder="Search location managers..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['', ...departmentList].map(dept => (
                          <button
                            key={dept}
                            onClick={() => setSubDeptFilter(dept)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                              subDeptFilter === dept
                                ? 'bg-[#2D5A45] text-white'
                                : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                            }`}
                          >
                            {dept || 'All'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Location Managers table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-[#F9F8F6]">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Name</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Email</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Department</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Location</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Phone</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-[#1A1A1A]">Status</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-[#1A1A1A]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {filteredLocManagers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-[#4A4A4A]">
                                No location managers found.
                              </td>
                            </tr>
                          ) : (
                            filteredLocManagers.map((u) => (
                              <tr key={u.id} className="hover:bg-[#FAFAFA]">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                      {u.name.charAt(0)}
                                    </div>
                                    <span className="font-medium text-[#1A1A1A]">{u.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A] text-sm">{u.email}</td>
                                <td className="px-4 py-3">
                                  {u.department ? (
                                    <Badge variant="outline" className={getDeptBadgeCls(u.department ?? '')}>
                                      {u.department}
                                    </Badge>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {u.location ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(u.department ?? '', u.location)}`}>
                                      {u.location}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{u.phone || '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={u.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                                    {u.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleToggleStatus(u)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={u.isActive ? 'Deactivate' : 'Activate'}>
                                      {u.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                                    </button>
                                    <button onClick={() => openEditModal(u)} className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(u)} className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors" title="Delete">
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
                  </CardContent>
                </Card>
              </div>
            ) : (
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
            )}

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
                {editingUser ? 'Edit' : 'Add'} {USER_TYPE_LABELS[modalUserType]}
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

              {modalUserType === 'nizamat-in-charge' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Department *</Label>
                    <select
                      value={formData.department}
                      onChange={e => setFormData({ ...formData, department: e.target.value, location: '' })}
                      className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                    >
                      <option value="">— Select department —</option>
                      {departmentList.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Location *</Label>
                    <select
                      value={formData.location}
                      onChange={e => setFormData({ ...formData, location: e.target.value })}
                      disabled={!formData.department}
                      className={`w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11 ${!formData.department ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="">— Select location —</option>
                      {(departments[formData.department] ?? []).map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {modalUserType === 'coordinator' && (
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
